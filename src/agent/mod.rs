pub mod claude;
pub mod opencode;

use std::ops::Range;
use std::path::PathBuf;
use anyhow::Result;

pub struct FixRequest {
    pub file: PathBuf,
    pub lines: Range<usize>,
    pub instruction: String,
    pub context: String,
}

pub trait Agent {
    fn send(&self, req: FixRequest) -> Result<()>;
}
