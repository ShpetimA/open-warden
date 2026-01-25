use super::backend::AgentBackend;
use super::FixRequest;
use crate::error::{AppError, Result};
use std::process::Command;

pub struct ClaudeCode;

impl AgentBackend for ClaudeCode {
    fn send(&self, req: &FixRequest) -> Result<String> {
        let mut prompt = String::new();

        // Add instruction if provided
        if let Some(ref instr) = req.instruction {
            prompt.push_str(&format!("Instruction: {}\n\n", instr));
        }

        // Add diff
        prompt.push_str(&format!("Diff:\n{}\n\n", req.diff_content));

        // Add comments grouped by file
        prompt.push_str("Review comments:\n");
        for (path, comment) in &req.comments {
            prompt.push_str(&format!("- {}: {}\n", path.display(), comment));
        }

        let output = Command::new("claude")
            .arg("--permission-mode")
            .arg("acceptEdits")
            .arg("-p")
            .arg(&prompt)
            .output()?;

        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).to_string())
        } else {
            Err(AppError::Agent(
                String::from_utf8_lossy(&output.stderr).to_string(),
            ))
        }
    }

    fn name(&self) -> &'static str {
        "claude"
    }
}
