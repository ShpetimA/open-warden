//! Workspace configuration for managing multiple repositories.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

use crate::vcs::{detect_vcs_type, VcsType};

/// A single repository entry in the workspace.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepoEntry {
    pub path: PathBuf,
    pub name: String,
}

impl RepoEntry {
    pub fn new(path: PathBuf) -> Self {
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| path.display().to_string());
        Self { path, name }
    }

    /// Check if this repo path is available (exists and is a VCS repo).
    pub fn is_available(&self) -> bool {
        self.path.exists() && detect_vcs_type(&self.path) != VcsType::None
    }
}

/// Workspace configuration storing multiple repositories.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceConfig {
    pub repos: Vec<RepoEntry>,
    pub active_idx: usize,
}

impl Default for WorkspaceConfig {
    fn default() -> Self {
        Self {
            repos: Vec::new(),
            active_idx: 0,
        }
    }
}

impl WorkspaceConfig {
    /// Get the config file path.
    fn config_path() -> Option<PathBuf> {
        dirs::config_dir().map(|d| d.join("agent-leash").join("workspace.toml"))
    }

    /// Load workspace config from disk, or create default.
    pub fn load() -> Self {
        let Some(path) = Self::config_path() else {
            return Self::default();
        };

        if !path.exists() {
            return Self::default();
        }

        match fs::read_to_string(&path) {
            Ok(content) => toml::from_str(&content).unwrap_or_default(),
            Err(_) => Self::default(),
        }
    }

    /// Save workspace config to disk.
    pub fn save(&self) {
        let Some(path) = Self::config_path() else {
            return;
        };

        // Ensure parent dir exists
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }

        if let Ok(content) = toml::to_string_pretty(self) {
            let _ = fs::write(&path, content);
        }
    }

    /// Add a repository to the workspace.
    /// Returns error if path is not a valid VCS repo.
    pub fn add_repo(&mut self, path: PathBuf) -> Result<(), String> {
        // Canonicalize path
        let path = path
            .canonicalize()
            .map_err(|e| format!("Invalid path: {}", e))?;

        // Check it's a VCS repo
        if detect_vcs_type(&path) == VcsType::None {
            return Err("Not a git or jj repository".to_string());
        }

        // Check for duplicates
        if self.repos.iter().any(|r| r.path == path) {
            return Err("Repository already in workspace".to_string());
        }

        self.repos.push(RepoEntry::new(path));
        Ok(())
    }

    /// Remove a repository by index.
    /// Adjusts active_idx if needed.
    pub fn remove_repo(&mut self, idx: usize) {
        if idx >= self.repos.len() {
            return;
        }

        self.repos.remove(idx);

        // Adjust active index
        if self.repos.is_empty() {
            self.active_idx = 0;
        } else if self.active_idx >= self.repos.len() {
            self.active_idx = self.repos.len() - 1;
        } else if self.active_idx > idx {
            self.active_idx -= 1;
        }
    }

    /// Get the currently active repository.
    pub fn active_repo(&self) -> Option<&RepoEntry> {
        self.repos.get(self.active_idx)
    }

    /// Check if workspace is empty.
    pub fn is_empty(&self) -> bool {
        self.repos.is_empty()
    }

    /// Set the active repository by index.
    pub fn set_active(&mut self, idx: usize) {
        if idx < self.repos.len() {
            self.active_idx = idx;
        }
    }

    /// Rename a repository's display name.
    pub fn rename_repo(&mut self, idx: usize, name: String) {
        if let Some(repo) = self.repos.get_mut(idx) {
            repo.name = name;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn create_git_repo(dir: &std::path::Path) {
        std::process::Command::new("git")
            .args(["init"])
            .current_dir(dir)
            .output()
            .unwrap();
    }

    #[test]
    fn test_add_repo() {
        let temp = TempDir::new().unwrap();
        create_git_repo(temp.path());

        let mut ws = WorkspaceConfig::default();
        ws.add_repo(temp.path().to_path_buf()).unwrap();

        assert_eq!(ws.repos.len(), 1);
        assert_eq!(ws.active_idx, 0);
    }

    #[test]
    fn test_add_invalid_repo() {
        let temp = TempDir::new().unwrap();
        // Don't init git

        let mut ws = WorkspaceConfig::default();
        let result = ws.add_repo(temp.path().to_path_buf());
        assert!(result.is_err());
    }

    #[test]
    fn test_remove_repo_adjusts_active() {
        let mut ws = WorkspaceConfig {
            repos: vec![
                RepoEntry::new(PathBuf::from("/a")),
                RepoEntry::new(PathBuf::from("/b")),
                RepoEntry::new(PathBuf::from("/c")),
            ],
            active_idx: 2,
        };

        ws.remove_repo(1);
        assert_eq!(ws.repos.len(), 2);
        assert_eq!(ws.active_idx, 1); // was 2, now 1

        ws.remove_repo(1);
        assert_eq!(ws.repos.len(), 1);
        assert_eq!(ws.active_idx, 0); // clamped
    }
}
