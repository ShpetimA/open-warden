//! Jujutsu (jj) backend implementation using jj-lib.

use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;

use chrono::Local;
use futures::StreamExt;
use jj_lib::backend::TreeValue;
use jj_lib::commit::Commit;
use jj_lib::config::StackedConfig;
use jj_lib::conflict_labels::ConflictLabels;
use jj_lib::conflicts::{
    materialize_merge_result_to_bytes, try_materialize_file_conflict_value, ConflictMarkerStyle,
    ConflictMaterializeOptions,
};
use jj_lib::diff::{diff, DiffHunkKind};
use jj_lib::files::FileMergeHunkLevel;
use jj_lib::matchers::EverythingMatcher;
use jj_lib::merge::{MergedTreeValue, SameChange};
use jj_lib::object_id::ObjectId;
use jj_lib::repo::{ReadonlyRepo, Repo, StoreFactories};
use jj_lib::repo_path::RepoPath;
use jj_lib::repo_path::RepoPathUiConverter;
use jj_lib::revset::{
    RevsetAliasesMap, RevsetDiagnostics, RevsetExtensions, RevsetParseContext,
    RevsetWorkspaceContext, SymbolResolver, SymbolResolverExtension,
};
use jj_lib::settings::UserSettings;
use jj_lib::time_util::DatePatternContext;
use jj_lib::tree_merge::MergeOptions;
use jj_lib::workspace::{default_working_copy_factories, Workspace};
use pollster::FutureExt;

use super::backend::{CommitInfo, Result, StackedCommitInfo, VcsBackend, VcsError};

/// Files to exclude from diff output.
const DIFF_EXCLUDED_FILES: &[&str] = &[
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "Cargo.lock",
];

/// Path patterns to exclude from diff output.
const DIFF_EXCLUDED_PATTERNS: &[&str] = &["node_modules/"];

/// Detect git-style refs and suggest jj equivalents.
fn detect_git_syntax(ref_str: &str) -> Option<String> {
    let s = ref_str.trim();

    if s == "HEAD" {
        return Some("@-".to_string());
    }

    if let Some(rest) = s.strip_prefix("HEAD~").or_else(|| s.strip_prefix("HEAD^")) {
        if let Ok(n) = rest.parse::<usize>() {
            return Some(format!("@{}", "-".repeat(n + 1)));
        }
    }

    if s == "HEAD~" || s == "HEAD^" {
        return Some("@--".to_string());
    }

    None
}

/// Format error with git syntax hint if applicable.
fn format_ref_error(ref_str: &str, base_error: &str) -> VcsError {
    if let Some(suggestion) = detect_git_syntax(ref_str) {
        VcsError::Other(format!(
            "'{}' is git syntax, use '{}' instead",
            ref_str, suggestion
        ))
    } else {
        VcsError::InvalidRef(base_error.to_string())
    }
}

/// Truncate a hash string to the given length.
fn truncate_hash(hash: &str, max_len: usize) -> &str {
    if hash.is_empty() {
        return hash;
    }
    &hash[..max_len.min(hash.len())]
}

/// Check if a path should be excluded from diff output.
fn should_exclude_path(path: &str) -> bool {
    if let Some(filename) = path.rsplit('/').next() {
        if DIFF_EXCLUDED_FILES.contains(&filename) {
            return true;
        }
    }
    for pattern in DIFF_EXCLUDED_PATTERNS {
        if path.contains(pattern) {
            return true;
        }
    }
    false
}

/// Jujutsu backend using jj-lib for native repo access.
pub struct JjBackend {
    workspace: Workspace,
    repo: Arc<ReadonlyRepo>,
    settings: UserSettings,
    workspace_path: std::path::PathBuf,
}

impl JjBackend {
    /// Load a jj workspace and repository from the given path.
    pub fn new(workspace_path: &Path) -> Result<Self> {
        let config = StackedConfig::with_defaults();
        let settings = UserSettings::from_config(config)
            .map_err(|e| VcsError::Other(format!("failed to create settings: {}", e)))?;

        let workspace = Workspace::load(
            &settings,
            workspace_path,
            &StoreFactories::default(),
            &default_working_copy_factories(),
        )
        .map_err(|e| VcsError::Other(format!("failed to load workspace: {}", e)))?;

        let repo = workspace
            .repo_loader()
            .load_at_head()
            .map_err(|e| VcsError::Other(format!("failed to load repo: {}", e)))?;

        Ok(JjBackend {
            workspace,
            repo,
            settings,
            workspace_path: workspace_path.to_path_buf(),
        })
    }

    /// Create RevsetParseContext and call the provided function with it.
    fn with_revset_context<T, F>(&self, f: F) -> Result<T>
    where
        F: FnOnce(&RevsetParseContext) -> Result<T>,
    {
        let path_converter = RepoPathUiConverter::Fs {
            cwd: self.workspace_path.clone(),
            base: self.workspace_path.clone(),
        };
        let workspace_ctx = RevsetWorkspaceContext {
            path_converter: &path_converter,
            workspace_name: self.workspace.workspace_name(),
        };

        let context = RevsetParseContext {
            aliases_map: &RevsetAliasesMap::default(),
            local_variables: HashMap::new(),
            user_email: self.settings.user_email(),
            date_pattern_context: DatePatternContext::from(Local::now()),
            default_ignored_remote: None,
            use_glob_by_default: true,
            extensions: &RevsetExtensions::default(),
            workspace: Some(workspace_ctx),
        };

        f(&context)
    }

    /// Resolve a revset expression to a single commit.
    fn resolve_single_commit(&self, revset_str: &str) -> Result<Commit> {
        let repo = self.repo.as_ref();

        self.with_revset_context(|context| {
            let mut diagnostics = RevsetDiagnostics::new();
            let expression = jj_lib::revset::parse(&mut diagnostics, revset_str, context)
                .map_err(|e| format_ref_error(revset_str, &format!("parse error: {}", e)))?;

            let symbol_resolver =
                SymbolResolver::new(repo, &([] as [&Box<dyn SymbolResolverExtension>; 0]));

            let resolved = expression
                .resolve_user_expression(repo, &symbol_resolver)
                .map_err(|e| format_ref_error(revset_str, &format!("resolution error: {}", e)))?;

            let revset = resolved
                .evaluate(repo)
                .map_err(|e| VcsError::Other(format!("evaluation error: {}", e)))?;

            let mut iter = revset.iter();
            let commit_id = iter
                .next()
                .ok_or_else(|| {
                    format_ref_error(revset_str, &format!("revision '{}' not found", revset_str))
                })?
                .map_err(|e| VcsError::Other(format!("iterator error: {}", e)))?;

            let commit = repo
                .store()
                .get_commit(&commit_id)
                .map_err(|e| VcsError::Other(format!("failed to load commit: {}", e)))?;

            Ok(commit)
        })
    }

    /// Generate a unified diff for a commit.
    fn generate_diff(&self, commit: &Commit) -> Result<String> {
        let repo = self.repo.as_ref();

        let parent_tree = if commit.parent_ids().is_empty() {
            repo.store().empty_merged_tree()
        } else {
            let parent_id = &commit.parent_ids()[0];
            let parent = repo
                .store()
                .get_commit(parent_id)
                .map_err(|e| VcsError::Other(format!("failed to get parent: {}", e)))?;
            parent.tree()
        };

        let commit_tree = commit.tree();
        let mut diff_output = String::new();

        let diff_stream = parent_tree.diff_stream(&commit_tree, &EverythingMatcher);
        let entries: Vec<_> = async { diff_stream.collect().await }.block_on();

        for entry in entries {
            let diff_values = entry
                .values
                .map_err(|e| VcsError::Other(format!("diff iteration error: {}", e)))?;

            let path_str = entry.path.as_internal_file_string();

            if should_exclude_path(path_str) {
                continue;
            }

            let old_content =
                self.get_content_from_value(repo, &entry.path, &diff_values.before)?;
            let new_content = self.get_content_from_value(repo, &entry.path, &diff_values.after)?;

            self.format_diff_entry(&mut diff_output, path_str, &old_content, &new_content);
        }

        Ok(diff_output)
    }

    /// Format a single diff entry.
    fn format_diff_entry(
        &self,
        output: &mut String,
        path_str: &str,
        old_content: &Option<String>,
        new_content: &Option<String>,
    ) {
        if old_content.is_none() && new_content.is_some() {
            output.push_str(&format!("diff --git a/{} b/{}\n", path_str, path_str));
            output.push_str("new file mode 100644\n");
            output.push_str("--- /dev/null\n");
            output.push_str(&format!("+++ b/{}\n", path_str));
            if let Some(content) = new_content {
                self.format_hunk(output, "", content);
            }
        } else if old_content.is_some() && new_content.is_none() {
            output.push_str(&format!("diff --git a/{} b/{}\n", path_str, path_str));
            output.push_str("deleted file mode 100644\n");
            output.push_str(&format!("--- a/{}\n", path_str));
            output.push_str("+++ /dev/null\n");
            if let Some(content) = old_content {
                self.format_hunk(output, content, "");
            }
        } else if let (Some(old), Some(new)) = (old_content, new_content) {
            if old != new {
                output.push_str(&format!("diff --git a/{} b/{}\n", path_str, path_str));
                output.push_str(&format!("--- a/{}\n", path_str));
                output.push_str(&format!("+++ b/{}\n", path_str));
                self.format_hunk(output, old, new);
            }
        }
    }

    /// Get content from a MergedTreeValue.
    fn get_content_from_value(
        &self,
        repo: &dyn Repo,
        path: &RepoPath,
        value: &MergedTreeValue,
    ) -> Result<Option<String>> {
        if let Some(resolved) = value.as_resolved() {
            match resolved {
                Some(TreeValue::File { id, .. }) => {
                    let mut content = Vec::new();
                    let mut reader = repo
                        .store()
                        .read_file(path, id)
                        .block_on()
                        .map_err(|e| VcsError::Other(format!("failed to read file: {}", e)))?;

                    async { tokio::io::AsyncReadExt::read_to_end(&mut reader, &mut content).await }
                        .block_on()
                        .map_err(|e| VcsError::Other(format!("failed to read content: {}", e)))?;

                    Ok(Some(String::from_utf8_lossy(&content).into_owned()))
                }
                None => Ok(None),
                _ => Ok(None),
            }
        } else {
            self.materialize_conflict(repo, path, value)
        }
    }

    /// Materialize a conflict value into a string with conflict markers.
    fn materialize_conflict(
        &self,
        repo: &dyn Repo,
        path: &RepoPath,
        value: &MergedTreeValue,
    ) -> Result<Option<String>> {
        let labels = ConflictLabels::unlabeled();
        let file_conflict = try_materialize_file_conflict_value(repo.store(), path, value, &labels)
            .block_on()
            .map_err(|e| VcsError::Other(format!("failed to materialize conflict: {}", e)))?;

        match file_conflict {
            Some(file) => {
                let options = ConflictMaterializeOptions {
                    marker_style: ConflictMarkerStyle::Git,
                    marker_len: None,
                    merge: MergeOptions {
                        hunk_level: FileMergeHunkLevel::Line,
                        same_change: SameChange::Accept,
                    },
                };

                let content = materialize_merge_result_to_bytes(&file.contents, &labels, &options);
                Ok(Some(String::from_utf8_lossy(&content).into_owned()))
            }
            None => Ok(Some(
                "<<<<<<< Conflict (non-file)\n(complex conflict - file vs non-file)\n>>>>>>>\n"
                    .to_string(),
            )),
        }
    }

    /// Format a unified diff hunk.
    fn format_hunk(&self, output: &mut String, old: &str, new: &str) {
        const CONTEXT_LINES: usize = 3;

        let hunks = diff([old.as_bytes(), new.as_bytes()]);
        let old_lines: Vec<&str> = old.lines().collect();

        let mut old_pos = 0usize;
        let mut new_pos = 0usize;
        let mut pending_output = String::new();
        let mut hunk_old_start = 0usize;
        let mut hunk_new_start = 0usize;
        let mut hunk_old_count = 0usize;
        let mut hunk_new_count = 0usize;
        let mut in_hunk = false;

        fn count_lines(content: &[u8]) -> usize {
            if content.is_empty() {
                0
            } else {
                String::from_utf8_lossy(content).lines().count()
            }
        }

        fn for_each_line<F: FnMut(&str)>(content: &[u8], mut f: F) {
            let content_str = String::from_utf8_lossy(content);
            for line in content_str.lines() {
                f(line);
            }
        }

        for hunk in &hunks {
            match hunk.kind {
                DiffHunkKind::Matching => {
                    let content = &hunk.contents[0];
                    let content_str = String::from_utf8_lossy(content);
                    let lines: Vec<&str> = content_str.lines().collect();
                    let line_count = lines.len();

                    if in_hunk {
                        for line in lines.iter().take(CONTEXT_LINES) {
                            pending_output.push_str(&format!(" {}\n", line));
                            hunk_old_count += 1;
                            hunk_new_count += 1;
                        }

                        if line_count > CONTEXT_LINES * 2 {
                            output.push_str(&format!(
                                "@@ -{},{} +{},{} @@\n",
                                if hunk_old_start == 0 {
                                    0
                                } else {
                                    hunk_old_start
                                },
                                hunk_old_count,
                                if hunk_new_start == 0 {
                                    0
                                } else {
                                    hunk_new_start
                                },
                                hunk_new_count
                            ));
                            output.push_str(&pending_output);
                            pending_output.clear();
                            in_hunk = false;
                        }
                    }

                    old_pos += line_count;
                    new_pos += line_count;
                }
                DiffHunkKind::Different => {
                    let old_content = &hunk.contents[0];
                    let new_content = &hunk.contents[1];
                    let old_content_lines = count_lines(old_content);
                    let new_content_lines = count_lines(new_content);

                    if !in_hunk {
                        in_hunk = true;
                        hunk_old_start = old_pos.saturating_sub(CONTEXT_LINES) + 1;
                        hunk_new_start = new_pos.saturating_sub(CONTEXT_LINES) + 1;
                        hunk_old_count = 0;
                        hunk_new_count = 0;

                        let context_start = old_pos.saturating_sub(CONTEXT_LINES);
                        for i in context_start..old_pos {
                            if i < old_lines.len() {
                                pending_output.push_str(&format!(" {}\n", old_lines[i]));
                                hunk_old_count += 1;
                                hunk_new_count += 1;
                            }
                        }
                    }

                    for_each_line(old_content, |line| {
                        pending_output.push_str(&format!("-{}\n", line));
                        hunk_old_count += 1;
                    });

                    for_each_line(new_content, |line| {
                        pending_output.push_str(&format!("+{}\n", line));
                        hunk_new_count += 1;
                    });

                    old_pos += old_content_lines;
                    new_pos += new_content_lines;
                }
            }
        }

        if in_hunk {
            output.push_str(&format!(
                "@@ -{},{} +{},{} @@\n",
                if hunk_old_start == 0 {
                    0
                } else {
                    hunk_old_start
                },
                hunk_old_count,
                if hunk_new_start == 0 {
                    0
                } else {
                    hunk_new_start
                },
                hunk_new_count
            ));
            output.push_str(&pending_output);
        }

        if hunks.is_empty() || (old.is_empty() && new.is_empty()) {
            return;
        }

        if output.is_empty() && old != new {
            let old_line_count = old.lines().count();
            let new_line_count = new.lines().count();

            output.push_str(&format!(
                "@@ -{},{} +{},{} @@\n",
                if old_line_count == 0 { 0 } else { 1 },
                old_line_count,
                if new_line_count == 0 { 0 } else { 1 },
                new_line_count
            ));

            for line in old.lines() {
                output.push_str(&format!("-{}\n", line));
            }
            for line in new.lines() {
                output.push_str(&format!("+{}\n", line));
            }
        }
    }
}

impl VcsBackend for JjBackend {
    fn get_commit(&self, reference: &str) -> Result<CommitInfo> {
        let reference = reference.trim();
        let commit = self.resolve_single_commit(reference)?;

        let commit_id = commit.id().hex();
        let change_id = commit.change_id().hex();
        let message = commit.description().to_string();
        let author_sig = commit.author();
        let author = format!("{} <{}>", author_sig.name, author_sig.email);

        let date = chrono::DateTime::from_timestamp_millis(author_sig.timestamp.timestamp.0)
            .map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string())
            .unwrap_or_default();

        let diff = self.generate_diff(&commit)?;

        Ok(CommitInfo {
            commit_id,
            change_id: Some(change_id),
            message,
            diff,
            author,
            date,
        })
    }

    fn get_working_tree_diff(&self, _staged: bool) -> Result<String> {
        let wc_commit = self.resolve_single_commit("@")?;
        self.generate_diff(&wc_commit)
    }

    fn get_range_diff(&self, from: &str, to: &str, _three_dot: bool) -> Result<String> {
        let from_commit = self.resolve_single_commit(from)?;
        let to_commit = self.resolve_single_commit(to)?;

        let from_tree = from_commit.tree();
        let to_tree = to_commit.tree();

        let mut diff_output = String::new();
        let repo = self.repo.as_ref();

        let diff_stream = from_tree.diff_stream(&to_tree, &EverythingMatcher);
        let entries: Vec<_> = async { diff_stream.collect().await }.block_on();

        for entry in entries {
            let diff_values = entry
                .values
                .map_err(|e| VcsError::Other(format!("diff iteration error: {}", e)))?;

            let path_str = entry.path.as_internal_file_string();

            if should_exclude_path(path_str) {
                continue;
            }

            let old_content =
                self.get_content_from_value(repo, &entry.path, &diff_values.before)?;
            let new_content = self.get_content_from_value(repo, &entry.path, &diff_values.after)?;

            self.format_diff_entry(&mut diff_output, path_str, &old_content, &new_content);
        }

        Ok(diff_output)
    }

    fn get_changed_files(&self, reference: &str) -> Result<Vec<String>> {
        let commit = self.resolve_single_commit(reference)?;
        let repo = self.repo.as_ref();

        let parent_tree = if commit.parent_ids().is_empty() {
            repo.store().empty_merged_tree()
        } else {
            let parent_id = &commit.parent_ids()[0];
            let parent = repo
                .store()
                .get_commit(parent_id)
                .map_err(|e| VcsError::Other(format!("failed to get parent: {}", e)))?;
            parent.tree()
        };

        let commit_tree = commit.tree();
        let diff_stream = parent_tree.diff_stream(&commit_tree, &EverythingMatcher);
        let entries: Vec<_> = async { diff_stream.collect().await }.block_on();

        let mut files = Vec::new();
        for entry in entries {
            let path_str = entry.path.as_internal_file_string();
            if !should_exclude_path(path_str) {
                files.push(path_str.to_string());
            }
        }

        Ok(files)
    }

    fn get_file_content_at_ref(&self, reference: &str, path: &Path) -> Result<String> {
        let commit = self.resolve_single_commit(reference)?;
        let tree = commit.tree();

        let path_str = path.to_string_lossy().into_owned();
        let repo_path = jj_lib::repo_path::RepoPathBuf::from_internal_string(path_str.clone())
            .map_err(|e| VcsError::InvalidRef(format!("invalid path: {}", e)))?;

        let value = tree
            .path_value(&repo_path)
            .map_err(|e| VcsError::Other(format!("failed to get path value: {}", e)))?;

        if let Some(resolved) = value.as_resolved() {
            match resolved {
                Some(TreeValue::File { id, .. }) => {
                    let mut content = Vec::new();
                    let mut reader = self
                        .repo
                        .store()
                        .read_file(&repo_path, id)
                        .block_on()
                        .map_err(|e| VcsError::Other(format!("failed to read file: {}", e)))?;

                    async { tokio::io::AsyncReadExt::read_to_end(&mut reader, &mut content).await }
                        .block_on()
                        .map_err(|e| VcsError::Other(format!("failed to read content: {}", e)))?;

                    Ok(String::from_utf8_lossy(&content).into_owned())
                }
                None => Err(VcsError::FileNotFound(path_str)),
                Some(TreeValue::Symlink(_)) => {
                    Err(VcsError::Other("Symlinks not supported".to_string()))
                }
                Some(TreeValue::Tree(_)) => Err(VcsError::Other("Path is a directory".to_string())),
                Some(TreeValue::GitSubmodule(_)) => {
                    Err(VcsError::Other("Git submodules not supported".to_string()))
                }
            }
        } else {
            let repo = self.repo.as_ref();
            match self.materialize_conflict(repo, &repo_path, &value)? {
                Some(content) => Ok(content),
                None => Err(VcsError::FileNotFound(path_str)),
            }
        }
    }

    fn get_current_branch(&self) -> Result<Option<String>> {
        let wc_commit = self.resolve_single_commit("@")?;
        let wc_commit_id = wc_commit.id();

        for (name, target) in self.repo.view().local_bookmarks() {
            if let Some(commit_id) = target.as_normal() {
                if commit_id == wc_commit_id {
                    return Ok(Some(name.as_str().to_string()));
                }
            }
        }

        Ok(None)
    }

    fn resolve_ref(&self, reference: &str) -> Result<String> {
        let reference = reference.trim();
        let commit = self.resolve_single_commit(reference)?;
        Ok(commit.id().hex())
    }

    fn get_commit_log_for_fzf(&self) -> Result<String> {
        let repo = self.repo.as_ref();
        const MAX_COMMITS: usize = 100;

        self.with_revset_context(|context| {
            let mut diagnostics = RevsetDiagnostics::new();
            let expression = jj_lib::revset::parse(&mut diagnostics, "all()", context)
                .map_err(|e| VcsError::Other(format!("parse error: {}", e)))?;

            let symbol_resolver =
                SymbolResolver::new(repo, &([] as [&Box<dyn SymbolResolverExtension>; 0]));

            let resolved = expression
                .resolve_user_expression(repo, &symbol_resolver)
                .map_err(|e| VcsError::Other(format!("resolution error: {}", e)))?;

            let revset = resolved
                .evaluate(repo)
                .map_err(|e| VcsError::Other(format!("evaluation error: {}", e)))?;

            let mut output = String::new();

            for (count, commit_id_result) in revset.iter().enumerate() {
                if count >= MAX_COMMITS {
                    break;
                }

                let commit_id = commit_id_result
                    .map_err(|e| VcsError::Other(format!("iterator error: {}", e)))?;

                let commit = repo
                    .store()
                    .get_commit(&commit_id)
                    .map_err(|e| VcsError::Other(format!("failed to load commit: {}", e)))?;

                let change_id = commit.change_id().hex();
                let commit_hash = commit.id().hex();
                let description = commit.description().lines().next().unwrap_or("");

                output.push_str(&format!(
                    "{} {} {}\n",
                    truncate_hash(&change_id, 12),
                    truncate_hash(&commit_hash, 12),
                    description
                ));
            }

            Ok(output)
        })
    }

    fn get_working_tree_changed_files(&self) -> Result<Vec<String>> {
        let wc_commit = self.resolve_single_commit("@")?;
        let repo = self.repo.as_ref();

        let parent_tree = if wc_commit.parent_ids().is_empty() {
            repo.store().empty_merged_tree()
        } else {
            let parent_id = &wc_commit.parent_ids()[0];
            let parent = repo
                .store()
                .get_commit(parent_id)
                .map_err(|e| VcsError::Other(format!("failed to get parent: {}", e)))?;
            parent.tree()
        };

        let wc_tree = wc_commit.tree();
        let diff_stream = parent_tree.diff_stream(&wc_tree, &EverythingMatcher);
        let entries: Vec<_> = async { diff_stream.collect().await }.block_on();

        let mut files = Vec::new();
        for entry in entries {
            let path_str = entry.path.as_internal_file_string();
            if !should_exclude_path(path_str) {
                files.push(path_str.to_string());
            }
        }

        Ok(files)
    }

    fn get_merge_base(&self, ref1: &str, ref2: &str) -> Result<String> {
        let revset_str = format!("heads(::({}) & ::({}))", ref1.trim(), ref2.trim());
        let commit = self.resolve_single_commit(&revset_str)?;
        Ok(commit.id().hex())
    }

    fn working_copy_parent_ref(&self) -> &'static str {
        "@-"
    }

    fn get_range_changed_files(&self, from: &str, to: &str) -> Result<Vec<String>> {
        let from_commit = self.resolve_single_commit(from)?;
        let to_commit = self.resolve_single_commit(to)?;

        let from_tree = from_commit.tree();
        let to_tree = to_commit.tree();

        let diff_stream = from_tree.diff_stream(&to_tree, &EverythingMatcher);
        let entries: Vec<_> = async { diff_stream.collect().await }.block_on();

        let mut files = Vec::new();
        for entry in entries {
            let path_str = entry.path.as_internal_file_string();
            if !should_exclude_path(path_str) {
                files.push(path_str.to_string());
            }
        }

        Ok(files)
    }

    fn get_parent_ref_or_empty(&self, reference: &str) -> Result<String> {
        let commit = self.resolve_single_commit(reference)?;

        if commit.parent_ids().is_empty() {
            Ok("root()".to_string())
        } else {
            Ok(format!("{}-", reference.trim()))
        }
    }

    fn get_commits_in_range(&self, from: &str, to: &str) -> Result<Vec<StackedCommitInfo>> {
        let from = from.trim();
        let to = to.trim();
        let repo = self.repo.as_ref();

        let revset_str = format!("({}::{}) ~ ({})", from, to, from);

        self.with_revset_context(|context| {
            let mut diagnostics = RevsetDiagnostics::new();
            let expression = jj_lib::revset::parse(&mut diagnostics, &revset_str, context)
                .map_err(|_| {
                    if let Some(suggestion) = detect_git_syntax(from) {
                        return VcsError::Other(format!(
                            "'{}' is git syntax, use '{}' instead",
                            from, suggestion
                        ));
                    }
                    if let Some(suggestion) = detect_git_syntax(to) {
                        return VcsError::Other(format!(
                            "'{}' is git syntax, use '{}' instead",
                            to, suggestion
                        ));
                    }
                    VcsError::InvalidRef(format!("invalid range: {}..{}", from, to))
                })?;

            let symbol_resolver =
                SymbolResolver::new(repo, &([] as [&Box<dyn SymbolResolverExtension>; 0]));

            let resolved = expression
                .resolve_user_expression(repo, &symbol_resolver)
                .map_err(|_| {
                    if let Some(suggestion) = detect_git_syntax(from) {
                        return VcsError::Other(format!(
                            "'{}' is git syntax, use '{}' instead",
                            from, suggestion
                        ));
                    }
                    if let Some(suggestion) = detect_git_syntax(to) {
                        return VcsError::Other(format!(
                            "'{}' is git syntax, use '{}' instead",
                            to, suggestion
                        ));
                    }
                    VcsError::InvalidRef(format!("invalid range: {}..{}", from, to))
                })?;

            let revset = resolved
                .evaluate(repo)
                .map_err(|e| VcsError::Other(format!("evaluation error: {}", e)))?;

            let mut commits = Vec::new();

            for commit_id_result in revset.iter() {
                let commit_id = commit_id_result
                    .map_err(|e| VcsError::Other(format!("iterator error: {}", e)))?;

                let commit = repo
                    .store()
                    .get_commit(&commit_id)
                    .map_err(|e| VcsError::Other(format!("failed to load commit: {}", e)))?;

                let changed_files = self.get_changed_files(&commit.id().hex())?;
                if changed_files.is_empty() {
                    continue;
                }

                commits.push(StackedCommitInfo {
                    commit_id: commit.id().hex(),
                    short_id: truncate_hash(&commit.id().hex(), 12).to_string(),
                    change_id: Some(commit.change_id().hex()),
                    summary: commit
                        .description()
                        .lines()
                        .next()
                        .unwrap_or("")
                        .to_string(),
                });
            }

            commits.reverse();
            Ok(commits)
        })
    }

    fn name(&self) -> &'static str {
        "jj"
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vcs::test_utils::JjRepoGuard;

    #[test]
    fn test_jj_backend_new_succeeds_on_jj_repo() {
        let Some(repo) = JjRepoGuard::new() else {
            eprintln!("Skipping test: jj not available");
            return;
        };

        let backend = JjBackend::new(&repo.dir);
        assert!(backend.is_ok());
    }

    #[test]
    fn test_jj_backend_new_fails_on_non_jj_dir() {
        let temp = tempfile::TempDir::new().unwrap();
        let result = JjBackend::new(temp.path());
        assert!(result.is_err());
    }

    #[test]
    fn test_get_commit_at_working_copy() {
        let Some(repo) = JjRepoGuard::new() else {
            eprintln!("Skipping test: jj not available");
            return;
        };

        let backend = JjBackend::new(&repo.dir).expect("should load backend");
        let commit = backend.get_commit("@");
        assert!(commit.is_ok());

        let commit = commit.unwrap();
        assert!(!commit.commit_id.is_empty());
        assert!(commit.change_id.is_some());
    }

    #[test]
    fn test_get_changed_files() {
        let Some(repo) = JjRepoGuard::new() else {
            eprintln!("Skipping test: jj not available");
            return;
        };

        let backend = JjBackend::new(&repo.dir).expect("should load backend");
        let files = backend.get_changed_files("@");

        assert!(files.is_ok());
        let files = files.unwrap();
        assert!(files.contains(&"README.md".to_string()));
    }

    #[test]
    fn test_working_copy_parent_ref_returns_at_minus() {
        let Some(repo) = JjRepoGuard::new() else {
            eprintln!("Skipping test: jj not available");
            return;
        };

        let backend = JjBackend::new(&repo.dir).expect("should load backend");
        assert_eq!(backend.working_copy_parent_ref(), "@-");
    }

    #[test]
    fn test_detect_git_syntax() {
        assert_eq!(detect_git_syntax("HEAD").unwrap(), "@-");
        assert_eq!(detect_git_syntax("HEAD~2").unwrap(), "@---");
        assert_eq!(detect_git_syntax("HEAD~").unwrap(), "@--");
        assert!(detect_git_syntax("@").is_none());
        assert!(detect_git_syntax("main").is_none());
    }
}
