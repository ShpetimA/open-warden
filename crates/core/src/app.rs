use std::path::PathBuf;
use std::sync::mpsc;
use std::thread;
use std::time::Instant;
use eframe::egui;
use crate::agent::{AgentBackend, ClaudeCode, FixRequest};
use crate::diff::{Diff, LineKind};
use crate::vcs::{self, VcsBackend};
use crate::state::{AppState, DiffMode, StackedState};
use crate::syntax::DiffHighlighter;
use crate::ui::{DiffPanel, DiffAction, FileTreePanel, CommandPalette, PaletteAction, CommitPanel, CommitEntry, CommitDialog, CommitDialogResult, WorkspacePanel, WorkspaceAction};
use crate::workspace::WorkspaceConfig;

/// Result from async git operations
enum GitResult {
    Unstaged(Result<Diff, String>),
    Staged(Result<Diff, String>),
    CommitLog(Result<String, String>),
    CommitDiff(String, Result<Diff, String>), // commit_id, diff
    StackedCommits(Result<(String, String, Vec<vcs::StackedCommitInfo>), String>), // from, to, commits
    FileStaged(Result<(), String>),
    FileUnstaged(Result<(), String>),
    Committed(Result<String, String>), // commit SHA
    StagedFiles(Result<Vec<PathBuf>, String>),
}

/// Result from async agent operations
type AgentResult = Result<String, String>;

pub struct App {
    // Core state (business logic)
    state: AppState,

    // Workspace
    workspace: WorkspaceConfig,
    workspace_panel: WorkspacePanel,

    // UI components
    diff_panel: DiffPanel,
    highlighter: DiffHighlighter,
    file_tree: FileTreePanel,
    command_palette: CommandPalette,
    commit_panel: CommitPanel,
    commit_dialog: CommitDialog,

    // Staged files cache (for commit dialog)
    staged_files_cache: Vec<PathBuf>,

    // Stacked diff input
    stacked_range_input: String,
    show_stacked_input: bool,

    // VCS backend (main thread only - threads create their own)
    vcs: Box<dyn VcsBackend>,

    // Branch info
    branch_name: Option<String>,
    vcs_name: String,

    // Async channels for git operations
    git_rx: mpsc::Receiver<GitResult>,
    git_tx: mpsc::Sender<GitResult>,

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
        let (git_tx, git_rx) = mpsc::channel();
        let (agent_tx, agent_rx) = mpsc::channel();

        // Load workspace config
        let mut workspace = WorkspaceConfig::load();

        // If workspace is empty, try to add current directory
        if workspace.is_empty() {
            let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
            if workspace.add_repo(cwd).is_ok() {
                workspace.save();
            }
        }

        // Get active repo path, or fall back to current directory
        let repo_path = workspace
            .active_repo()
            .map(|r| r.path.clone())
            .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")));

        // Open VCS backend for active repo
        let vcs: Box<dyn VcsBackend> = vcs::get_backend(&repo_path, None)
            .unwrap_or_else(|_| Box::new(vcs::GitBackend::new(&repo_path).expect("Failed to open repository")));

        let branch_name = vcs.get_current_branch().ok().flatten();
        let vcs_name = vcs.name().to_string();

        let mut app = Self {
            state: AppState::new(),
            workspace,
            workspace_panel: WorkspacePanel::new(),
            diff_panel: DiffPanel::new(),
            highlighter: DiffHighlighter::new(),
            file_tree: FileTreePanel::new(),
            command_palette: CommandPalette::new(),
            commit_panel: CommitPanel::new(),
            commit_dialog: CommitDialog::new(),
            staged_files_cache: Vec::new(),
            stacked_range_input: String::new(),
            show_stacked_input: false,
            vcs,
            branch_name,
            vcs_name,
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

        // Refresh branch info
        self.branch_name = self.vcs.get_current_branch().ok().flatten();

        // Get repo path from workspace
        let Some(repo) = self.workspace.active_repo() else {
            self.state.loading = false;
            return;
        };
        let repo_path = repo.path.clone();

        // Spawn background threads for git operations
        // Each thread creates its own VCS backend instance
        let tx_unstaged = self.git_tx.clone();
        let tx_staged = self.git_tx.clone();
        let repo_path2 = repo_path.clone();

        // Spawn unstaged diff computation
        thread::spawn(move || {
            let result = vcs::get_backend(&repo_path, None)
                .and_then(|vcs| vcs.get_working_tree_diff(false))
                .map(|s| Diff::parse(&s))
                .map_err(|e| e.to_string());
            let _ = tx_unstaged.send(GitResult::Unstaged(result));
        });

        // Spawn staged diff computation
        thread::spawn(move || {
            let result = vcs::get_backend(&repo_path2, None)
                .and_then(|vcs| vcs.get_working_tree_diff(true))
                .map(|s| Diff::parse(&s))
                .map_err(|e| e.to_string());
            let _ = tx_staged.send(GitResult::Staged(result));
        });
    }

    fn poll_git_results(&mut self) {
        let mut received_any = false;

        // Non-blocking receive
        while let Ok(result) = self.git_rx.try_recv() {
            received_any = true;
            match result {
                GitResult::Unstaged(Ok(diff)) => {
                    self.state.unstaged_diff = diff;
                }
                GitResult::Unstaged(Err(e)) => {
                    self.state.set_error(format!("Unstaged: {}", e));
                }
                GitResult::Staged(Ok(diff)) => {
                    self.state.staged_diff = diff;
                }
                GitResult::Staged(Err(e)) => {
                    self.state.set_error(format!("Staged: {}", e));
                }
                GitResult::CommitLog(Ok(log)) => {
                    let entries = CommitEntry::parse_log(&log);
                    self.commit_panel.set_commits(entries);
                }
                GitResult::CommitLog(Err(e)) => {
                    self.state.set_error(format!("Commit log: {}", e));
                    self.commit_panel.loading = false;
                }
                GitResult::CommitDiff(commit_id, Ok(diff)) => {
                    // If in stacked mode and this is the current commit, update the diff
                    if let Some(ref mut stacked) = self.state.stacked_state {
                        if stacked.current_commit().map(|c| &c.commit_id) == Some(&commit_id) {
                            stacked.current_diff = diff;
                        }
                    }
                }
                GitResult::CommitDiff(_commit_id, Err(e)) => {
                    self.state.set_error(format!("Commit diff: {}", e));
                }
                GitResult::StackedCommits(Ok((from, to, commits))) => {
                    self.state.stacked_state = Some(StackedState::new(from, to, commits));
                    self.state.mode = DiffMode::Stacked;
                    // Fetch first commit's diff
                    self.fetch_stacked_current_diff();
                }
                GitResult::StackedCommits(Err(e)) => {
                    self.state.set_error(format!("Stacked commits: {}", e));
                }
                GitResult::FileStaged(Ok(())) => {
                    // File staged successfully, refresh diffs
                    self.refresh();
                }
                GitResult::FileStaged(Err(e)) => {
                    self.state.set_error(format!("Stage failed: {}", e));
                }
                GitResult::FileUnstaged(Ok(())) => {
                    // File unstaged successfully, refresh diffs
                    self.refresh();
                }
                GitResult::FileUnstaged(Err(e)) => {
                    self.state.set_error(format!("Unstage failed: {}", e));
                }
                GitResult::Committed(Ok(sha)) => {
                    // Commit successful, refresh diffs
                    self.state.clear_error();
                    self.commit_dialog.close();
                    // Show brief success message (will be cleared on next action)
                    self.state.set_error(format!("Committed: {}", &sha[..7.min(sha.len())]));
                    self.refresh();
                }
                GitResult::Committed(Err(e)) => {
                    self.state.set_error(format!("Commit failed: {}", e));
                }
                GitResult::StagedFiles(Ok(files)) => {
                    self.staged_files_cache = files;
                }
                GitResult::StagedFiles(Err(e)) => {
                    self.state.set_error(format!("Failed to get staged files: {}", e));
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

    fn fetch_commit_log(&mut self) {
        let Some(repo) = self.workspace.active_repo() else { return };
        let repo_path = repo.path.clone();

        self.commit_panel.loading = true;
        let tx = self.git_tx.clone();

        thread::spawn(move || {
            let result = vcs::get_backend(&repo_path, None)
                .and_then(|vcs| vcs.get_commit_log_for_fzf())
                .map_err(|e| e.to_string());
            let _ = tx.send(GitResult::CommitLog(result));
        });
    }

    fn fetch_commit_diff(&mut self, commit_id: String) {
        let Some(repo) = self.workspace.active_repo() else { return };
        let repo_path = repo.path.clone();

        let tx = self.git_tx.clone();
        let cid = commit_id.clone();

        thread::spawn(move || {
            let result = vcs::get_backend(&repo_path, None)
                .and_then(|vcs| vcs.get_commit(&cid))
                .map(|info| Diff::parse(&info.diff))
                .map_err(|e| e.to_string());
            let _ = tx.send(GitResult::CommitDiff(commit_id, result));
        });
    }

    fn fetch_stacked_commits(&mut self, range: &str) {
        let Some(repo) = self.workspace.active_repo() else { return };
        let repo_path = repo.path.clone();

        // Parse range like "main..HEAD" or "abc123..def456"
        let parts: Vec<&str> = range.split("..").collect();
        if parts.len() != 2 {
            self.state.set_error("Invalid range format. Use: from..to".to_string());
            return;
        }

        let from = parts[0].trim().to_string();
        let to = parts[1].trim().to_string();
        let tx = self.git_tx.clone();
        let from_clone = from.clone();
        let to_clone = to.clone();

        thread::spawn(move || {
            let result = vcs::get_backend(&repo_path, None)
                .and_then(|vcs| vcs.get_commits_in_range(&from_clone, &to_clone))
                .map(|commits| (from, to, commits))
                .map_err(|e| e.to_string());
            let _ = tx.send(GitResult::StackedCommits(result));
        });
    }

    fn fetch_stacked_current_diff(&mut self) {
        if let Some(ref stacked) = self.state.stacked_state {
            if let Some(commit) = stacked.current_commit() {
                self.fetch_commit_diff(commit.commit_id.clone());
            }
        }
    }

    fn exit_stacked_mode(&mut self) {
        self.state.stacked_state = None;
        self.state.mode = DiffMode::Unstaged;
        self.diff_panel.reset_file_idx();
    }

    fn stage_file(&mut self, path: PathBuf) {
        let Some(repo) = self.workspace.active_repo() else { return };
        let repo_path = repo.path.clone();
        let tx = self.git_tx.clone();

        thread::spawn(move || {
            let result = vcs::get_backend(&repo_path, None)
                .and_then(|vcs| vcs.stage_file(&path))
                .map_err(|e| e.to_string());
            let _ = tx.send(GitResult::FileStaged(result));
        });
    }

    fn unstage_file(&mut self, path: PathBuf) {
        let Some(repo) = self.workspace.active_repo() else { return };
        let repo_path = repo.path.clone();
        let tx = self.git_tx.clone();

        thread::spawn(move || {
            let result = vcs::get_backend(&repo_path, None)
                .and_then(|vcs| vcs.unstage_file(&path))
                .map_err(|e| e.to_string());
            let _ = tx.send(GitResult::FileUnstaged(result));
        });
    }

    fn do_commit(&mut self, message: String) {
        let Some(repo) = self.workspace.active_repo() else { return };
        let repo_path = repo.path.clone();
        let tx = self.git_tx.clone();

        thread::spawn(move || {
            let result = vcs::get_backend(&repo_path, None)
                .and_then(|vcs| vcs.commit(&message))
                .map_err(|e| e.to_string());
            let _ = tx.send(GitResult::Committed(result));
        });
    }

    fn fetch_staged_files(&mut self) {
        let Some(repo) = self.workspace.active_repo() else { return };
        let repo_path = repo.path.clone();
        let tx = self.git_tx.clone();

        thread::spawn(move || {
            let result = vcs::get_backend(&repo_path, None)
                .and_then(|vcs| vcs.get_staged_files())
                .map_err(|e| e.to_string());
            let _ = tx.send(GitResult::StagedFiles(result));
        });
    }

    fn open_commit_dialog(&mut self) {
        // Fetch staged files before opening dialog
        self.fetch_staged_files();
        self.commit_dialog.open();
    }

    /// Switch to a different repository in the workspace.
    fn switch_repo(&mut self, idx: usize) {
        if idx >= self.workspace.repos.len() {
            return;
        }

        self.workspace.set_active(idx);
        self.workspace.save();

        // Get new repo path
        let Some(repo) = self.workspace.active_repo() else { return };
        let repo_path = repo.path.clone();

        // Create new VCS backend
        match vcs::get_backend(&repo_path, None) {
            Ok(new_vcs) => {
                self.vcs = new_vcs;
                self.branch_name = self.vcs.get_current_branch().ok().flatten();
                self.vcs_name = self.vcs.name().to_string();
            }
            Err(e) => {
                self.state.set_error(format!("Failed to open repo: {}", e));
                return;
            }
        }

        // Reset app state (comments/stacked state discarded)
        self.state = AppState::new();
        self.diff_panel.reset_file_idx();
        self.commit_panel.clear();
        self.workspace_panel.clear_state();

        // Refresh diffs
        self.refresh();
    }

    /// Add a new repository to the workspace.
    fn add_repo(&mut self, path: PathBuf) {
        match self.workspace.add_repo(path) {
            Ok(()) => {
                self.workspace.save();
                // Optionally switch to new repo
                let new_idx = self.workspace.repos.len() - 1;
                self.switch_repo(new_idx);
            }
            Err(e) => {
                self.state.set_error(format!("Failed to add repo: {}", e));
            }
        }
    }

    /// Remove a repository from the workspace.
    fn remove_repo(&mut self, idx: usize) {
        let was_active = idx == self.workspace.active_idx;
        self.workspace.remove_repo(idx);
        self.workspace.save();

        // If we removed the active repo, switch to the new active
        if was_active && !self.workspace.is_empty() {
            self.switch_repo(self.workspace.active_idx);
        }
    }

    /// Open native file picker to add a repository.
    fn open_add_repo_dialog(&mut self) {
        // Use rfd for native file picker
        if let Some(path) = rfd::FileDialog::new()
            .set_title("Select Repository Directory")
            .pick_folder()
        {
            self.add_repo(path);
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

        // Cmd+L: Toggle commit history panel (L for log)
        if ctx.input(|i| i.modifiers.command && i.key_pressed(egui::Key::L)) {
            self.commit_panel.toggle();
            if self.commit_panel.visible && self.commit_panel.commits.is_empty() {
                self.fetch_commit_log();
            }
        }

        // Cmd+G: Open stacked diff input (G for git range)
        if ctx.input(|i| i.modifiers.command && i.key_pressed(egui::Key::G)) {
            self.show_stacked_input = !self.show_stacked_input;
            if self.show_stacked_input {
                // Use HEAD~5..HEAD as default - works in any repo
                self.stacked_range_input = "HEAD~5..HEAD".to_string();
            }
        }

        // Cmd+Enter: Open commit dialog (when staged files exist)
        if ctx.input(|i| i.modifiers.command && i.key_pressed(egui::Key::Enter)) {
            if !self.commit_dialog.visible {
                self.open_commit_dialog();
            }
        }

        // Cmd+Shift+O: Open workspace switcher in command palette
        if ctx.input(|i| i.modifiers.command && i.modifiers.shift && i.key_pressed(egui::Key::O)) {
            // Populate command palette with workspace repos
            let repos: Vec<_> = self.workspace.repos.iter()
                .enumerate()
                .map(|(idx, r)| (idx, r.name.clone(), r.path.clone()))
                .collect();
            self.command_palette.set_workspace_items(repos);
            self.command_palette.toggle();
        }

        // Cmd+[ / Cmd+]: Switch to prev/next project tab
        if ctx.input(|i| i.modifiers.command && i.key_pressed(egui::Key::OpenBracket)) {
            if self.workspace.active_idx > 0 {
                let new_idx = self.workspace.active_idx - 1;
                self.switch_repo(new_idx);
            }
        }
        if ctx.input(|i| i.modifiers.command && i.key_pressed(egui::Key::CloseBracket)) {
            if self.workspace.active_idx + 1 < self.workspace.repos.len() {
                let new_idx = self.workspace.active_idx + 1;
                self.switch_repo(new_idx);
            }
        }

        // Cmd+1-9: Switch to project tab by number
        for (key, num) in [
            (egui::Key::Num1, 0),
            (egui::Key::Num2, 1),
            (egui::Key::Num3, 2),
            (egui::Key::Num4, 3),
            (egui::Key::Num5, 4),
            (egui::Key::Num6, 5),
            (egui::Key::Num7, 6),
            (egui::Key::Num8, 7),
            (egui::Key::Num9, 8),
        ] {
            if ctx.input(|i| i.modifiers.command && i.key_pressed(key)) {
                if num < self.workspace.repos.len() && num != self.workspace.active_idx {
                    self.switch_repo(num);
                }
                break;
            }
        }

        // Escape: Exit stacked mode or close dialogs
        if ctx.input(|i| i.key_pressed(egui::Key::Escape)) {
            if self.show_stacked_input {
                self.show_stacked_input = false;
            } else if self.state.mode == DiffMode::Stacked {
                self.exit_stacked_mode();
            }
        }

        // j/k navigation (context-dependent)
        let has_focus = ctx.memory(|m| m.focused().is_some());
        if !self.command_palette.open && !has_focus {
            if self.state.mode == DiffMode::Stacked {
                // In stacked mode: j/k navigates commits
                if ctx.input(|i| i.key_pressed(egui::Key::J)) {
                    if let Some(ref mut stacked) = self.state.stacked_state {
                        if stacked.next() {
                            self.fetch_stacked_current_diff();
                            self.diff_panel.reset_file_idx();
                        }
                    }
                }
                if ctx.input(|i| i.key_pressed(egui::Key::K)) {
                    if let Some(ref mut stacked) = self.state.stacked_state {
                        if stacked.prev() {
                            self.fetch_stacked_current_diff();
                            self.diff_panel.reset_file_idx();
                        }
                    }
                }
                // n/p for file navigation in stacked mode
                if file_count > 0 {
                    if ctx.input(|i| i.key_pressed(egui::Key::N)) {
                        self.diff_panel.next_file(file_count);
                    }
                    if ctx.input(|i| i.key_pressed(egui::Key::P)) {
                        self.diff_panel.prev_file();
                    }
                }
            } else if file_count > 0 {
                // Normal mode: j/k navigates files
                if ctx.input(|i| i.key_pressed(egui::Key::J)) {
                    self.diff_panel.next_file(file_count);
                }
                if ctx.input(|i| i.key_pressed(egui::Key::K)) {
                    self.diff_panel.prev_file();
                }
            }
        }

        // Track previous mode to detect changes
        let prev_mode = self.state.mode;

        egui::TopBottomPanel::top("toolbar").show(ctx, |ui| {
            ui.horizontal(|ui| {
                ui.heading("Agent Leash");
                ui.separator();

                // Branch display
                if let Some(ref branch) = self.branch_name {
                    ui.label(egui::RichText::new(format!("{} ({})", branch, self.vcs_name))
                        .color(egui::Color32::from_rgb(130, 180, 220)));
                } else {
                    ui.label(egui::RichText::new(format!("detached ({})", self.vcs_name))
                        .color(egui::Color32::from_rgb(200, 150, 100)));
                }
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

                    if let Some(repo) = self.workspace.active_repo() {
                        ui.label(egui::RichText::new(repo.path.display().to_string())
                            .small()
                            .color(egui::Color32::GRAY));
                    }
                });
            });
        });

        // Reset file index when mode changes
        if self.state.mode != prev_mode {
            self.diff_panel.reset_file_idx();
        }

        // Project tabs bar (only show if more than 1 repo)
        let mut tab_switch: Option<usize> = None;
        if self.workspace.repos.len() > 1 {
            egui::TopBottomPanel::top("project_tabs")
                .frame(egui::Frame::none()
                    .fill(egui::Color32::from_rgb(35, 35, 40))
                    .inner_margin(egui::Margin::symmetric(8.0, 4.0)))
                .show(ctx, |ui| {
                    ui.horizontal(|ui| {
                        for (idx, repo) in self.workspace.repos.iter().enumerate() {
                            let is_active = idx == self.workspace.active_idx;

                            let tab_text = egui::RichText::new(&repo.name)
                                .size(12.0)
                                .color(if is_active {
                                    egui::Color32::WHITE
                                } else {
                                    egui::Color32::from_rgb(160, 160, 170)
                                });

                            let button = egui::Button::new(tab_text)
                                .fill(if is_active {
                                    egui::Color32::from_rgb(60, 70, 90)
                                } else {
                                    egui::Color32::from_rgb(45, 45, 50)
                                })
                                .rounding(egui::Rounding::same(4.0))
                                .min_size(egui::vec2(0.0, 24.0));

                            let response = ui.add(button);

                            if response.clicked() && !is_active {
                                tab_switch = Some(idx);
                            }

                            response.on_hover_text(&repo.path.display().to_string());
                        }

                        // Add repo button
                        ui.add_space(4.0);
                        if ui.small_button("+").on_hover_text("Add repository (Cmd+Shift+O)").clicked() {
                            self.open_add_repo_dialog();
                        }
                    });
                });
        }
        // Handle tab switch (deferred to avoid borrow issues)
        if let Some(idx) = tab_switch {
            self.switch_repo(idx);
        }

        if let Some(ref error) = self.state.error {
            egui::TopBottomPanel::bottom("error").show(ctx, |ui| {
                ui.colored_label(egui::Color32::RED, error);
            });
        }

        // File tree side panel (with workspace panel above)
        let mut file_tree_nav: Option<usize> = None;
        let mut workspace_action: Option<WorkspaceAction> = None;
        if self.file_tree.visible {
            let diff = self.state.current_diff();
            self.file_tree.update_from_diff(diff);
            let current_file_idx = self.diff_panel.current_file_idx;
            let file_paths: Vec<_> = diff.files.iter().map(|f| f.path.clone()).collect();

            egui::SidePanel::left("file_tree")
                .default_width(220.0)
                .resizable(true)
                .show(ctx, |ui| {
                    // Workspace panel at top
                    egui::Frame::none()
                        .fill(egui::Color32::from_rgb(30, 30, 35))
                        .show(ui, |ui| {
                            if let Some(action) = self.workspace_panel.show(ui, &self.workspace) {
                                workspace_action = Some(action);
                            }
                        });
                    ui.separator();

                    // File tree below
                    let diff = self.state.current_diff();
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
        // Handle workspace actions (deferred to avoid borrow conflicts)
        if let Some(action) = workspace_action {
            match action {
                WorkspaceAction::SwitchRepo(idx) => self.switch_repo(idx),
                WorkspaceAction::AddRepo => self.open_add_repo_dialog(),
                WorkspaceAction::RemoveRepo(idx) => self.remove_repo(idx),
                WorkspaceAction::RenameRepo(_idx) => {
                    // TODO: implement rename dialog
                }
            }
        }

        // Commit history panel
        let mut clicked_commit: Option<String> = None;
        if self.commit_panel.visible {
            egui::SidePanel::left("commit_panel")
                .default_width(280.0)
                .resizable(true)
                .show(ctx, |ui| {
                    if let Some(commit_id) = self.commit_panel.show(ui) {
                        clicked_commit = Some(commit_id);
                    }
                });
        }
        if let Some(commit_id) = clicked_commit {
            // Enter stacked mode with single commit
            self.fetch_commit_diff(commit_id.clone());
            // Create a minimal stacked state for viewing single commit
            let commit_info = vcs::StackedCommitInfo {
                commit_id: commit_id.clone(),
                short_id: commit_id.chars().take(7).collect(),
                change_id: None,
                summary: self.commit_panel.selected_commit()
                    .map(|c| c.message.clone())
                    .unwrap_or_default(),
            };
            self.state.stacked_state = Some(StackedState::new(
                format!("{}^", commit_id),
                commit_id,
                vec![commit_info],
            ));
            self.state.mode = DiffMode::Stacked;
            self.diff_panel.reset_file_idx();
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

        let central_panel_response = egui::CentralPanel::default().frame(egui::Frame::none()).show(ctx, |ui| -> Option<DiffAction> {
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
                return None;
            }

            // Show commit header in stacked mode
            let mut stacked_prev = false;
            let mut stacked_next = false;
            let mut stacked_exit = false;
            if self.state.mode == DiffMode::Stacked {
                if let Some(ref stacked) = self.state.stacked_state {
                    let pos_label = stacked.position_label();
                    let range_label = format!("{}..{}", stacked.from_ref, stacked.to_ref);
                    let commit_info = stacked.current_commit().map(|c| (c.short_id.clone(), c.summary.clone()));

                    egui::Frame::none()
                        .fill(egui::Color32::from_rgb(40, 45, 55))
                        .inner_margin(egui::Margin::symmetric(12.0, 8.0))
                        .show(ui, |ui| {
                            ui.horizontal(|ui| {
                                // Navigation buttons
                                if ui.button("◀").on_hover_text("Previous commit (k)").clicked() {
                                    stacked_prev = true;
                                }
                                ui.label(egui::RichText::new(pos_label)
                                    .color(egui::Color32::from_rgb(180, 180, 200)));
                                if ui.button("▶").on_hover_text("Next commit (j)").clicked() {
                                    stacked_next = true;
                                }
                                ui.separator();

                                if let Some((short_id, summary)) = commit_info {
                                    ui.label(egui::RichText::new(short_id)
                                        .monospace()
                                        .color(egui::Color32::from_rgb(180, 140, 100)));
                                    ui.label(egui::RichText::new(summary)
                                        .color(egui::Color32::WHITE));
                                }

                                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                                    if ui.button("Exit").on_hover_text("Exit stacked mode (Esc)").clicked() {
                                        stacked_exit = true;
                                    }
                                    ui.label(egui::RichText::new(range_label)
                                        .small()
                                        .color(egui::Color32::GRAY));
                                });
                            });
                        });
                    ui.separator();
                }
            }
            // Handle deferred stacked actions
            if stacked_prev {
                if let Some(ref mut s) = self.state.stacked_state {
                    if s.prev() {
                        self.fetch_stacked_current_diff();
                        self.diff_panel.reset_file_idx();
                    }
                }
            }
            if stacked_next {
                if let Some(ref mut s) = self.state.stacked_state {
                    if s.next() {
                        self.fetch_stacked_current_diff();
                        self.diff_panel.reset_file_idx();
                    }
                }
            }
            if stacked_exit {
                self.exit_stacked_mode();
            }

            // Get diff based on mode - clone stacked diff to avoid borrow conflict
            let (diff_is_empty, stacked_diff_clone) = match self.state.mode {
                DiffMode::Unstaged => (self.state.unstaged_diff.files.is_empty(), None),
                DiffMode::Staged => (self.state.staged_diff.files.is_empty(), None),
                DiffMode::Stacked => {
                    let is_empty = self.state.stacked_state
                        .as_ref()
                        .map(|s| s.current_diff.files.is_empty())
                        .unwrap_or(true);
                    let diff_clone = self.state.stacked_state
                        .as_ref()
                        .map(|s| s.current_diff.clone());
                    (is_empty, diff_clone)
                }
            };

            // Track diff action
            let mut diff_action: Option<DiffAction> = None;

            if diff_is_empty {
                ui.centered_and_justified(|ui| {
                    ui.label(egui::RichText::new("No changes")
                        .size(20.0)
                        .color(egui::Color32::GRAY));
                });
            } else {
                match self.state.mode {
                    DiffMode::Unstaged => {
                        diff_action = self.diff_panel.show(ui, &self.state.unstaged_diff, &mut self.state.comments, &self.highlighter, false);
                    }
                    DiffMode::Staged => {
                        diff_action = self.diff_panel.show(ui, &self.state.staged_diff, &mut self.state.comments, &self.highlighter, true);
                    }
                    DiffMode::Stacked => {
                        if let Some(ref diff) = stacked_diff_clone {
                            // Stacked mode doesn't support staging
                            self.diff_panel.show(ui, diff, &mut self.state.comments, &self.highlighter, false);
                        }
                    }
                }
            }

            diff_action
        });

        // Handle diff panel actions (deferred to avoid borrow conflicts)
        if let Some(action) = central_panel_response.inner {
            match action {
                DiffAction::StageFile(path) => self.stage_file(path),
                DiffAction::UnstageFile(path) => self.unstage_file(path),
            }
        }

        // Stacked diff input dialog (overlay)
        if self.show_stacked_input {
            egui::Window::new("Enter Commit Range")
                .collapsible(false)
                .resizable(false)
                .anchor(egui::Align2::CENTER_CENTER, [0.0, 0.0])
                .show(ctx, |ui| {
                    ui.label("Enter a commit range:");
                    ui.add_space(8.0);

                    let response = ui.add(
                        egui::TextEdit::singleline(&mut self.stacked_range_input)
                            .desired_width(250.0)
                            .hint_text("HEAD~5..HEAD")
                    );

                    // Auto-focus on open
                    if response.gained_focus() || self.stacked_range_input.is_empty() {
                        response.request_focus();
                    }

                    ui.add_space(8.0);
                    ui.horizontal(|ui| {
                        if ui.button("Load").clicked() ||
                           (response.lost_focus() && ui.input(|i| i.key_pressed(egui::Key::Enter))) {
                            let range = self.stacked_range_input.clone();
                            self.fetch_stacked_commits(&range);
                            self.show_stacked_input = false;
                        }
                        if ui.button("Cancel").clicked() {
                            self.show_stacked_input = false;
                        }
                    });
                });
        }

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
                PaletteAction::SwitchRepo(idx) => {
                    self.switch_repo(idx);
                }
                PaletteAction::AddRepo => {
                    self.open_add_repo_dialog();
                }
            }
        }

        // Commit dialog overlay
        if let Some(result) = self.commit_dialog.show(ctx, &self.staged_files_cache) {
            match result {
                CommitDialogResult::Commit(message) => {
                    self.do_commit(message);
                }
                CommitDialogResult::Cancel => {
                    // Dialog already closed itself
                }
            }
        }
    }
}
