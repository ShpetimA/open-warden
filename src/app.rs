use std::path::PathBuf;
use std::sync::mpsc;
use std::thread;
use eframe::egui;
use crate::diff::Diff;
use crate::git;
use crate::syntax::DiffHighlighter;
use crate::ui::{DiffPanel, CommentStore};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DiffMode {
    Unstaged,
    Staged,
}

/// Result from async git operations
enum DiffResult {
    Unstaged(Result<Diff, String>),
    Staged(Result<Diff, String>),
}

pub struct App {
    repo_path: PathBuf,
    mode: DiffMode,
    staged_diff: Diff,
    unstaged_diff: Diff,
    diff_panel: DiffPanel,
    comments: CommentStore,
    highlighter: DiffHighlighter,
    error: Option<String>,

    // Async state
    loading: bool,
    rx: mpsc::Receiver<DiffResult>,
    tx: mpsc::Sender<DiffResult>,
}

impl App {
    pub fn new(_cc: &eframe::CreationContext<'_>) -> Self {
        let repo_path = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
        let (tx, rx) = mpsc::channel();

        let mut app = Self {
            repo_path,
            mode: DiffMode::Unstaged,
            staged_diff: Diff::default(),
            unstaged_diff: Diff::default(),
            diff_panel: DiffPanel::new(),
            comments: CommentStore::new(),
            highlighter: DiffHighlighter::new(),
            error: None,
            loading: false,
            rx,
            tx,
        };
        app.refresh();
        app
    }

    fn refresh(&mut self) {
        self.error = None;
        self.loading = true;

        // Spawn background threads for git operations
        let tx_unstaged = self.tx.clone();
        let tx_staged = self.tx.clone();
        let repo_path = self.repo_path.clone();
        let repo_path2 = self.repo_path.clone();

        // Spawn unstaged diff computation
        thread::spawn(move || {
            let result = git::diff_unstaged(&repo_path)
                .map_err(|e| e.to_string());
            let _ = tx_unstaged.send(DiffResult::Unstaged(result));
        });

        // Spawn staged diff computation
        thread::spawn(move || {
            let result = git::diff_staged(&repo_path2)
                .map_err(|e| e.to_string());
            let _ = tx_staged.send(DiffResult::Staged(result));
        });
    }

    fn poll_results(&mut self) {
        let mut received_any = false;

        // Non-blocking receive
        while let Ok(result) = self.rx.try_recv() {
            received_any = true;
            match result {
                DiffResult::Unstaged(Ok(diff)) => {
                    self.unstaged_diff = diff;
                }
                DiffResult::Unstaged(Err(e)) => {
                    self.set_error(format!("Unstaged: {}", e));
                }
                DiffResult::Staged(Ok(diff)) => {
                    self.staged_diff = diff;
                }
                DiffResult::Staged(Err(e)) => {
                    self.set_error(format!("Staged: {}", e));
                }
            }
        }

        // Mark loading complete when we've received results
        if self.loading && received_any {
            self.loading = false;
        }
    }

    fn set_error(&mut self, msg: String) {
        if let Some(ref mut err) = self.error {
            err.push_str(&format!("\n{}", msg));
        } else {
            self.error = Some(msg);
        }
    }

    fn current_diff(&self) -> &Diff {
        match self.mode {
            DiffMode::Unstaged => &self.unstaged_diff,
            DiffMode::Staged => &self.staged_diff,
        }
    }
}

impl eframe::App for App {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        // Poll for async results
        self.poll_results();

        // Request repaint while loading
        if self.loading {
            ctx.request_repaint();
        }

        // Use raw scroll delta instead of smooth (removes inertia)
        ctx.input_mut(|i| {
            i.smooth_scroll_delta = i.raw_scroll_delta;
        });

        ctx.options_mut(|options| {
            options.line_scroll_speed = 100.0;
        });

        egui::TopBottomPanel::top("toolbar").show(ctx, |ui| {
            ui.horizontal(|ui| {
                ui.heading("Agent Leash");
                ui.separator();

                // Mode toggle
                ui.selectable_value(&mut self.mode, DiffMode::Unstaged,
                    format!("Unstaged ({})", self.unstaged_diff.files.len()));
                ui.selectable_value(&mut self.mode, DiffMode::Staged,
                    format!("Staged ({})", self.staged_diff.files.len()));

                ui.separator();

                let refresh_enabled = !self.loading;
                if ui.add_enabled(refresh_enabled, egui::Button::new("⟳ Refresh")).clicked() {
                    self.refresh();
                }

                if self.loading {
                    ui.spinner();
                }

                ui.separator();
                ui.label(format!("Comments: {}", self.comments.comment_count()));

                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    ui.label(egui::RichText::new(self.repo_path.display().to_string())
                        .small()
                        .color(egui::Color32::GRAY));
                });
            });
        });

        if let Some(ref error) = self.error {
            egui::TopBottomPanel::bottom("error").show(ctx, |ui| {
                ui.colored_label(egui::Color32::RED, error);
            });
        }

        egui::CentralPanel::default().frame(egui::Frame::none()).show(ctx, |ui| {
            // Show loading state
            if self.loading {
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

            let diff = match self.mode {
                DiffMode::Unstaged => &self.unstaged_diff,
                DiffMode::Staged => &self.staged_diff,
            };

            if diff.files.is_empty() {
                ui.centered_and_justified(|ui| {
                    ui.label(egui::RichText::new("No changes")
                        .size(20.0)
                        .color(egui::Color32::GRAY));
                });
            } else {
                self.diff_panel.show(ui, diff, &mut self.comments, &self.highlighter);
            }
        });
    }
}
