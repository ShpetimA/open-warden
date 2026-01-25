//! VCS backend abstraction module.
//!
//! Provides a unified interface for working with git and jj repositories.

mod backend;
mod detection;
mod git;
#[cfg(feature = "jj")]
mod jj;
#[cfg(test)]
pub mod test_utils;

pub use backend::{CommitInfo, Result, StackedCommitInfo, VcsBackend, VcsError};
pub use detection::{detect_vcs_type, VcsType};
pub use git::GitBackend;
#[cfg(feature = "jj")]
pub use jj::JjBackend;

use std::path::Path;

/// VCS backend type for explicit selection.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VcsBackendType {
    Git,
    Jj,
}

/// Get the appropriate VCS backend for the given path.
///
/// If `override_type` is provided, uses that backend type explicitly.
/// Otherwise auto-detects jj vs git repositories. Prefers jj when both are present (colocated).
pub fn get_backend(
    path: &Path,
    override_type: Option<VcsBackendType>,
) -> Result<Box<dyn VcsBackend>> {
    let vcs_type = override_type.map_or_else(
        || detect_vcs_type(path),
        |ot| match ot {
            VcsBackendType::Git => VcsType::Git,
            VcsBackendType::Jj => VcsType::Jj,
        },
    );

    match vcs_type {
        VcsType::Git => GitBackend::new(path).map(|b| Box::new(b) as Box<dyn VcsBackend>),
        VcsType::Jj => {
            #[cfg(feature = "jj")]
            {
                JjBackend::new(path).map(|b| Box::new(b) as Box<dyn VcsBackend>)
            }
            #[cfg(not(feature = "jj"))]
            {
                eprintln!("Warning: jj repository detected but jj support not compiled in. Using git backend.");
                GitBackend::new(path).map(|b| Box::new(b) as Box<dyn VcsBackend>)
            }
        }
        VcsType::None => Err(VcsError::NotARepository),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use test_utils::RepoGuard;

    #[test]
    fn test_get_backend_in_git_repo() {
        let repo = RepoGuard::new();
        let backend = get_backend(&repo.dir, None).expect("should get backend");
        let commit = backend.get_commit("HEAD").expect("should get commit");
        assert!(!commit.commit_id.is_empty());
    }

    #[test]
    fn test_get_backend_in_non_repo_fails() {
        let temp = tempfile::TempDir::new().unwrap();
        let result = get_backend(temp.path(), None);
        assert!(matches!(result, Err(VcsError::NotARepository)));
    }

    #[test]
    #[cfg(feature = "jj")]
    fn test_get_backend_in_jj_repo() {
        use test_utils::JjRepoGuard;

        let Some(repo) = JjRepoGuard::new() else {
            eprintln!("Skipping test: jj not available");
            return;
        };

        let backend = get_backend(&repo.dir, None).expect("should get backend");
        let commit = backend.get_commit("@").expect("should get commit");
        assert!(!commit.commit_id.is_empty());
    }

    #[test]
    #[cfg(feature = "jj")]
    fn test_vcs_override_git_in_jj_repo() {
        use test_utils::{git, JjRepoGuard};

        let Some(repo) = JjRepoGuard::new() else {
            eprintln!("Skipping test: jj not available");
            return;
        };

        git(&repo.dir, &["add", "."]);
        git(&repo.dir, &["commit", "-m", "init"]);

        let backend =
            get_backend(&repo.dir, Some(VcsBackendType::Git)).expect("should get backend");
        let commit = backend.get_commit("HEAD").expect("should get commit");
        assert!(!commit.commit_id.is_empty());
    }
}
