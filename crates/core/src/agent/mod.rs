mod backend;
pub mod claude;
pub mod opencode;

pub use backend::AgentBackend;
pub use claude::ClaudeCode;

use std::path::PathBuf;

pub struct FixRequest {
    pub diff_content: String,             // unified diff
    pub comments: Vec<(PathBuf, String)>, // (file, comment text)
    pub instruction: Option<String>,      // optional user prompt
}
