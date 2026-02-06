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

pub use backend::{
    CommitInfo, DiffBucket, DiffFile, FileVersions, GitSnapshot, Result, SnapshotFile,
    StackedCommitInfo, VcsBackend, VcsError,
};
pub use detection::{detect_vcs_type, VcsType};
pub use git::GitBackend;
#[cfg(feature = "jj")]
pub use jj::JjBackend;

use git2::{build::CheckoutBuilder, Repository, ResetType, Status, StatusOptions};
use std::fs;
use std::path::{Path, PathBuf};

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

fn repo_for_path(path: &Path) -> Result<Repository> {
    Repository::discover(path).map_err(|_| VcsError::NotARepository)
}

fn repo_root_path(repo: &Repository) -> Result<PathBuf> {
    if let Some(workdir) = repo.workdir() {
        return Ok(workdir.to_path_buf());
    }

    repo.path()
        .parent()
        .map(|p| p.to_path_buf())
        .ok_or_else(|| VcsError::Other("failed to resolve repository root".to_string()))
}

fn validate_repo_relative_path(rel_path: &Path) -> Result<()> {
    if rel_path.as_os_str().is_empty() {
        return Err(VcsError::Other("path is empty".to_string()));
    }
    if rel_path.is_absolute() {
        return Err(VcsError::Other(
            "path must be repository-relative".to_string(),
        ));
    }
    if rel_path
        .components()
        .any(|c| matches!(c, std::path::Component::ParentDir))
    {
        return Err(VcsError::Other("path cannot contain '..'".to_string()));
    }
    Ok(())
}

fn has_index_changes(status: Status) -> bool {
    status.intersects(
        Status::INDEX_NEW
            | Status::INDEX_MODIFIED
            | Status::INDEX_DELETED
            | Status::INDEX_RENAMED
            | Status::INDEX_TYPECHANGE,
    )
}

fn has_worktree_changes(status: Status) -> bool {
    status.intersects(
        Status::WT_MODIFIED | Status::WT_DELETED | Status::WT_RENAMED | Status::WT_TYPECHANGE,
    )
}

fn status_label(status: Status) -> String {
    if status.contains(Status::CONFLICTED) {
        return "unmerged".to_string();
    }
    if status.intersects(Status::INDEX_NEW | Status::WT_NEW) {
        return "added".to_string();
    }
    if status.intersects(Status::INDEX_DELETED | Status::WT_DELETED) {
        return "deleted".to_string();
    }
    if status.intersects(Status::INDEX_RENAMED | Status::WT_RENAMED) {
        return "renamed".to_string();
    }
    if status.intersects(Status::INDEX_TYPECHANGE | Status::WT_TYPECHANGE) {
        return "type-changed".to_string();
    }
    "modified".to_string()
}

fn bytes_to_utf8(bytes: Vec<u8>, label: &str) -> Result<String> {
    if bytes.contains(&0) {
        return Err(VcsError::Other(format!(
            "binary file is not supported: {}",
            label
        )));
    }

    String::from_utf8(bytes)
        .map_err(|_| VcsError::Other(format!("binary file is not supported: {}", label)))
}

fn read_head_blob(repo: &Repository, rel_path: &Path) -> Result<Option<Vec<u8>>> {
    let head_commit = match repo.head().and_then(|h| h.peel_to_commit()) {
        Ok(commit) => commit,
        Err(_) => return Ok(None),
    };

    let tree = head_commit
        .tree()
        .map_err(|e| VcsError::Other(format!("failed to get HEAD tree: {}", e)))?;

    let entry = match tree.get_path(rel_path) {
        Ok(entry) => entry,
        Err(_) => return Ok(None),
    };

    let blob = repo
        .find_blob(entry.id())
        .map_err(|e| VcsError::Other(format!("failed to read HEAD blob: {}", e)))?;

    Ok(Some(blob.content().to_vec()))
}

fn read_index_blob(repo: &Repository, rel_path: &Path) -> Result<Option<Vec<u8>>> {
    let index = repo
        .index()
        .map_err(|e| VcsError::Other(format!("failed to open index: {}", e)))?;

    let Some(entry) = index.get_path(rel_path, 0) else {
        return Ok(None);
    };

    let blob = repo
        .find_blob(entry.id)
        .map_err(|e| VcsError::Other(format!("failed to read index blob: {}", e)))?;

    Ok(Some(blob.content().to_vec()))
}

fn read_worktree_file(repo: &Repository, rel_path: &Path) -> Result<Option<Vec<u8>>> {
    let workdir = repo
        .workdir()
        .ok_or_else(|| VcsError::Other("repository has no working directory".to_string()))?;
    let full_path = workdir.join(rel_path);

    if !full_path.exists() {
        return Ok(None);
    }
    if !full_path.is_file() {
        return Ok(None);
    }

    fs::read(&full_path).map(Some).map_err(VcsError::Io)
}

fn remove_worktree_path(repo: &Repository, rel_path: &Path) -> Result<()> {
    let workdir = repo
        .workdir()
        .ok_or_else(|| VcsError::Other("repository has no working directory".to_string()))?;
    let full_path = workdir.join(rel_path);

    if !full_path.exists() {
        return Ok(());
    }

    if full_path.is_dir() {
        fs::remove_dir_all(&full_path).map_err(VcsError::Io)
    } else {
        fs::remove_file(&full_path).map_err(VcsError::Io)
    }
}

pub fn get_git_snapshot_for_path(path: &Path) -> Result<GitSnapshot> {
    let repo = repo_for_path(path)?;
    let repo_root = repo_root_path(&repo)?;

    let branch = match repo.head() {
        Ok(head) if head.is_branch() => head.shorthand().unwrap_or("HEAD").to_string(),
        Ok(_) => "HEAD".to_string(),
        Err(_) => "HEAD".to_string(),
    };

    let mut opts = StatusOptions::new();
    opts.include_untracked(true)
        .recurse_untracked_dirs(true)
        .exclude_submodules(true)
        .include_ignored(false);

    let statuses = repo
        .statuses(Some(&mut opts))
        .map_err(|e| VcsError::Other(format!("failed to get status: {}", e)))?;

    let mut unstaged = Vec::new();
    let mut staged = Vec::new();
    let mut untracked = Vec::new();

    for entry in statuses.iter() {
        let Some(path) = entry.path() else {
            continue;
        };

        let status = entry.status();

        if status.contains(Status::WT_NEW) && !has_index_changes(status) {
            untracked.push(SnapshotFile {
                path: path.to_string(),
                status: "untracked".to_string(),
            });
            continue;
        }

        if has_index_changes(status) || status.contains(Status::CONFLICTED) {
            staged.push(SnapshotFile {
                path: path.to_string(),
                status: status_label(status),
            });
        }

        if has_worktree_changes(status) || status.contains(Status::CONFLICTED) {
            unstaged.push(SnapshotFile {
                path: path.to_string(),
                status: status_label(status),
            });
        }
    }

    unstaged.sort_by(|a, b| a.path.cmp(&b.path));
    staged.sort_by(|a, b| a.path.cmp(&b.path));
    untracked.sort_by(|a, b| a.path.cmp(&b.path));

    Ok(GitSnapshot {
        repo_root: repo_root.to_string_lossy().to_string(),
        branch,
        unstaged,
        staged,
        untracked,
    })
}

pub fn get_file_versions_for_path(
    path: &Path,
    rel_path: &Path,
    bucket: DiffBucket,
) -> Result<FileVersions> {
    validate_repo_relative_path(rel_path)?;
    let repo = repo_for_path(path)?;
    let file_name = rel_path.to_string_lossy().to_string();

    let (old_bytes, new_bytes) = match bucket {
        DiffBucket::Unstaged => (
            read_index_blob(&repo, rel_path)?,
            read_worktree_file(&repo, rel_path)?,
        ),
        DiffBucket::Staged => (
            read_head_blob(&repo, rel_path)?,
            read_index_blob(&repo, rel_path)?,
        ),
        DiffBucket::Untracked => (None, read_worktree_file(&repo, rel_path)?),
    };

    let old_file = old_bytes
        .map(|bytes| {
            bytes_to_utf8(bytes, &file_name).map(|contents| DiffFile {
                name: file_name.clone(),
                contents,
            })
        })
        .transpose()?;

    let new_file = new_bytes
        .map(|bytes| {
            bytes_to_utf8(bytes, &file_name).map(|contents| DiffFile {
                name: file_name.clone(),
                contents,
            })
        })
        .transpose()?;

    Ok(FileVersions { old_file, new_file })
}

pub fn stage_file_for_path(path: &Path, rel_path: &Path) -> Result<()> {
    validate_repo_relative_path(rel_path)?;
    let backend = GitBackend::new(path)?;
    backend.stage_file(rel_path)
}

pub fn unstage_file_for_path(path: &Path, rel_path: &Path) -> Result<()> {
    validate_repo_relative_path(rel_path)?;
    let backend = GitBackend::new(path)?;
    backend.unstage_file(rel_path)
}

pub fn stage_all_for_path(path: &Path) -> Result<()> {
    let repo = repo_for_path(path)?;

    let mut opts = StatusOptions::new();
    opts.include_untracked(true)
        .recurse_untracked_dirs(true)
        .exclude_submodules(true)
        .include_ignored(false);

    let statuses = repo
        .statuses(Some(&mut opts))
        .map_err(|e| VcsError::Other(format!("failed to get status: {}", e)))?;

    let mut index = repo
        .index()
        .map_err(|e| VcsError::Other(format!("failed to open index: {}", e)))?;

    for entry in statuses.iter() {
        let Some(path) = entry.path() else {
            continue;
        };

        let status = entry.status();
        let rel_path = Path::new(path);

        if status.contains(Status::WT_DELETED) {
            let _ = index.remove_path(rel_path);
        }

        if status.intersects(
            Status::WT_NEW | Status::WT_MODIFIED | Status::WT_RENAMED | Status::WT_TYPECHANGE,
        ) {
            index
                .add_path(rel_path)
                .map_err(|e| VcsError::Other(format!("failed to stage path {}: {}", path, e)))?;
        }
    }

    index
        .write()
        .map_err(|e| VcsError::Other(format!("failed to write index: {}", e)))
}

pub fn unstage_all_for_path(path: &Path) -> Result<()> {
    let repo = repo_for_path(path)?;

    if let Ok(head_commit) = repo.head().and_then(|h| h.peel_to_commit()) {
        return repo
            .reset(head_commit.as_object(), ResetType::Mixed, None)
            .map_err(|e| VcsError::Other(format!("failed to unstage all: {}", e)));
    }

    let mut index = repo
        .index()
        .map_err(|e| VcsError::Other(format!("failed to open index: {}", e)))?;
    index
        .clear()
        .map_err(|e| VcsError::Other(format!("failed to clear index: {}", e)))?;
    index
        .write()
        .map_err(|e| VcsError::Other(format!("failed to write index: {}", e)))
}

pub fn discard_file_for_path(path: &Path, rel_path: &Path, bucket: DiffBucket) -> Result<()> {
    validate_repo_relative_path(rel_path)?;
    let repo = repo_for_path(path)?;

    match bucket {
        DiffBucket::Untracked => remove_worktree_path(&repo, rel_path),
        DiffBucket::Unstaged => {
            let mut checkout = CheckoutBuilder::new();
            checkout.force().path(rel_path);
            repo.checkout_index(None, Some(&mut checkout))
                .map_err(|e| VcsError::Other(format!("failed to discard unstaged file: {}", e)))
        }
        DiffBucket::Staged => {
            if let Ok(head_commit) = repo.head().and_then(|h| h.peel_to_commit()) {
                repo.reset_default(Some(head_commit.as_object()), [rel_path])
                    .map_err(|e| VcsError::Other(format!("failed to reset staged file: {}", e)))?;
            } else {
                let mut index = repo
                    .index()
                    .map_err(|e| VcsError::Other(format!("failed to open index: {}", e)))?;
                let _ = index.remove_path(rel_path);
                index
                    .write()
                    .map_err(|e| VcsError::Other(format!("failed to write index: {}", e)))?;
            }

            let mut checkout = CheckoutBuilder::new();
            checkout.force().path(rel_path);
            if repo.checkout_index(None, Some(&mut checkout)).is_err() {
                remove_worktree_path(&repo, rel_path)?;
            }
            Ok(())
        }
    }
}

pub fn discard_all_for_path(path: &Path) -> Result<()> {
    let repo = repo_for_path(path)?;

    if let Ok(head_commit) = repo.head().and_then(|h| h.peel_to_commit()) {
        repo.reset(head_commit.as_object(), ResetType::Hard, None)
            .map_err(|e| VcsError::Other(format!("failed to hard reset: {}", e)))?;
    }

    let mut opts = StatusOptions::new();
    opts.include_untracked(true)
        .recurse_untracked_dirs(true)
        .exclude_submodules(true)
        .include_ignored(false);

    let statuses = repo
        .statuses(Some(&mut opts))
        .map_err(|e| VcsError::Other(format!("failed to get status: {}", e)))?;

    for entry in statuses.iter() {
        let Some(path) = entry.path() else {
            continue;
        };
        if entry.status().contains(Status::WT_NEW) {
            let _ = remove_worktree_path(&repo, Path::new(path));
        }
    }

    Ok(())
}

pub fn commit_staged_for_path(path: &Path, message: &str) -> Result<String> {
    if message.trim().is_empty() {
        return Err(VcsError::Other("commit message is empty".to_string()));
    }

    let backend = GitBackend::new(path)?;
    backend.commit(message)
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
