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

use git2::{
    build::CheckoutBuilder, Delta, DiffFindOptions, DiffOptions, ObjectType, Oid, Repository,
    ResetType, Status, StatusOptions, Tree,
};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

/// VCS backend type for explicit selection.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VcsBackendType {
    Git,
    Jj,
}

#[derive(Clone, Debug)]
pub struct HistoryCommit {
    pub commit_id: String,
    pub short_id: String,
    pub summary: String,
    pub author: String,
    pub relative_time: String,
}

#[derive(Clone, Debug)]
pub struct CommitFile {
    pub path: String,
    pub previous_path: Option<String>,
    pub status: String,
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

fn delta_status_label(delta: Delta) -> String {
    match delta {
        Delta::Added => "added".to_string(),
        Delta::Deleted => "deleted".to_string(),
        Delta::Renamed => "renamed".to_string(),
        Delta::Copied => "copied".to_string(),
        Delta::Typechange => "type-changed".to_string(),
        Delta::Conflicted => "unmerged".to_string(),
        _ => "modified".to_string(),
    }
}

fn format_relative_time(secs_ago: i64) -> String {
    if secs_ago < 0 {
        return "in the future".to_string();
    }
    if secs_ago < 60 {
        return format!("{} seconds ago", secs_ago);
    }
    let mins = secs_ago / 60;
    if mins < 60 {
        return format!(
            "{} {} ago",
            mins,
            if mins == 1 { "minute" } else { "minutes" }
        );
    }
    let hours = mins / 60;
    if hours < 24 {
        return format!(
            "{} {} ago",
            hours,
            if hours == 1 { "hour" } else { "hours" }
        );
    }
    let days = hours / 24;
    if days < 7 {
        return format!("{} {} ago", days, if days == 1 { "day" } else { "days" });
    }
    let weeks = days / 7;
    if weeks < 4 {
        return format!(
            "{} {} ago",
            weeks,
            if weeks == 1 { "week" } else { "weeks" }
        );
    }
    let months = days / 30;
    if months < 12 {
        return format!(
            "{} {} ago",
            months,
            if months == 1 { "month" } else { "months" }
        );
    }
    let years = days / 365;
    format!(
        "{} {} ago",
        years,
        if years == 1 { "year" } else { "years" }
    )
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

fn read_tree_blob(repo: &Repository, tree: &Tree, rel_path: &Path) -> Result<Option<Vec<u8>>> {
    let entry = match tree.get_path(rel_path) {
        Ok(entry) => entry,
        Err(_) => return Ok(None),
    };

    if entry.kind() != Some(ObjectType::Blob) {
        return Ok(None);
    }

    let blob = repo
        .find_blob(entry.id())
        .map_err(|e| VcsError::Other(format!("failed to read tree blob: {}", e)))?;

    Ok(Some(blob.content().to_vec()))
}

fn parse_commit_oid(commit_id: &str) -> Result<Oid> {
    Oid::from_str(commit_id.trim())
        .map_err(|_| VcsError::InvalidRef(format!("invalid commit id: {}", commit_id)))
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

pub fn get_commit_history_for_path(path: &Path, limit: usize) -> Result<Vec<HistoryCommit>> {
    let repo = repo_for_path(path)?;
    let mut revwalk = repo
        .revwalk()
        .map_err(|e| VcsError::Other(format!("failed to create revwalk: {}", e)))?;

    revwalk
        .push_head()
        .map_err(|e| VcsError::Other(format!("failed to read HEAD: {}", e)))?;

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    let take_count = if limit == 0 { 1 } else { limit };
    let mut commits = Vec::new();

    for oid_result in revwalk.take(take_count) {
        let oid = oid_result.map_err(|e| VcsError::Other(format!("revwalk error: {}", e)))?;
        let commit = repo
            .find_commit(oid)
            .map_err(|e| VcsError::Other(format!("failed to load commit: {}", e)))?;

        let commit_id = oid.to_string();
        let short_id = commit_id[..7.min(commit_id.len())].to_string();
        let summary = commit.summary().unwrap_or("").to_string();
        let author = commit.author().name().unwrap_or("Unknown").to_string();
        let relative_time = format_relative_time(now - commit.time().seconds());

        commits.push(HistoryCommit {
            commit_id,
            short_id,
            summary,
            author,
            relative_time,
        });
    }

    Ok(commits)
}

pub fn get_commit_files_for_path(path: &Path, commit_id: &str) -> Result<Vec<CommitFile>> {
    let repo = repo_for_path(path)?;
    let commit_oid = parse_commit_oid(commit_id)?;
    let commit = repo
        .find_commit(commit_oid)
        .map_err(|_| VcsError::InvalidRef(format!("commit not found: {}", commit_id)))?;

    let tree = commit
        .tree()
        .map_err(|e| VcsError::Other(format!("failed to get commit tree: {}", e)))?;
    let parent_tree: Option<Tree> = if commit.parent_count() > 0 {
        commit.parent(0).ok().and_then(|p| p.tree().ok())
    } else {
        None
    };

    let mut opts = DiffOptions::new();
    opts.include_typechange(true);

    let mut diff = repo
        .diff_tree_to_tree(parent_tree.as_ref(), Some(&tree), Some(&mut opts))
        .map_err(|e| VcsError::Other(format!("failed to create commit diff: {}", e)))?;

    let mut find_opts = DiffFindOptions::new();
    find_opts.renames(true).copies(true);
    let _ = diff.find_similar(Some(&mut find_opts));

    let mut files = Vec::new();
    for delta in diff.deltas() {
        let path = delta
            .new_file()
            .path()
            .or_else(|| delta.old_file().path())
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();

        if path.is_empty() {
            continue;
        }

        let old_path = delta
            .old_file()
            .path()
            .map(|p| p.to_string_lossy().to_string());
        let previous_path = old_path.filter(|old| old != &path);

        files.push(CommitFile {
            path,
            previous_path,
            status: delta_status_label(delta.status()),
        });
    }

    files.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(files)
}

pub fn get_commit_file_versions_for_path(
    path: &Path,
    commit_id: &str,
    rel_path: &Path,
    previous_rel_path: Option<&Path>,
) -> Result<FileVersions> {
    validate_repo_relative_path(rel_path)?;
    if let Some(previous_path) = previous_rel_path {
        validate_repo_relative_path(previous_path)?;
    }

    let repo = repo_for_path(path)?;
    let commit_oid = parse_commit_oid(commit_id)?;
    let commit = repo
        .find_commit(commit_oid)
        .map_err(|_| VcsError::InvalidRef(format!("commit not found: {}", commit_id)))?;
    let commit_tree = commit
        .tree()
        .map_err(|e| VcsError::Other(format!("failed to get commit tree: {}", e)))?;
    let parent_tree: Option<Tree> = if commit.parent_count() > 0 {
        commit.parent(0).ok().and_then(|p| p.tree().ok())
    } else {
        None
    };

    let old_lookup_path = previous_rel_path.unwrap_or(rel_path);
    let old_label = old_lookup_path.to_string_lossy().to_string();
    let new_label = rel_path.to_string_lossy().to_string();

    let old_bytes = if let Some(parent) = parent_tree.as_ref() {
        read_tree_blob(&repo, parent, old_lookup_path)?
    } else {
        None
    };
    let new_bytes = read_tree_blob(&repo, &commit_tree, rel_path)?;

    let old_file = old_bytes
        .map(|bytes| {
            bytes_to_utf8(bytes, &old_label).map(|contents| DiffFile {
                name: old_label.clone(),
                contents,
            })
        })
        .transpose()?;

    let new_file = new_bytes
        .map(|bytes| {
            bytes_to_utf8(bytes, &new_label).map(|contents| DiffFile {
                name: new_label.clone(),
                contents,
            })
        })
        .transpose()?;

    Ok(FileVersions { old_file, new_file })
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
    use test_utils::{git, RepoGuard};

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
    fn test_get_commit_history_and_files() {
        let repo = RepoGuard::new();

        std::fs::write(repo.dir.join("src.txt"), "one\n").expect("failed to write first content");
        git(&repo.dir, &["add", "."]);
        git(&repo.dir, &["commit", "-m", "add src"]);

        std::fs::write(repo.dir.join("src.txt"), "two\n").expect("failed to update content");
        git(&repo.dir, &["add", "."]);
        git(&repo.dir, &["commit", "-m", "update src"]);

        let history = get_commit_history_for_path(&repo.dir, 20).expect("should load history");
        assert!(history.len() >= 2);
        assert_eq!(history[0].summary, "update src");

        let files =
            get_commit_files_for_path(&repo.dir, &history[0].commit_id).expect("should load files");
        assert!(files
            .iter()
            .any(|file| file.path == "src.txt" && file.status == "modified"));
    }

    #[test]
    fn test_get_commit_file_versions() {
        let repo = RepoGuard::new();

        std::fs::write(repo.dir.join("notes.md"), "v1\n").expect("failed to write first content");
        git(&repo.dir, &["add", "."]);
        git(&repo.dir, &["commit", "-m", "add notes"]);

        std::fs::write(repo.dir.join("notes.md"), "v2\n").expect("failed to update content");
        git(&repo.dir, &["add", "."]);
        git(&repo.dir, &["commit", "-m", "update notes"]);

        let history = get_commit_history_for_path(&repo.dir, 10).expect("should load history");
        let versions = get_commit_file_versions_for_path(
            &repo.dir,
            &history[0].commit_id,
            std::path::Path::new("notes.md"),
            None,
        )
        .expect("should load commit file versions");

        let old_contents = versions
            .old_file
            .as_ref()
            .map(|file| file.contents.trim().to_string());
        let new_contents = versions
            .new_file
            .as_ref()
            .map(|file| file.contents.trim().to_string());

        assert_eq!(old_contents.as_deref(), Some("v1"));
        assert_eq!(new_contents.as_deref(), Some("v2"));
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
