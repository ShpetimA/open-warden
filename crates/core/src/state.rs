use crate::diff::Diff;
use crate::ui::CommentStore;
use crate::vcs::StackedCommitInfo;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DiffMode {
    Unstaged,
    Staged,
    Stacked,
}

/// State for stacked diff navigation
#[derive(Debug, Clone)]
pub struct StackedState {
    pub from_ref: String,
    pub to_ref: String,
    pub commits: Vec<StackedCommitInfo>,
    pub current_idx: usize,
    pub current_diff: Diff,
}

impl StackedState {
    pub fn new(from_ref: String, to_ref: String, commits: Vec<StackedCommitInfo>) -> Self {
        Self {
            from_ref,
            to_ref,
            commits,
            current_idx: 0,
            current_diff: Diff::default(),
        }
    }

    pub fn current_commit(&self) -> Option<&StackedCommitInfo> {
        self.commits.get(self.current_idx)
    }

    pub fn position_label(&self) -> String {
        if self.commits.is_empty() {
            "0/0".to_string()
        } else {
            format!("{}/{}", self.current_idx + 1, self.commits.len())
        }
    }

    pub fn next(&mut self) -> bool {
        if self.current_idx + 1 < self.commits.len() {
            self.current_idx += 1;
            true
        } else {
            false
        }
    }

    pub fn prev(&mut self) -> bool {
        if self.current_idx > 0 {
            self.current_idx -= 1;
            true
        } else {
            false
        }
    }
}

/// Core application state (business logic, data).
/// Separated from UI components and async channels.
pub struct AppState {
    pub mode: DiffMode,
    pub staged_diff: Diff,
    pub unstaged_diff: Diff,
    pub stacked_state: Option<StackedState>,
    pub comments: CommentStore,
    pub error: Option<String>,
    pub loading: bool,

    // Claude/agent state
    pub claude_prompt: String,
    pub claude_response: Option<String>,
    pub claude_loading: bool,

    // Commit dialog state
    pub commit_message: String,
    pub show_commit_dialog: bool,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            mode: DiffMode::Unstaged,
            staged_diff: Diff::default(),
            unstaged_diff: Diff::default(),
            stacked_state: None,
            comments: CommentStore::new(),
            error: None,
            loading: false,
            claude_prompt: String::new(),
            claude_response: None,
            claude_loading: false,
            commit_message: String::new(),
            show_commit_dialog: false,
        }
    }

    pub fn current_diff(&self) -> &Diff {
        match self.mode {
            DiffMode::Unstaged => &self.unstaged_diff,
            DiffMode::Staged => &self.staged_diff,
            DiffMode::Stacked => {
                self.stacked_state
                    .as_ref()
                    .map(|s| &s.current_diff)
                    .unwrap_or(&self.unstaged_diff)
            }
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
