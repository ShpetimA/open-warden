import { invoke } from '@tauri-apps/api/core'

import type { Bucket, GitSnapshot } from '../types'

export async function getGitSnapshot(repoPath: string) {
  return invoke<GitSnapshot>('get_git_snapshot', { repoPath })
}

export async function getFilePatch(repoPath: string, bucket: Bucket, relPath: string) {
  return invoke<string>('get_file_patch', { repoPath, bucket, relPath })
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
