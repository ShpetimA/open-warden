import { desktop } from '@/platform/desktop'

import type { Bucket, FileItem, FileVersions, GitSnapshot, HistoryCommit } from '../types'

type DiscardFileRequest = {
  relPath: string
  bucket: Bucket
}

export async function getGitSnapshot(repoPath: string) {
  return desktop.getGitSnapshot(repoPath) as Promise<GitSnapshot>
}

export async function getCommitHistory(repoPath: string, limit?: number) {
  return desktop.getCommitHistory(repoPath, limit) as Promise<HistoryCommit[]>
}

export async function getBranches(repoPath: string) {
  return desktop.getBranches(repoPath)
}

export async function getBranchFiles(repoPath: string, baseRef: string, headRef: string) {
  return desktop.getBranchFiles(repoPath, baseRef, headRef) as Promise<FileItem[]>
}

export async function getCommitFiles(repoPath: string, commitId: string) {
  return desktop.getCommitFiles(repoPath, commitId) as Promise<FileItem[]>
}

export async function getCommitFileVersions(
  repoPath: string,
  commitId: string,
  relPath: string,
  previousPath?: string,
) {
  return desktop.getCommitFileVersions(
    repoPath,
    commitId,
    relPath,
    previousPath,
  ) as Promise<FileVersions>
}

export async function getFileVersions(repoPath: string, bucket: Bucket, relPath: string) {
  return desktop.getFileVersions(repoPath, relPath, bucket) as Promise<FileVersions>
}

export async function getBranchFileVersions(
  repoPath: string,
  baseRef: string,
  headRef: string,
  relPath: string,
  previousPath?: string,
) {
  return desktop.getBranchFileVersions(
    repoPath,
    baseRef,
    headRef,
    relPath,
    previousPath,
  ) as Promise<FileVersions>
}

export async function stageFile(repoPath: string, relPath: string) {
  await desktop.stageFile(repoPath, relPath)
}

export async function unstageFile(repoPath: string, relPath: string) {
  await desktop.unstageFile(repoPath, relPath)
}

export async function discardFile(repoPath: string, relPath: string, bucket: Bucket) {
  await desktop.discardFile(repoPath, relPath, bucket)
}

export async function discardFiles(repoPath: string, files: DiscardFileRequest[]) {
  await desktop.discardFiles(repoPath, files)
}

export async function stageAll(repoPath: string) {
  await desktop.stageAll(repoPath)
}

export async function unstageAll(repoPath: string) {
  await desktop.unstageAll(repoPath)
}

export async function commitStaged(repoPath: string, message: string) {
  return desktop.commitStaged(repoPath, message)
}
