use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Command;

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

fn run_git(repo_path: &Path, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(repo_path)
        .args(args)
        .output()
        .map_err(|e| format!("failed to run git: {e}"))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("git command failed: {stderr}"))
    }
}

fn run_git_allow_1(repo_path: &Path, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(repo_path)
        .args(args)
        .output()
        .map_err(|e| format!("failed to run git: {e}"))?;

    let code = output.status.code().unwrap_or(-1);
    if output.status.success() || code == 1 {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("git command failed: {stderr}"))
    }
}

fn status_from_code(code: &str) -> String {
    match code.chars().next().unwrap_or('M') {
        'A' => "added".to_string(),
        'D' => "deleted".to_string(),
        'R' => "renamed".to_string(),
        'C' => "copied".to_string(),
        'M' => "modified".to_string(),
        'T' => "type-changed".to_string(),
        'U' => "unmerged".to_string(),
        _ => "modified".to_string(),
    }
}

fn parse_name_status(raw: &str) -> Vec<FileItem> {
    raw.lines()
        .filter_map(|line| {
            if line.trim().is_empty() {
                return None;
            }

            let parts: Vec<&str> = line.split('\t').collect();
            if parts.is_empty() {
                return None;
            }

            let code = parts[0];
            let path = if (code.starts_with('R') || code.starts_with('C')) && parts.len() >= 3 {
                parts[2]
            } else if parts.len() >= 2 {
                parts[1]
            } else {
                return None;
            };

            Some(FileItem {
                path: path.to_string(),
                status: status_from_code(code),
            })
        })
        .collect()
}

fn parse_untracked(raw: &str) -> Vec<FileItem> {
    raw.lines()
        .filter(|line| !line.trim().is_empty())
        .map(|line| FileItem {
            path: line.to_string(),
            status: "untracked".to_string(),
        })
        .collect()
}

fn resolve_repo_root(repo_path: &str) -> Result<PathBuf, String> {
    let input = PathBuf::from(repo_path);
    if !input.exists() {
        return Err("selected folder does not exist".to_string());
    }

    let out = run_git(&input, &["rev-parse", "--show-toplevel"])?;
    let root = out.trim();
    if root.is_empty() {
        return Err("could not resolve git repo root".to_string());
    }

    Ok(PathBuf::from(root))
}

fn safe_repo_relative_path(repo_root: &Path, rel_path: &str) -> Result<PathBuf, String> {
    if rel_path.trim().is_empty() {
        return Err("path is empty".to_string());
    }

    let root = repo_root
        .canonicalize()
        .map_err(|e| format!("failed to access repo root: {e}"))?;
    let joined = root.join(rel_path);
    let canonical = joined
        .canonicalize()
        .map_err(|e| format!("failed to access file: {e}"))?;

    if !canonical.starts_with(&root) {
        return Err("path escapes repository root".to_string());
    }

    Ok(canonical)
}

fn validate_repo_relative_path(rel_path: &str) -> Result<(), String> {
    let path = Path::new(rel_path);
    if rel_path.trim().is_empty() {
        return Err("path is empty".to_string());
    }
    if path.is_absolute() {
        return Err("path must be repository-relative".to_string());
    }
    if path
        .components()
        .any(|c| matches!(c, std::path::Component::ParentDir))
    {
        return Err("path cannot contain '..'".to_string());
    }
    Ok(())
}

#[tauri::command]
fn get_git_snapshot(repo_path: String) -> Result<GitSnapshot, String> {
    let repo_root = resolve_repo_root(&repo_path)?;

    let branch = run_git(&repo_root, &["rev-parse", "--abbrev-ref", "HEAD"])?
        .trim()
        .to_string();
    let unstaged = parse_name_status(&run_git(&repo_root, &["diff", "--name-status"])?);
    let staged = parse_name_status(&run_git(
        &repo_root,
        &["diff", "--cached", "--name-status"],
    )?);
    let untracked = parse_untracked(&run_git(
        &repo_root,
        &["ls-files", "--others", "--exclude-standard"],
    )?);

    Ok(GitSnapshot {
        repo_root: repo_root.to_string_lossy().to_string(),
        branch,
        unstaged,
        staged,
        untracked,
    })
}

#[tauri::command]
fn get_file_patch(repo_path: String, rel_path: String, bucket: String) -> Result<String, String> {
    let repo_root = resolve_repo_root(&repo_path)?;
    let full_path = safe_repo_relative_path(&repo_root, &rel_path)?;

    match bucket.as_str() {
        "unstaged" => run_git(&repo_root, &["diff", "--", &rel_path]),
        "staged" => run_git(&repo_root, &["diff", "--cached", "--", &rel_path]),
        "untracked" => {
            if !full_path.is_file() {
                return Err("untracked path is not a file".to_string());
            }
            run_git_allow_1(
                &repo_root,
                &["diff", "--no-index", "--", "/dev/null", &rel_path],
            )
        }
        _ => Err("invalid bucket. expected unstaged|staged|untracked".to_string()),
    }
}

#[tauri::command]
fn stage_file(repo_path: String, rel_path: String) -> Result<(), String> {
    let repo_root = resolve_repo_root(&repo_path)?;
    validate_repo_relative_path(&rel_path)?;
    run_git(&repo_root, &["add", "--", &rel_path]).map(|_| ())
}

#[tauri::command]
fn unstage_file(repo_path: String, rel_path: String) -> Result<(), String> {
    let repo_root = resolve_repo_root(&repo_path)?;
    validate_repo_relative_path(&rel_path)?;
    run_git(&repo_root, &["restore", "--staged", "--", &rel_path]).map(|_| ())
}

#[tauri::command]
fn stage_all(repo_path: String) -> Result<(), String> {
    let repo_root = resolve_repo_root(&repo_path)?;
    run_git(&repo_root, &["add", "-A"]).map(|_| ())
}

#[tauri::command]
fn unstage_all(repo_path: String) -> Result<(), String> {
    let repo_root = resolve_repo_root(&repo_path)?;
    run_git(&repo_root, &["restore", "--staged", "."]).map(|_| ())
}

#[tauri::command]
fn discard_file(repo_path: String, rel_path: String, bucket: String) -> Result<(), String> {
    let repo_root = resolve_repo_root(&repo_path)?;
    validate_repo_relative_path(&rel_path)?;

    match bucket.as_str() {
        "staged" => run_git(
            &repo_root,
            &[
                "restore",
                "--source=HEAD",
                "--staged",
                "--worktree",
                "--",
                &rel_path,
            ],
        )
        .map(|_| ()),
        "unstaged" => run_git(&repo_root, &["restore", "--worktree", "--", &rel_path]).map(|_| ()),
        "untracked" => run_git(&repo_root, &["clean", "-f", "--", &rel_path]).map(|_| ()),
        _ => Err("invalid bucket. expected unstaged|staged|untracked".to_string()),
    }
}

#[tauri::command]
fn discard_all(repo_path: String) -> Result<(), String> {
    let repo_root = resolve_repo_root(&repo_path)?;
    run_git(&repo_root, &["reset", "--hard"])?;
    run_git(&repo_root, &["clean", "-fd"])?;
    Ok(())
}

#[tauri::command]
fn commit_staged(repo_path: String, message: String) -> Result<String, String> {
    if message.trim().is_empty() {
        return Err("commit message is empty".to_string());
    }
    let repo_root = resolve_repo_root(&repo_path)?;
    run_git(&repo_root, &["commit", "-m", &message])?;
    let sha = run_git(&repo_root, &["rev-parse", "HEAD"])?;
    Ok(sha.trim().to_string())
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
            get_file_patch,
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
