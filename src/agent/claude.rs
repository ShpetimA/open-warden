use super::{Agent, FixRequest};
use anyhow::Result;

pub struct ClaudeCode;

impl Agent for ClaudeCode {
    fn send(&self, _req: FixRequest) -> Result<()> {
        todo!("Spawn claude CLI with context")
    }
}
