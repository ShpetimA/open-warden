use std::path::{Path, PathBuf};
use std::collections::HashMap;
use gix::bstr::ByteSlice;
use similar::{TextDiff, ChangeTag};
use crate::diff::{Diff, FileDiff, Hunk, Line};
use anyhow::{Result, Context};

/// Change type for a file
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FileChange {
    Modified,
    Added,
    Deleted,
}

/// Load unstaged changes (workdir vs index)
pub fn diff_unstaged(repo_path: &Path) -> Result<Diff> {
    let repo = gix::open(repo_path).context("Failed to open repository")?;
    let index = repo.index().context("Failed to read index")?;
    let workdir = repo.work_dir().context("Not a working directory")?;

    let mut files = Vec::new();

    // Get all tracked files from index
    for entry in index.entries() {
        let path = entry.path(&index);
        let rel_path = PathBuf::from(path.to_str().unwrap_or(""));
        let abs_path = workdir.join(&rel_path);

        // Skip if file doesn't exist in workdir (deleted)
        let workdir_content = if abs_path.exists() {
            std::fs::read_to_string(&abs_path).ok()
        } else {
            None
        };

        // Get index content
        let index_content = get_blob_content(&repo, entry.id)?;

        // Compare
        if let Some(ref work_str) = workdir_content {
            if let Some(ref idx_str) = index_content {
                if work_str != idx_str {
                    // File modified
                    if let Some(file_diff) = compute_file_diff(&rel_path, idx_str, work_str) {
                        files.push(file_diff);
                    }
                }
            }
        } else if index_content.is_some() {
            // File deleted in workdir
            if let Some(ref idx_str) = index_content {
                if let Some(file_diff) = compute_file_diff(&rel_path, idx_str, "") {
                    files.push(file_diff);
                }
            }
        }
    }

    // Check for untracked files that were added to workdir
    // (These won't show in unstaged diff - only tracked modifications)

    Ok(Diff { files })
}

/// Load staged changes (index vs HEAD)
pub fn diff_staged(repo_path: &Path) -> Result<Diff> {
    let repo = gix::open(repo_path).context("Failed to open repository")?;
    let index = repo.index().context("Failed to read index")?;

    // Get HEAD tree
    let head_tree = match repo.head_commit() {
        Ok(commit) => {
            let tree_id = commit.tree_id().context("Failed to get tree from commit")?;
            Some(repo.find_tree(tree_id).context("Failed to find tree")?)
        }
        Err(_) => None, // Initial commit case
    };

    let mut files = Vec::new();

    // Build map of HEAD files
    let mut head_files: HashMap<String, gix::ObjectId> = HashMap::new();
    if let Some(ref tree) = head_tree {
        collect_tree_files(&repo, tree, "", &mut head_files)?;
    }

    // Compare index entries with HEAD
    for entry in index.entries() {
        let path = entry.path(&index);
        let path_str = path.to_str().unwrap_or("").to_string();
        let rel_path = PathBuf::from(&path_str);

        let index_content = get_blob_content(&repo, entry.id)?;

        let head_content = if let Some(blob_id) = head_files.get(&path_str) {
            get_blob_content(&repo, *blob_id)?
        } else {
            None
        };

        // Compare
        match (&head_content, &index_content) {
            (Some(head), Some(idx)) if head != idx => {
                // Modified
                if let Some(file_diff) = compute_file_diff(&rel_path, head, idx) {
                    files.push(file_diff);
                }
            }
            (None, Some(idx)) => {
                // Added
                if let Some(file_diff) = compute_file_diff(&rel_path, "", idx) {
                    files.push(file_diff);
                }
            }
            _ => {}
        }

        // Remove from head_files to track deletions
        head_files.remove(&path_str);
    }

    // Files in HEAD but not in index = deleted
    for (path_str, blob_id) in head_files {
        if let Some(head_content) = get_blob_content(&repo, blob_id)? {
            let rel_path = PathBuf::from(&path_str);
            if let Some(file_diff) = compute_file_diff(&rel_path, &head_content, "") {
                files.push(file_diff);
            }
        }
    }

    Ok(Diff { files })
}

/// Get blob content as String (returns None for binary files)
fn get_blob_content(repo: &gix::Repository, id: gix::ObjectId) -> Result<Option<String>> {
    let object = repo.find_object(id).context("Failed to find object")?;
    let blob = object.try_into_blob().ok();

    if let Some(blob) = blob {
        let data = blob.data.as_slice();
        // Skip binary files
        if data.contains(&0) {
            return Ok(None);
        }
        Ok(data.to_str().ok().map(|s| s.to_string()))
    } else {
        Ok(None)
    }
}

/// Recursively collect files from a tree
fn collect_tree_files(
    repo: &gix::Repository,
    tree: &gix::Tree,
    prefix: &str,
    files: &mut HashMap<String, gix::ObjectId>,
) -> Result<()> {
    for entry in tree.iter() {
        let entry = entry?;
        let name = entry.filename().to_str().unwrap_or("").to_string();
        let path = if prefix.is_empty() {
            name.clone()
        } else {
            format!("{}/{}", prefix, name)
        };

        match entry.mode().kind() {
            gix::object::tree::EntryKind::Blob | gix::object::tree::EntryKind::BlobExecutable => {
                files.insert(path, entry.id().detach());
            }
            gix::object::tree::EntryKind::Tree => {
                let subtree = repo.find_tree(entry.id()).context("Failed to find subtree")?;
                collect_tree_files(repo, &subtree, &path, files)?;
            }
            _ => {}
        }
    }
    Ok(())
}

/// Compute diff between old and new content using similar crate
fn compute_file_diff(path: &Path, old: &str, new: &str) -> Option<FileDiff> {
    let diff = TextDiff::from_lines(old, new);
    let mut hunks = Vec::new();

    // Group changes into hunks
    for group in diff.grouped_ops(3) {
        let mut lines = Vec::new();
        let mut old_start = 0u32;
        let mut new_start = 0u32;
        let mut first = true;

        for op in group {
            let (_tag, old_range, new_range) = (op.tag(), op.old_range(), op.new_range());

            if first {
                old_start = old_range.start as u32 + 1;
                new_start = new_range.start as u32 + 1;
                first = false;
            }

            for change in diff.iter_changes(&op) {
                let content = change.value().trim_end_matches('\n').to_string();
                let old_idx = change.old_index().map(|i| i as u32 + 1);
                let new_idx = change.new_index().map(|i| i as u32 + 1);

                let line = match change.tag() {
                    ChangeTag::Equal => Line::context(content, old_idx.unwrap_or(0), new_idx.unwrap_or(0)),
                    ChangeTag::Insert => Line::added(content, new_idx.unwrap_or(0)),
                    ChangeTag::Delete => Line::removed(content, old_idx.unwrap_or(0)),
                };
                lines.push(line);
            }
        }

        if !lines.is_empty() {
            hunks.push(Hunk {
                old_start,
                new_start,
                lines,
            });
        }
    }

    if hunks.is_empty() {
        None
    } else {
        Some(FileDiff {
            path: path.to_path_buf(),
            hunks,
        })
    }
}
