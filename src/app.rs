use std::path::PathBuf;
use std::sync::mpsc;
use std::thread;
use std::time::Instant;
use eframe::egui;
use crate::agent::{AgentBackend, ClaudeCode, FixRequest};
use crate::diff::{Diff, LineKind};
use crate::vcs::{self, VcsBackend};
use crate::state::{AppState, DiffMode};
use crate::syntax::DiffHighlighter;
use crate::ui::{DiffPanel, FileTreePanel, CommandPalette, PaletteAction};

/// Result from async git operations
enum DiffResult {
    Unstaged(Result<Diff, String>),
    Staged(Result<Diff, String>),
}

/// Result from async agent operations
type AgentResult = Result<String, String>;

pub struct App {
    // Core state (business logic)
    state: AppState,

    // UI components
    diff_panel: DiffPanel,
    highlighter: DiffHighlighter,
    file_tree: FileTreePanel,
    command_palette: CommandPalette,

    // VCS backend (main thread only - threads create their own)
    vcs: Box<dyn VcsBackend>,

    // Async channels for git operations
    git_rx: mpsc::Receiver<DiffResult>,
    git_tx: mpsc::Sender<DiffResult>,

    // Async channels for agent operations
    agent_rx: mpsc::Receiver<AgentResult>,
    agent_tx: mpsc::Sender<AgentResult>,

    // Agent backend
    agent: ClaudeCode,

    // FPS tracking
    last_frame: Instant,
    fps: f32,
}

impl App {
    pub fn new(_cc: &eframe::CreationContext<'_>) -> Self {
        let repo_path = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
        let (git_tx, git_rx) = mpsc::channel();
        let (agent_tx, agent_rx) = mpsc::channel();

        let vcs: Box<dyn VcsBackend> = Box::new(
            vcs::GitBackend::new(&repo_path).expect("Failed to open repository")
        );

        let mut app = Self {
            state: AppState::new(repo_path.clone()),
            diff_panel: DiffPanel::new(),
            highlighter: DiffHighlighter::new(),
            file_tree: FileTreePanel::new(),
            command_palette: CommandPalette::new(),
            vcs,
            git_rx,
            git_tx,
            agent_rx,
            agent_tx,
            agent: ClaudeCode,
            last_frame: Instant::now(),
            fps: 0.0,
        };
        app.refresh();
        app
    }

    fn refresh(&mut self) {
        self.state.clear_error();
        self.state.loading = true;
        self.diff_panel.reset_file_idx();

        // Spawn background threads for git operations
        // Each thread creates its own VCS backend instance
        let tx_unstaged = self.git_tx.clone();
        let tx_staged = self.git_tx.clone();
        let repo_path = self.state.repo_path.clone();
        let repo_path2 = self.state.repo_path.clone();

        // Spawn unstaged diff computation
        thread::spawn(move || {
            let result = vcs::GitBackend::new(&repo_path)
                .and_then(|vcs| vcs.get_working_tree_diff(false))
                .map(|s| Diff::parse(&s))
                .map_err(|e| e.to_string());
            let _ = tx_unstaged.send(DiffResult::Unstaged(result));
        });

        // Spawn staged diff computation
        thread::spawn(move || {
            let result = vcs::GitBackend::new(&repo_path2)
                .and_then(|vcs| vcs.get_working_tree_diff(true))
                .map(|s| Diff::parse(&s))
                .map_err(|e| e.to_string());
            let _ = tx_staged.send(DiffResult::Staged(result));
        });
    }

    fn poll_git_results(&mut self) {
        let mut received_any = false;

        // Non-blocking receive
        while let Ok(result) = self.git_rx.try_recv() {
            received_any = true;
            match result {
                DiffResult::Unstaged(Ok(diff)) => {
                    self.state.unstaged_diff = diff;
                }
                DiffResult::Unstaged(Err(e)) => {
                    self.state.set_error(format!("Unstaged: {}", e));
                }
                DiffResult::Staged(Ok(diff)) => {
                    self.state.staged_diff = diff;
                }
                DiffResult::Staged(Err(e)) => {
                    self.state.set_error(format!("Staged: {}", e));
                }
            }
        }

        // Mark loading complete when we've received results
        if self.state.loading && received_any {
            self.state.loading = false;
        }
    }

    fn build_fix_request(&self) -> FixRequest {
        let diff = self.state.current_diff();

        // Collect file indices that have comments
        let commented_file_idxs: std::collections::HashSet<usize> = self.state.comments
            .all_comments()
            .map(|(line_id, _)| line_id.file_idx)
            .collect();

        // Gather ALL comments across all files
        let comments: Vec<(PathBuf, String)> = self.state.comments
            .all_comments()
            .flat_map(|(line_id, cmts)| {
                let file_path = diff.files.get(line_id.file_idx)
                    .map(|f| f.path.clone())
                    .unwrap_or_default();
                cmts.iter().map(move |c| (file_path.clone(), c.text.clone()))
            })
            .collect();

        // Serialize diff for files with comments
        let diff_content = diff.files.iter()
            .enumerate()
            .filter(|(idx, _)| commented_file_idxs.contains(idx))
            .map(|(_, file)| {
                let mut lines = vec![format!("--- a/{}", file.path.display())];
                lines.push(format!("+++ b/{}", file.path.display()));
                for hunk in &file.hunks {
                    lines.push(hunk.header());
                    for line in &hunk.lines {
                        let prefix = match line.kind {
                            LineKind::Added => "+",
                            LineKind::Removed => "-",
                            LineKind::Context => " ",
                        };
                        lines.push(format!("{}{}", prefix, line.content));
                    }
                }
                lines.join("\n")
            })
            .collect::<Vec<_>>()
            .join("\n\n");

        FixRequest {
            diff_content,
            comments,
            instruction: if self.state.claude_prompt.is_empty() {
                None
            } else {
                Some(self.state.claude_prompt.clone())
            },
        }
    }

    fn send_to_agent(&mut self) {
        let req = self.build_fix_request();
        self.state.claude_loading = true;
        self.state.claude_response = None;
        let tx = self.agent_tx.clone();

        // Use trait method via instance
        thread::spawn(move || {
            let agent = ClaudeCode;
            let result = agent.send(&req)
                .map_err(|e| e.to_string());
            let _ = tx.send(result);
        });
    }

    fn poll_agent_response(&mut self) {
        if let Ok(result) = self.agent_rx.try_recv() {
            self.state.claude_loading = false;
            match result {
                Ok(resp) => self.state.claude_response = Some(resp),
                Err(e) => self.state.claude_response = Some(format!("Error: {}", e)),
            }
        }
    }
}

impl eframe::App for App {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        // Update FPS
        let now = Instant::now();
        let dt = now.duration_since(self.last_frame).as_secs_f32();
        self.last_frame = now;
        // Smooth FPS with exponential moving average
        self.fps = self.fps * 0.9 + (1.0 / dt) * 0.1;

        // Poll for async results
        self.poll_git_results();
        self.poll_agent_response();

        // Request repaint while loading
        if self.state.loading || self.state.claude_loading {
            ctx.request_repaint();
        }

        // Use raw scroll delta instead of smooth (removes inertia)
        ctx.input_mut(|i| {
            i.smooth_scroll_delta = i.raw_scroll_delta * 2.0;
        });

        // Handle keyboard shortcuts
        let file_count = self.state.current_diff().files.len();

        // Cmd+B: Toggle file tree
        if ctx.input(|i| i.modifiers.command && i.key_pressed(egui::Key::B)) {
            self.file_tree.toggle();
        }

        // Cmd+K: Open command palette with fresh file list
        if ctx.input(|i| i.modifiers.command && i.key_pressed(egui::Key::K)) {
            // Fetch changed files in working tree
            if let Ok(files) = self.vcs.get_working_tree_changed_files() {
                let paths: Vec<PathBuf> = files.iter().map(PathBuf::from).collect();
                self.command_palette.set_file_items(paths);
            }
            self.command_palette.toggle();
        }

        // j/k file navigation (only when palette closed and no text input focused)
        let has_focus = ctx.memory(|m| m.focused().is_some());
        if !self.command_palette.open && !has_focus && file_count > 0 {
            if ctx.input(|i| i.key_pressed(egui::Key::J)) {
                self.diff_panel.next_file(file_count);
            }
            if ctx.input(|i| i.key_pressed(egui::Key::K)) {
                self.diff_panel.prev_file();
            }
        }

        // Track previous mode to detect changes
        let prev_mode = self.state.mode;

        egui::TopBottomPanel::top("toolbar").show(ctx, |ui| {
            ui.horizontal(|ui| {
                ui.heading("Agent Leash");
                ui.separator();

                // Mode toggle
                ui.selectable_value(&mut self.state.mode, DiffMode::Unstaged,
                    format!("Unstaged ({})", self.state.unstaged_diff.files.len()));
                ui.selectable_value(&mut self.state.mode, DiffMode::Staged,
                    format!("Staged ({})", self.state.staged_diff.files.len()));

                ui.separator();

                let refresh_enabled = !self.state.loading;
                if ui.add_enabled(refresh_enabled, egui::Button::new("⟳ Refresh")).clicked() {
                    self.refresh();
                }

                if self.state.loading {
                    ui.spinner();
                }

                ui.separator();
                let comment_count = self.state.comments.comment_count();
                ui.label(format!("Comments: {}", comment_count));

                // Agent send section
                if comment_count > 0 {
                    ui.add(egui::TextEdit::singleline(&mut self.state.claude_prompt)
                        .hint_text("Optional instruction...")
                        .desired_width(200.0));

                    let send_enabled = !self.state.claude_loading;
                    if ui.add_enabled(send_enabled, egui::Button::new("Send to Claude")).clicked() {
                        self.send_to_agent();
                    }

                    if self.state.claude_loading {
                        ui.spinner();
                    }
                }

                // File position indicator
                let files = &self.state.current_diff().files;
                if !files.is_empty() {
                    ui.separator();
                    let idx = self.diff_panel.current_file_idx;
                    ui.label(format!("File {}/{}", idx + 1, files.len()));
                    if let Some(file) = files.get(idx) {
                        ui.label(egui::RichText::new(file.path.display().to_string())
                            .monospace()
                            .color(egui::Color32::LIGHT_BLUE));
                    }
                }

                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    // FPS counter
                    let fps_color = if self.fps >= 55.0 {
                        egui::Color32::GREEN
                    } else if self.fps >= 30.0 {
                        egui::Color32::YELLOW
                    } else {
                        egui::Color32::RED
                    };
                    ui.label(egui::RichText::new(format!("{:.0} fps", self.fps))
                        .small()
                        .color(fps_color));
                    ui.separator();

                    ui.label(egui::RichText::new(self.state.repo_path.display().to_string())
                        .small()
                        .color(egui::Color32::GRAY));
                });
            });
        });

        // Reset file index when mode changes
        if self.state.mode != prev_mode {
            self.diff_panel.reset_file_idx();
        }

        if let Some(ref error) = self.state.error {
            egui::TopBottomPanel::bottom("error").show(ctx, |ui| {
                ui.colored_label(egui::Color32::RED, error);
            });
        }

        // File tree side panel
        let mut file_tree_nav: Option<usize> = None;
        if self.file_tree.visible {
            let diff = match self.state.mode {
                DiffMode::Unstaged => &self.state.unstaged_diff,
                DiffMode::Staged => &self.state.staged_diff,
            };
            self.file_tree.update_from_diff(diff);
            let current_file_idx = self.diff_panel.current_file_idx;
            let file_paths: Vec<_> = diff.files.iter().map(|f| f.path.clone()).collect();

            egui::SidePanel::left("file_tree")
                .default_width(220.0)
                .resizable(true)
                .show(ctx, |ui| {
                    let diff = match self.state.mode {
                        DiffMode::Unstaged => &self.state.unstaged_diff,
                        DiffMode::Staged => &self.state.staged_diff,
                    };
                    if let Some(clicked_path) = self.file_tree.show(ui, current_file_idx, diff) {
                        // Find file index by path and navigate
                        if let Some(idx) = file_paths.iter().position(|p| *p == clicked_path) {
                            file_tree_nav = Some(idx);
                        }
                    }
                });
        }
        if let Some(idx) = file_tree_nav {
            self.diff_panel.current_file_idx = idx;
        }

        // Agent response panel
        if self.state.claude_response.is_some() {
            egui::SidePanel::right("agent_response")
                .default_width(400.0)
                .show(ctx, |ui| {
                    ui.horizontal(|ui| {
                        ui.heading("Agent Response");
                        if ui.button("Close").clicked() {
                            self.state.claude_response = None;
                        }
                    });
                    ui.separator();
                    egui::ScrollArea::vertical().show(ui, |ui| {
                        ui.label(self.state.claude_response.as_ref().unwrap());
                    });
                });
        }

        egui::CentralPanel::default().frame(egui::Frame::none()).show(ctx, |ui| {
            // Show loading state
            if self.state.loading {
                ui.centered_and_justified(|ui| {
                    ui.vertical_centered(|ui| {
                        ui.spinner();
                        ui.add_space(8.0);
                        ui.label(egui::RichText::new("Loading diff...")
                            .size(16.0)
                            .color(egui::Color32::GRAY));
                    });
                });
                return;
            }

            let diff = match self.state.mode {
                DiffMode::Unstaged => &self.state.unstaged_diff,
                DiffMode::Staged => &self.state.staged_diff,
            };

            if diff.files.is_empty() {
                ui.centered_and_justified(|ui| {
                    ui.label(egui::RichText::new("No changes")
                        .size(20.0)
                        .color(egui::Color32::GRAY));
                });
            } else {
                self.diff_panel.show(ui, diff, &mut self.state.comments, &self.highlighter);
            }
        });

        // Command palette overlay (rendered last, on top)
        if let Some(action) = self.command_palette.show(ctx) {
            match action {
                PaletteAction::GoToFile(path) => {
                    // Find file in current diff and navigate to it
                    let diff = self.state.current_diff();
                    if let Some(idx) = diff.files.iter().position(|f| f.path == path) {
                        self.diff_panel.current_file_idx = idx;
                    }
                }
                PaletteAction::Command(_cmd) => {
                    // Future: handle commands
                }
            }
        }
    }
}
