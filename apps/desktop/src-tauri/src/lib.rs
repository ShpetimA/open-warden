use serde::{Deserialize, Serialize};
use specta::Type;
use specta_typescript::Typescript;
use std::path::{Path, PathBuf};

use agent_leash::vcs::{
    commit_staged_for_path, discard_all_for_path, discard_file_for_path,
    get_commit_file_versions_for_path, get_commit_files_for_path, get_commit_history_for_path,
    get_file_versions_for_path, get_git_snapshot_for_path, stage_all_for_path, stage_file_for_path,
    unstage_all_for_path, unstage_file_for_path, DiffBucket,
};

type CmdResult<T> = std::result::Result<T, ApiError>;

#[derive(Debug, Clone, Copy, Serialize, Type)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
enum ErrorCode {
    InvalidInput,
    InvalidStatus,
    Backend,
}

#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
struct ApiError {
    code: ErrorCode,
    message: String,
    details: Option<String>,
}

impl ApiError {
    fn invalid_input(message: impl Into<String>) -> Self {
        Self {
            code: ErrorCode::InvalidInput,
            message: message.into(),
            details: None,
        }
    }

    fn invalid_status(status: &str) -> Self {
        Self {
            code: ErrorCode::InvalidStatus,
            message: format!("invalid file status: {}", status),
            details: Some(status.to_string()),
        }
    }

    fn backend(action: &str, error: impl ToString) -> Self {
        Self {
            code: ErrorCode::Backend,
            message: action.to_string(),
            details: Some(error.to_string()),
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type)]
#[serde(rename_all = "kebab-case")]
enum Bucket {
    Unstaged,
    Staged,
    Untracked,
}

impl From<Bucket> for DiffBucket {
    fn from(value: Bucket) -> Self {
        match value {
            Bucket::Unstaged => DiffBucket::Unstaged,
            Bucket::Staged => DiffBucket::Staged,
            Bucket::Untracked => DiffBucket::Untracked,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Type)]
#[serde(rename_all = "kebab-case")]
enum FileStatus {
    Added,
    Deleted,
    Renamed,
    Copied,
    TypeChanged,
    Unmerged,
    Modified,
    Untracked,
}

#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
struct FileItem {
    path: String,
    previous_path: Option<String>,
    status: FileStatus,
}

#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
struct HistoryCommit {
    commit_id: String,
    short_id: String,
    summary: String,
    author: String,
    relative_time: String,
}

#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
struct GitSnapshot {
    repo_root: String,
    branch: String,
    unstaged: Vec<FileItem>,
    staged: Vec<FileItem>,
    untracked: Vec<FileItem>,
}

#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
struct DiffFile {
    name: String,
    contents: String,
}

#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
struct FileVersions {
    old_file: Option<DiffFile>,
    new_file: Option<DiffFile>,
}

#[derive(Debug, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
struct DiscardFileInput {
    rel_path: String,
    bucket: Bucket,
}

fn parse_repo_path(repo_path: &str) -> CmdResult<PathBuf> {
    if repo_path.trim().is_empty() {
        return Err(ApiError::invalid_input("repository path is empty"));
    }
    Ok(PathBuf::from(repo_path))
}

fn parse_file_status(status: &str) -> CmdResult<FileStatus> {
    match status {
        "added" => Ok(FileStatus::Added),
        "deleted" => Ok(FileStatus::Deleted),
        "renamed" => Ok(FileStatus::Renamed),
        "copied" => Ok(FileStatus::Copied),
        "type-changed" => Ok(FileStatus::TypeChanged),
        "unmerged" => Ok(FileStatus::Unmerged),
        "modified" => Ok(FileStatus::Modified),
        "untracked" => Ok(FileStatus::Untracked),
        _ => Err(ApiError::invalid_status(status)),
    }
}

fn map_file_item(path: String, previous_path: Option<String>, status: &str) -> CmdResult<FileItem> {
    Ok(FileItem {
        path,
        previous_path,
        status: parse_file_status(status)?,
    })
}

fn map_diff_file(file: agent_leash::vcs::DiffFile) -> DiffFile {
    DiffFile {
        name: file.name,
        contents: file.contents,
    }
}

#[tauri::command]
#[specta::specta]
fn get_git_snapshot(repo_path: String) -> CmdResult<GitSnapshot> {
    let repo_path = parse_repo_path(&repo_path)?;
    let snapshot = get_git_snapshot_for_path(&repo_path)
        .map_err(|e| ApiError::backend("failed to load git snapshot", e))?;

    let map_items = |items: Vec<agent_leash::vcs::SnapshotFile>| -> CmdResult<Vec<FileItem>> {
        items
            .into_iter()
            .map(|item| map_file_item(item.path, None, &item.status))
            .collect()
    };

    Ok(GitSnapshot {
        repo_root: snapshot.repo_root,
        branch: snapshot.branch,
        unstaged: map_items(snapshot.unstaged)?,
        staged: map_items(snapshot.staged)?,
        untracked: map_items(snapshot.untracked)?,
    })
}

#[tauri::command]
#[specta::specta]
fn get_commit_history(repo_path: String, limit: Option<u32>) -> CmdResult<Vec<HistoryCommit>> {
    let repo_path = parse_repo_path(&repo_path)?;
    let history = get_commit_history_for_path(&repo_path, limit.unwrap_or(200) as usize)
        .map_err(|e| ApiError::backend("failed to load commit history", e))?;

    Ok(history
        .into_iter()
        .map(|commit| HistoryCommit {
            commit_id: commit.commit_id,
            short_id: commit.short_id,
            summary: commit.summary,
            author: commit.author,
            relative_time: commit.relative_time,
        })
        .collect())
}

#[tauri::command]
#[specta::specta]
fn get_commit_files(repo_path: String, commit_id: String) -> CmdResult<Vec<FileItem>> {
    let repo_path = parse_repo_path(&repo_path)?;
    let files = get_commit_files_for_path(&repo_path, &commit_id)
        .map_err(|e| ApiError::backend("failed to load commit files", e))?;

    files
        .into_iter()
        .map(|file| map_file_item(file.path, file.previous_path, &file.status))
        .collect()
}

#[tauri::command]
#[specta::specta]
fn get_commit_file_versions(
    repo_path: String,
    commit_id: String,
    rel_path: String,
    previous_path: Option<String>,
) -> CmdResult<FileVersions> {
    let repo_path = parse_repo_path(&repo_path)?;
    let versions = get_commit_file_versions_for_path(
        &repo_path,
        &commit_id,
        Path::new(&rel_path),
        previous_path.as_deref().map(Path::new),
    )
    .map_err(|e| ApiError::backend("failed to load commit file versions", e))?;

    Ok(FileVersions {
        old_file: versions.old_file.map(map_diff_file),
        new_file: versions.new_file.map(map_diff_file),
    })
}

#[tauri::command]
#[specta::specta]
fn get_file_versions(
    repo_path: String,
    rel_path: String,
    bucket: Bucket,
) -> CmdResult<FileVersions> {
    let repo_path = parse_repo_path(&repo_path)?;
    let versions = get_file_versions_for_path(&repo_path, Path::new(&rel_path), bucket.into())
        .map_err(|e| ApiError::backend("failed to load file versions", e))?;

    Ok(FileVersions {
        old_file: versions.old_file.map(map_diff_file),
        new_file: versions.new_file.map(map_diff_file),
    })
}

#[tauri::command]
#[specta::specta]
fn stage_file(repo_path: String, rel_path: String) -> CmdResult<()> {
    let repo_path = parse_repo_path(&repo_path)?;
    stage_file_for_path(&repo_path, Path::new(&rel_path))
        .map_err(|e| ApiError::backend("failed to stage file", e))
}

#[tauri::command]
#[specta::specta]
fn unstage_file(repo_path: String, rel_path: String) -> CmdResult<()> {
    let repo_path = parse_repo_path(&repo_path)?;
    unstage_file_for_path(&repo_path, Path::new(&rel_path))
        .map_err(|e| ApiError::backend("failed to unstage file", e))
}

#[tauri::command]
#[specta::specta]
fn stage_all(repo_path: String) -> CmdResult<()> {
    let repo_path = parse_repo_path(&repo_path)?;
    stage_all_for_path(&repo_path).map_err(|e| ApiError::backend("failed to stage all files", e))
}

#[tauri::command]
#[specta::specta]
fn unstage_all(repo_path: String) -> CmdResult<()> {
    let repo_path = parse_repo_path(&repo_path)?;
    unstage_all_for_path(&repo_path)
        .map_err(|e| ApiError::backend("failed to unstage all files", e))
}

#[tauri::command]
#[specta::specta]
fn discard_file(repo_path: String, rel_path: String, bucket: Bucket) -> CmdResult<()> {
    let repo_path = parse_repo_path(&repo_path)?;
    discard_file_for_path(&repo_path, Path::new(&rel_path), bucket.into())
        .map_err(|e| ApiError::backend("failed to discard file changes", e))
}

#[tauri::command]
#[specta::specta]
fn discard_files(repo_path: String, files: Vec<DiscardFileInput>) -> CmdResult<()> {
    let repo_path = parse_repo_path(&repo_path)?;
    for file in files {
        discard_file_for_path(&repo_path, Path::new(&file.rel_path), file.bucket.into())
            .map_err(|e| ApiError::backend("failed to discard file changes", e))?;
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
fn discard_all(repo_path: String) -> CmdResult<()> {
    let repo_path = parse_repo_path(&repo_path)?;
    discard_all_for_path(&repo_path)
        .map_err(|e| ApiError::backend("failed to discard all changes", e))
}

#[tauri::command]
#[specta::specta]
fn commit_staged(repo_path: String, message: String) -> CmdResult<String> {
    let repo_path = parse_repo_path(&repo_path)?;
    commit_staged_for_path(&repo_path, &message)
        .map_err(|e| ApiError::backend("failed to create commit", e))
}

fn command_builder() -> tauri_specta::Builder<tauri::Wry> {
    tauri_specta::Builder::<tauri::Wry>::new().commands(tauri_specta::collect_commands![
        get_git_snapshot,
        get_commit_history,
        get_commit_files,
        get_commit_file_versions,
        get_file_versions,
        stage_file,
        unstage_file,
        stage_all,
        unstage_all,
        discard_file,
        discard_files,
        discard_all,
        commit_staged,
    ])
}

pub fn export_typescript_bindings() -> std::result::Result<(), Box<dyn std::error::Error>> {
    let output_path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../src/bindings.ts");
    command_builder().export(
        Typescript::default().header(
            "// @ts-nocheck\n/* eslint-disable */\n// This file was generated by tauri-specta. Do not edit manually.",
        ),
        &output_path,
    )?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(debug_assertions)]
    if let Err(error) = export_typescript_bindings() {
        eprintln!("failed to export tauri bindings: {}", error);
    }

    let command_builder = command_builder();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .invoke_handler(command_builder.invoke_handler())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
