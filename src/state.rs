use std::path::PathBuf;
use crate::diff::Diff;
use crate::ui::CommentStore;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DiffMode {
    Unstaged,
    Staged,
}

/// Core application state (business logic, data).
/// Separated from UI components and async channels.
pub struct AppState {
    pub repo_path: PathBuf,
    pub mode: DiffMode,
    pub staged_diff: Diff,
    pub unstaged_diff: Diff,
    pub comments: CommentStore,
    pub error: Option<String>,
    pub loading: bool,

    // Claude/agent state
    pub claude_prompt: String,
    pub claude_response: Option<String>,
    pub claude_loading: bool,
}

impl AppState {
    pub fn new(repo_path: PathBuf) -> Self {
        Self {
            repo_path,
            mode: DiffMode::Unstaged,
            staged_diff: Diff::default(),
            unstaged_diff: Diff::default(),
            comments: CommentStore::new(),
            error: None,
            loading: false,
            claude_prompt: String::new(),
            claude_response: None,
            claude_loading: false,
        }
    }

    pub fn current_diff(&self) -> &Diff {
        match self.mode {
            DiffMode::Unstaged => &self.unstaged_diff,
            DiffMode::Staged => &self.staged_diff,
        }
    }

    pub fn set_error(&mut self, msg: String) {
        if let Some(ref mut err) = self.error {
            err.push_str(&format!("\n{}", msg));
        } else {
            self.error = Some(msg);
        }
    }

    pub fn clear_error(&mut self) {
        self.error = None;
    }
}
