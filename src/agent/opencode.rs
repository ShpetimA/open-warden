use super::FixRequest;

pub struct OpenCode;

impl OpenCode {
    pub fn send(_req: &FixRequest) -> Result<String, String> {
        todo!("Spawn opencode CLI with context")
    }
}
