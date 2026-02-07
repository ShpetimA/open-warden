import { invoke } from '@tauri-apps/api/core'

import type { Bucket, FileItem, FileVersions, GitSnapshot, HistoryCommit } from '../types'

export async function getGitSnapshot(repoPath: string) {
  return invoke<GitSnapshot>('get_git_snapshot', { repoPath })
}

export async function getCommitHistory(repoPath: string, limit?: number) {
  return invoke<HistoryCommit[]>('get_commit_history', { repoPath, limit })
}

export async function getCommitFiles(repoPath: string, commitId: string) {
  return invoke<FileItem[]>('get_commit_files', { repoPath, commitId })
}

export async function getCommitFileVersions(
  repoPath: string,
  commitId: string,
  relPath: string,
  previousPath?: string,
) {
  return invoke<FileVersions>('get_commit_file_versions', { repoPath, commitId, relPath, previousPath })
}

export async function getFileVersions(repoPath: string, bucket: Bucket, relPath: string) {
  return invoke<FileVersions>('get_file_versions', { repoPath, bucket, relPath })
}

export async function stageFile(repoPath: string, relPath: string) {
  await invoke('stage_file', { repoPath, relPath })
}

export async function unstageFile(repoPath: string, relPath: string) {
  await invoke('unstage_file', { repoPath, relPath })
}

export async function discardFile(repoPath: string, relPath: string, bucket: Bucket) {
  await invoke('discard_file', { repoPath, relPath, bucket })
}

export async function stageAll(repoPath: string) {
  await invoke('stage_all', { repoPath })
}

export async function unstageAll(repoPath: string) {
  await invoke('unstage_all', { repoPath })
}

export async function commitStaged(repoPath: string, message: string) {
  await invoke('commit_staged', { repoPath, message })
}
