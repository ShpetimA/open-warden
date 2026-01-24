use super::{Agent, FixRequest};
use anyhow::Result;

pub struct OpenCode;

impl Agent for OpenCode {
    fn send(&self, _req: FixRequest) -> Result<()> {
        todo!("Spawn opencode CLI with context")
    }
}
