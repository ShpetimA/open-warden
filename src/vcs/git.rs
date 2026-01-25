use std::path::Path;

use git2::{Commit, DiffFormat, DiffOptions, Repository, StatusOptions, Time, Tree};

use super::backend::{CommitInfo, Result, StackedCommitInfo, VcsBackend, VcsError};

/// Format a duration in seconds as relative time (e.g., "2 hours ago").
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

/// Format git2::Time as YYYY-MM-DD HH:MM:SS.
fn format_git_time(time: &Time) -> String {
    let secs = time.seconds();
    let offset_mins = time.offset_minutes();

    // Apply timezone offset to get local time
    let local_secs = secs + (offset_mins as i64 * 60);

    // Calculate date/time components
    let days = local_secs / 86400;
    let time_of_day = (local_secs % 86400 + 86400) % 86400;

    let hours = time_of_day / 3600;
    let minutes = (time_of_day % 3600) / 60;
    let seconds = time_of_day % 60;

    let (year, month, day) = days_to_ymd(days);

    format!(
        "{:04}-{:02}-{:02} {:02}:{:02}:{:02}",
        year, month, day, hours, minutes, seconds
    )
}

/// Convert days since Unix epoch to (year, month, day).
fn days_to_ymd(days: i64) -> (i32, u32, u32) {
    let z = days + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u32;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (y as i32, m, d)
}

/// Files to exclude from diff output.
const EXCLUDED_FILES: &[&str] = &[
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "Cargo.lock",
];

/// Path patterns to exclude from diff output.
const EXCLUDED_PATTERNS: &[&str] = &["node_modules/"];

/// Check if a path should be excluded from diff output.
fn should_exclude_path(path: &str) -> bool {
    if let Some(filename) = path.rsplit('/').next() {
        if EXCLUDED_FILES.contains(&filename) {
            return true;
        }
    }
    for pattern in EXCLUDED_PATTERNS {
        if path.contains(pattern) {
            return true;
        }
    }
    false
}

/// Git backend using git2 (libgit2) for repository access.
pub struct GitBackend {
    repo: Repository,
}

impl GitBackend {
    /// Open a git repository at the given path.
    pub fn new(path: &Path) -> Result<Self> {
        let repo = Repository::discover(path).map_err(|_| VcsError::NotARepository)?;
        Ok(GitBackend { repo })
    }

    /// Validate that a reference doesn't look like a flag.
    fn validate_ref_format(reference: &str) -> Result<()> {
        if reference.trim().starts_with('-') {
            return Err(VcsError::InvalidRef(format!(
                "references cannot start with '-': {}",
                reference
            )));
        }
        Ok(())
    }

    /// Generate unified diff for a commit, comparing to its parent.
    fn generate_commit_diff(&self, commit: &Commit) -> Result<String> {
        let tree = commit
            .tree()
            .map_err(|e| VcsError::Other(format!("failed to get commit tree: {}", e)))?;

        let parent_tree: Option<Tree> = if commit.parent_count() > 0 {
            commit.parent(0).ok().and_then(|p| p.tree().ok())
        } else {
            None
        };

        let mut opts = DiffOptions::new();
        opts.show_binary(true);
        opts.context_lines(3);

        let diff = self
            .repo
            .diff_tree_to_tree(parent_tree.as_ref(), Some(&tree), Some(&mut opts))
            .map_err(|e| VcsError::Other(format!("failed to create diff: {}", e)))?;

        let mut output = String::new();
        diff.print(DiffFormat::Patch, |delta, _hunk, line| {
            if let Some(path) = delta.new_file().path().and_then(|p| p.to_str()) {
                if should_exclude_path(path) {
                    return true;
                }
            }
            if let Some(path) = delta.old_file().path().and_then(|p| p.to_str()) {
                if should_exclude_path(path) {
                    return true;
                }
            }

            let prefix = match line.origin() {
                '+' | '-' | ' ' => line.origin(),
                'F' | 'H' | 'B' => '\0',
                _ => '\0',
            };

            if prefix != '\0' {
                output.push(prefix);
            }
            if let Ok(content) = std::str::from_utf8(line.content()) {
                output.push_str(content);
            }
            true
        })
        .map_err(|e| VcsError::Other(format!("failed to format diff: {}", e)))?;

        Ok(output)
    }
}

impl VcsBackend for GitBackend {
    fn get_commit(&self, reference: &str) -> Result<CommitInfo> {
        let reference = reference.trim();
        Self::validate_ref_format(reference)?;

        let obj = self
            .repo
            .revparse_single(reference)
            .map_err(|_| VcsError::InvalidRef(reference.to_string()))?;
        let commit = obj
            .peel_to_commit()
            .map_err(|_| VcsError::InvalidRef(reference.to_string()))?;

        let commit_id = commit.id().to_string();
        let author_sig = commit.author();
        let author_name = author_sig.name().unwrap_or("");
        let author_email = author_sig.email().unwrap_or("");
        let author = format!("{} <{}>", author_name, author_email);

        let time = commit.time();
        let date = format_git_time(&time);

        let message = commit
            .message()
            .unwrap_or("")
            .trim_end_matches('\n')
            .to_string();

        let diff = self.generate_commit_diff(&commit)?;

        Ok(CommitInfo {
            commit_id,
            change_id: None,
            message,
            diff,
            author,
            date,
        })
    }

    fn get_working_tree_diff(&self, staged: bool) -> Result<String> {
        let mut opts = DiffOptions::new();
        opts.show_binary(true);
        opts.context_lines(3);

        let diff = if staged {
            let head = self.repo.head().ok().and_then(|h| h.peel_to_tree().ok());
            self.repo
                .diff_tree_to_index(head.as_ref(), None, Some(&mut opts))
                .map_err(|e| VcsError::Other(format!("failed to create staged diff: {}", e)))?
        } else {
            self.repo
                .diff_index_to_workdir(None, Some(&mut opts))
                .map_err(|e| VcsError::Other(format!("failed to create unstaged diff: {}", e)))?
        };

        let mut output = String::new();
        diff.print(DiffFormat::Patch, |delta, _hunk, line| {
            if let Some(path) = delta.new_file().path().and_then(|p| p.to_str()) {
                if should_exclude_path(path) {
                    return true;
                }
            }
            if let Some(path) = delta.old_file().path().and_then(|p| p.to_str()) {
                if should_exclude_path(path) {
                    return true;
                }
            }

            let prefix = match line.origin() {
                '+' | '-' | ' ' => line.origin(),
                _ => '\0',
            };
            if prefix != '\0' {
                output.push(prefix);
            }
            if let Ok(content) = std::str::from_utf8(line.content()) {
                output.push_str(content);
            }
            true
        })
        .map_err(|e| VcsError::Other(format!("failed to format diff: {}", e)))?;

        Ok(output)
    }

    fn get_range_diff(&self, from: &str, to: &str, three_dot: bool) -> Result<String> {
        Self::validate_ref_format(from)?;
        Self::validate_ref_format(to)?;

        let from_obj = self
            .repo
            .revparse_single(from)
            .map_err(|_| VcsError::InvalidRef(from.to_string()))?;
        let from_commit = from_obj
            .peel_to_commit()
            .map_err(|_| VcsError::InvalidRef(from.to_string()))?;

        let to_obj = self
            .repo
            .revparse_single(to)
            .map_err(|_| VcsError::InvalidRef(to.to_string()))?;
        let to_commit = to_obj
            .peel_to_commit()
            .map_err(|_| VcsError::InvalidRef(to.to_string()))?;

        let base_tree = if three_dot {
            let merge_base_oid = self
                .repo
                .merge_base(from_commit.id(), to_commit.id())
                .map_err(|e| VcsError::Other(format!("failed to find merge base: {}", e)))?;
            let merge_base = self
                .repo
                .find_commit(merge_base_oid)
                .map_err(|e| VcsError::Other(format!("failed to find merge base commit: {}", e)))?;
            merge_base
                .tree()
                .map_err(|e| VcsError::Other(format!("failed to get merge base tree: {}", e)))?
        } else {
            from_commit
                .tree()
                .map_err(|e| VcsError::Other(format!("failed to get from tree: {}", e)))?
        };

        let to_tree = to_commit
            .tree()
            .map_err(|e| VcsError::Other(format!("failed to get to tree: {}", e)))?;

        let mut opts = DiffOptions::new();
        opts.show_binary(true);
        opts.context_lines(3);

        let diff = self
            .repo
            .diff_tree_to_tree(Some(&base_tree), Some(&to_tree), Some(&mut opts))
            .map_err(|e| VcsError::Other(format!("failed to create range diff: {}", e)))?;

        let mut output = String::new();
        diff.print(DiffFormat::Patch, |delta, _hunk, line| {
            if let Some(path) = delta.new_file().path().and_then(|p| p.to_str()) {
                if should_exclude_path(path) {
                    return true;
                }
            }
            if let Some(path) = delta.old_file().path().and_then(|p| p.to_str()) {
                if should_exclude_path(path) {
                    return true;
                }
            }

            let prefix = match line.origin() {
                '+' | '-' | ' ' => line.origin(),
                _ => '\0',
            };
            if prefix != '\0' {
                output.push(prefix);
            }
            if let Ok(content) = std::str::from_utf8(line.content()) {
                output.push_str(content);
            }
            true
        })
        .map_err(|e| VcsError::Other(format!("failed to format diff: {}", e)))?;

        Ok(output)
    }

    fn get_changed_files(&self, reference: &str) -> Result<Vec<String>> {
        let reference = reference.trim();

        // Check if this is a range (contains ..)
        if reference.contains("..") {
            let parts: Vec<&str> = if reference.contains("...") {
                reference.split("...").collect()
            } else {
                reference.split("..").collect()
            };

            if parts.len() == 2 {
                Self::validate_ref_format(parts[0])?;
                Self::validate_ref_format(parts[1])?;

                let from_obj = self
                    .repo
                    .revparse_single(parts[0])
                    .map_err(|_| VcsError::InvalidRef(parts[0].to_string()))?;
                let from_commit = from_obj
                    .peel_to_commit()
                    .map_err(|_| VcsError::InvalidRef(parts[0].to_string()))?;
                let from_tree = from_commit
                    .tree()
                    .map_err(|e| VcsError::Other(format!("failed to get from tree: {}", e)))?;

                let to_obj = self
                    .repo
                    .revparse_single(parts[1])
                    .map_err(|_| VcsError::InvalidRef(parts[1].to_string()))?;
                let to_commit = to_obj
                    .peel_to_commit()
                    .map_err(|_| VcsError::InvalidRef(parts[1].to_string()))?;
                let to_tree = to_commit
                    .tree()
                    .map_err(|e| VcsError::Other(format!("failed to get to tree: {}", e)))?;

                let diff = self
                    .repo
                    .diff_tree_to_tree(Some(&from_tree), Some(&to_tree), None)
                    .map_err(|e| VcsError::Other(format!("failed to create diff: {}", e)))?;

                return Ok(diff
                    .deltas()
                    .filter_map(|d| {
                        d.new_file()
                            .path()
                            .and_then(|p| p.to_str().map(String::from))
                    })
                    .collect());
            }
        }

        // Single commit - compare to parent tree
        Self::validate_ref_format(reference)?;
        let obj = self
            .repo
            .revparse_single(reference)
            .map_err(|_| VcsError::InvalidRef(reference.to_string()))?;
        let commit = obj
            .peel_to_commit()
            .map_err(|_| VcsError::InvalidRef(reference.to_string()))?;
        let tree = commit
            .tree()
            .map_err(|e| VcsError::Other(format!("failed to get commit tree: {}", e)))?;

        let parent_tree: Option<Tree> = if commit.parent_count() > 0 {
            commit.parent(0).ok().and_then(|p| p.tree().ok())
        } else {
            None
        };

        let diff = self
            .repo
            .diff_tree_to_tree(parent_tree.as_ref(), Some(&tree), None)
            .map_err(|e| VcsError::Other(format!("failed to create diff: {}", e)))?;

        Ok(diff
            .deltas()
            .filter_map(|d| {
                d.new_file()
                    .path()
                    .and_then(|p| p.to_str().map(String::from))
            })
            .collect())
    }

    fn get_file_content_at_ref(&self, reference: &str, path: &Path) -> Result<String> {
        let reference = reference.trim();
        Self::validate_ref_format(reference)?;

        let obj = self
            .repo
            .revparse_single(reference)
            .map_err(|_| VcsError::InvalidRef(reference.to_string()))?;
        let commit = obj
            .peel_to_commit()
            .map_err(|_| VcsError::InvalidRef(reference.to_string()))?;
        let tree = commit
            .tree()
            .map_err(|e| VcsError::Other(format!("failed to get tree: {}", e)))?;

        let entry = tree
            .get_path(path)
            .map_err(|_| VcsError::FileNotFound(path.display().to_string()))?;

        let blob = self
            .repo
            .find_blob(entry.id())
            .map_err(|_| VcsError::FileNotFound(path.display().to_string()))?;

        Ok(String::from_utf8_lossy(blob.content()).into_owned())
    }

    fn get_current_branch(&self) -> Result<Option<String>> {
        let head = self
            .repo
            .head()
            .map_err(|e| VcsError::Other(format!("failed to get HEAD: {}", e)))?;

        if head.is_branch() {
            Ok(head.shorthand().map(|s| s.to_string()))
        } else {
            Ok(None)
        }
    }

    fn get_commit_log_for_fzf(&self) -> Result<String> {
        let mut revwalk = self
            .repo
            .revwalk()
            .map_err(|e| VcsError::Other(format!("failed to create revwalk: {}", e)))?;

        revwalk
            .push_head()
            .map_err(|e| VcsError::Other(format!("failed to push head: {}", e)))?;

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);

        let mut output = String::new();
        for oid_result in revwalk {
            let oid = oid_result.map_err(|e| VcsError::Other(format!("revwalk error: {}", e)))?;
            let commit = self
                .repo
                .find_commit(oid)
                .map_err(|e| VcsError::Other(format!("failed to find commit: {}", e)))?;

            let short_id = &oid.to_string()[..7];
            let summary = commit.summary().unwrap_or("");
            let time_secs = commit.time().seconds();
            let relative_time = format_relative_time(now - time_secs);

            output.push_str(&format!(
                "\x1b[33m{}\x1b[0m {} \x1b[90m{}\x1b[0m\n",
                short_id, summary, relative_time
            ));
        }

        Ok(output)
    }

    fn resolve_ref(&self, reference: &str) -> Result<String> {
        let reference = reference.trim();
        Self::validate_ref_format(reference)?;

        let obj = self
            .repo
            .revparse_single(reference)
            .map_err(|_| VcsError::InvalidRef(reference.to_string()))?;

        let commit = obj
            .peel_to_commit()
            .map_err(|_| VcsError::InvalidRef(reference.to_string()))?;

        Ok(commit.id().to_string())
    }

    fn get_working_tree_changed_files(&self) -> Result<Vec<String>> {
        use std::collections::HashSet;

        let mut opts = StatusOptions::new();
        opts.include_untracked(true);
        opts.exclude_submodules(true);
        opts.include_ignored(false);

        let statuses = self
            .repo
            .statuses(Some(&mut opts))
            .map_err(|e| VcsError::Other(format!("failed to get status: {}", e)))?;

        let files: HashSet<String> = statuses
            .iter()
            .filter_map(|s| s.path().map(String::from))
            .collect();

        Ok(files.into_iter().collect())
    }

    fn get_merge_base(&self, ref1: &str, ref2: &str) -> Result<String> {
        let ref1 = ref1.trim();
        let ref2 = ref2.trim();

        Self::validate_ref_format(ref1)?;
        Self::validate_ref_format(ref2)?;

        let obj1 = self
            .repo
            .revparse_single(ref1)
            .map_err(|_| VcsError::InvalidRef(ref1.to_string()))?;
        let oid1 = obj1
            .peel_to_commit()
            .map_err(|_| VcsError::InvalidRef(ref1.to_string()))?
            .id();

        let obj2 = self
            .repo
            .revparse_single(ref2)
            .map_err(|_| VcsError::InvalidRef(ref2.to_string()))?;
        let oid2 = obj2
            .peel_to_commit()
            .map_err(|_| VcsError::InvalidRef(ref2.to_string()))?
            .id();

        let merge_base = self
            .repo
            .merge_base(oid1, oid2)
            .map_err(|e| VcsError::Other(format!("failed to find merge base: {}", e)))?;

        Ok(merge_base.to_string())
    }

    fn working_copy_parent_ref(&self) -> &'static str {
        "HEAD"
    }

    fn get_range_changed_files(&self, from: &str, to: &str) -> Result<Vec<String>> {
        let from = from.trim();
        let to = to.trim();

        Self::validate_ref_format(from)?;
        Self::validate_ref_format(to)?;

        let from_obj = self
            .repo
            .revparse_single(from)
            .map_err(|_| VcsError::InvalidRef(from.to_string()))?;
        let from_tree = from_obj
            .peel_to_commit()
            .map_err(|_| VcsError::InvalidRef(from.to_string()))?
            .tree()
            .map_err(|e| VcsError::Other(format!("failed to get from tree: {}", e)))?;

        let to_obj = self
            .repo
            .revparse_single(to)
            .map_err(|_| VcsError::InvalidRef(to.to_string()))?;
        let to_tree = to_obj
            .peel_to_commit()
            .map_err(|_| VcsError::InvalidRef(to.to_string()))?
            .tree()
            .map_err(|e| VcsError::Other(format!("failed to get to tree: {}", e)))?;

        let diff = self
            .repo
            .diff_tree_to_tree(Some(&from_tree), Some(&to_tree), None)
            .map_err(|e| VcsError::Other(format!("failed to create diff: {}", e)))?;

        Ok(diff
            .deltas()
            .filter_map(|d| {
                d.new_file()
                    .path()
                    .and_then(|p| p.to_str().map(String::from))
            })
            .collect())
    }

    fn get_parent_ref_or_empty(&self, reference: &str) -> Result<String> {
        let reference = reference.trim();
        Self::validate_ref_format(reference)?;

        let obj = self
            .repo
            .revparse_single(reference)
            .map_err(|_| VcsError::InvalidRef(reference.to_string()))?;
        let commit = obj
            .peel_to_commit()
            .map_err(|_| VcsError::InvalidRef(reference.to_string()))?;

        if commit.parent_count() > 0 {
            Ok(format!("{}^", reference))
        } else {
            // Git's empty tree SHA
            Ok("4b825dc642cb6eb9a060e54bf8d69288fbee4904".to_string())
        }
    }

    fn get_commits_in_range(&self, from: &str, to: &str) -> Result<Vec<StackedCommitInfo>> {
        let from = from.trim();
        let to = to.trim();

        Self::validate_ref_format(from)?;
        Self::validate_ref_format(to)?;

        let from_obj = self
            .repo
            .revparse_single(from)
            .map_err(|_| VcsError::InvalidRef(from.to_string()))?;
        let from_oid = from_obj
            .peel_to_commit()
            .map_err(|_| VcsError::InvalidRef(from.to_string()))?
            .id();

        let to_obj = self
            .repo
            .revparse_single(to)
            .map_err(|_| VcsError::InvalidRef(to.to_string()))?;
        let to_oid = to_obj
            .peel_to_commit()
            .map_err(|_| VcsError::InvalidRef(to.to_string()))?
            .id();

        let mut revwalk = self
            .repo
            .revwalk()
            .map_err(|e| VcsError::Other(format!("failed to create revwalk: {}", e)))?;
        revwalk
            .push(to_oid)
            .map_err(|e| VcsError::Other(format!("failed to push to revwalk: {}", e)))?;
        revwalk
            .hide(from_oid)
            .map_err(|e| VcsError::Other(format!("failed to hide from revwalk: {}", e)))?;

        let mut commits: Vec<StackedCommitInfo> = Vec::new();
        for oid_result in revwalk {
            let oid = oid_result.map_err(|e| VcsError::Other(format!("revwalk error: {}", e)))?;
            let commit = self
                .repo
                .find_commit(oid)
                .map_err(|e| VcsError::Other(format!("failed to find commit: {}", e)))?;

            let commit_id = oid.to_string();
            let short_id = commit_id[..7.min(commit_id.len())].to_string();
            let summary = commit.summary().unwrap_or("").to_string();

            // Filter commits with no file changes
            if self
                .get_changed_files(&commit_id)
                .map(|f| !f.is_empty())
                .unwrap_or(false)
            {
                commits.push(StackedCommitInfo {
                    commit_id,
                    short_id,
                    change_id: None,
                    summary,
                });
            }
        }

        // Reverse to get oldest first
        commits.reverse();
        Ok(commits)
    }

    fn name(&self) -> &'static str {
        "git"
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vcs::test_utils::RepoGuard;

    #[test]
    fn test_get_commit_returns_valid_info() {
        let _repo = RepoGuard::new();
        let backend = GitBackend::new(Path::new(".")).expect("should open repo");

        let info = backend.get_commit("HEAD").expect("should get commit");
        assert!(!info.commit_id.is_empty());
        assert!(info.change_id.is_none());
        assert_eq!(info.message, "init");
        assert!(info.author.contains("Test User"));
    }

    #[test]
    fn test_get_working_tree_diff_returns_string() {
        let _repo = RepoGuard::new();
        let backend = GitBackend::new(Path::new(".")).expect("should open repo");

        let diff = backend.get_working_tree_diff(false);
        assert!(diff.is_ok());
    }

    #[test]
    fn test_get_changed_files_returns_paths() {
        let _repo = RepoGuard::new();
        let backend = GitBackend::new(Path::new(".")).expect("should open repo");

        let files = backend.get_changed_files("HEAD").expect("should get files");
        assert!(files.contains(&"README.md".to_string()));
    }

    #[test]
    fn test_get_current_branch() {
        let _repo = RepoGuard::new();
        let backend = GitBackend::new(Path::new(".")).expect("should open repo");

        let branch = backend.get_current_branch().expect("should get branch");
        assert!(branch.is_some());
    }

    #[test]
    fn test_get_file_content_at_ref() {
        let _repo = RepoGuard::new();
        let backend = GitBackend::new(Path::new(".")).expect("should open repo");

        let content = backend
            .get_file_content_at_ref("HEAD", Path::new("README.md"))
            .expect("should get content");
        assert_eq!(content.trim(), "hello");
    }

    #[test]
    fn test_invalid_ref_returns_error() {
        let _repo = RepoGuard::new();
        let backend = GitBackend::new(Path::new(".")).expect("should open repo");

        let result = backend.get_commit("nonexistent12345");
        assert!(result.is_err());
    }

    #[test]
    fn test_resolve_ref_head_returns_sha() {
        let _repo = RepoGuard::new();
        let backend = GitBackend::new(Path::new(".")).expect("should open repo");

        let sha = backend.resolve_ref("HEAD").expect("should resolve HEAD");
        assert_eq!(sha.len(), 40);
        assert!(sha.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn test_working_copy_parent_ref_returns_head() {
        let _repo = RepoGuard::new();
        let backend = GitBackend::new(Path::new(".")).expect("should open repo");
        assert_eq!(backend.working_copy_parent_ref(), "HEAD");
    }

    #[test]
    fn test_ref_starting_with_dash_rejected() {
        let _repo = RepoGuard::new();
        let backend = GitBackend::new(Path::new(".")).expect("should open repo");

        let result = backend.get_commit("--upload-pack=evil");
        assert!(matches!(result, Err(VcsError::InvalidRef(_))));
    }
}
