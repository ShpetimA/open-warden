use super::FixRequest;
use crate::error::Result;

/// Trait for AI agent backends that can process fix requests.
pub trait AgentBackend: Send + Sync {
    /// Send a fix request to the agent and return the response.
    fn send(&self, req: &FixRequest) -> Result<String>;

    /// Return the name of this agent backend.
    fn name(&self) -> &'static str;
}
