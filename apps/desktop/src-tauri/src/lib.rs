use serde::Serialize;
use std::path::{Path, PathBuf};

use agent_leash::vcs::{
    commit_staged_for_path, discard_all_for_path, discard_file_for_path,
    get_file_versions_for_path, get_git_snapshot_for_path, stage_all_for_path, stage_file_for_path,
    unstage_all_for_path, unstage_file_for_path, DiffBucket,
};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct FileItem {
    path: String,
    status: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GitSnapshot {
    repo_root: String,
    branch: String,
    unstaged: Vec<FileItem>,
    staged: Vec<FileItem>,
    untracked: Vec<FileItem>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DiffFile {
    name: String,
    contents: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct FileVersions {
    old_file: Option<DiffFile>,
    new_file: Option<DiffFile>,
}

fn parse_repo_path(repo_path: &str) -> Result<PathBuf, String> {
    if repo_path.trim().is_empty() {
        return Err("repository path is empty".to_string());
    }
    Ok(PathBuf::from(repo_path))
}

fn parse_bucket(bucket: &str) -> Result<DiffBucket, String> {
    DiffBucket::parse(bucket).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_git_snapshot(repo_path: String) -> Result<GitSnapshot, String> {
    let repo_path = parse_repo_path(&repo_path)?;
    let snapshot = get_git_snapshot_for_path(&repo_path).map_err(|e| e.to_string())?;

    let map_items = |items: Vec<agent_leash::vcs::SnapshotFile>| {
        items
            .into_iter()
            .map(|item| FileItem {
                path: item.path,
                status: item.status,
            })
            .collect()
    };

    Ok(GitSnapshot {
        repo_root: snapshot.repo_root,
        branch: snapshot.branch,
        unstaged: map_items(snapshot.unstaged),
        staged: map_items(snapshot.staged),
        untracked: map_items(snapshot.untracked),
    })
}

#[tauri::command]
fn get_file_versions(
    repo_path: String,
    rel_path: String,
    bucket: String,
) -> Result<FileVersions, String> {
    let repo_path = parse_repo_path(&repo_path)?;
    let bucket = parse_bucket(&bucket)?;
    let versions = get_file_versions_for_path(&repo_path, Path::new(&rel_path), bucket)
        .map_err(|e| e.to_string())?;

    let map_file = |file: agent_leash::vcs::DiffFile| DiffFile {
        name: file.name,
        contents: file.contents,
    };

    Ok(FileVersions {
        old_file: versions.old_file.map(map_file),
        new_file: versions.new_file.map(map_file),
    })
}

#[tauri::command]
fn stage_file(repo_path: String, rel_path: String) -> Result<(), String> {
    let repo_path = parse_repo_path(&repo_path)?;
    stage_file_for_path(&repo_path, Path::new(&rel_path)).map_err(|e| e.to_string())
}

#[tauri::command]
fn unstage_file(repo_path: String, rel_path: String) -> Result<(), String> {
    let repo_path = parse_repo_path(&repo_path)?;
    unstage_file_for_path(&repo_path, Path::new(&rel_path)).map_err(|e| e.to_string())
}

#[tauri::command]
fn stage_all(repo_path: String) -> Result<(), String> {
    let repo_path = parse_repo_path(&repo_path)?;
    stage_all_for_path(&repo_path).map_err(|e| e.to_string())
}

#[tauri::command]
fn unstage_all(repo_path: String) -> Result<(), String> {
    let repo_path = parse_repo_path(&repo_path)?;
    unstage_all_for_path(&repo_path).map_err(|e| e.to_string())
}

#[tauri::command]
fn discard_file(repo_path: String, rel_path: String, bucket: String) -> Result<(), String> {
    let repo_path = parse_repo_path(&repo_path)?;
    let bucket = parse_bucket(&bucket)?;
    discard_file_for_path(&repo_path, Path::new(&rel_path), bucket).map_err(|e| e.to_string())
}

#[tauri::command]
fn discard_all(repo_path: String) -> Result<(), String> {
    let repo_path = parse_repo_path(&repo_path)?;
    discard_all_for_path(&repo_path).map_err(|e| e.to_string())
}

#[tauri::command]
fn commit_staged(repo_path: String, message: String) -> Result<String, String> {
    let repo_path = parse_repo_path(&repo_path)?;
    commit_staged_for_path(&repo_path, &message).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            get_git_snapshot,
            get_file_versions,
            stage_file,
            unstage_file,
            stage_all,
            unstage_all,
            discard_file,
            discard_all,
            commit_staged
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
