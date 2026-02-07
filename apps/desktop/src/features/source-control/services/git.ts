import { commands, type ApiError, type Result as CommandResult } from '@/bindings'

import type { Bucket, FileItem, FileVersions, GitSnapshot, HistoryCommit } from '../types'

type DiscardFileRequest = {
  relPath: string
  bucket: Bucket
}

function toErrorMessage(error: ApiError): string {
  return error.details ? `${error.message}: ${error.details}` : error.message
}

function unwrapResult<T>(result: CommandResult<T, ApiError>): T {
  if (result.status === 'error') {
    throw new Error(toErrorMessage(result.error))
  }
  return result.data
}

export async function getGitSnapshot(repoPath: string) {
  return unwrapResult<GitSnapshot>(await commands.getGitSnapshot(repoPath))
}

export async function getCommitHistory(repoPath: string, limit?: number) {
  return unwrapResult<HistoryCommit[]>(await commands.getCommitHistory(repoPath, limit ?? null))
}

export async function getCommitFiles(repoPath: string, commitId: string) {
  return unwrapResult<FileItem[]>(await commands.getCommitFiles(repoPath, commitId))
}

export async function getCommitFileVersions(
  repoPath: string,
  commitId: string,
  relPath: string,
  previousPath?: string,
) {
  return unwrapResult<FileVersions>(
    await commands.getCommitFileVersions(repoPath, commitId, relPath, previousPath ?? null),
  )
}

export async function getFileVersions(repoPath: string, bucket: Bucket, relPath: string) {
  return unwrapResult<FileVersions>(await commands.getFileVersions(repoPath, relPath, bucket))
}

export async function stageFile(repoPath: string, relPath: string) {
  unwrapResult(await commands.stageFile(repoPath, relPath))
}

export async function unstageFile(repoPath: string, relPath: string) {
  unwrapResult(await commands.unstageFile(repoPath, relPath))
}

export async function discardFile(repoPath: string, relPath: string, bucket: Bucket) {
  unwrapResult(await commands.discardFile(repoPath, relPath, bucket))
}

export async function discardFiles(repoPath: string, files: DiscardFileRequest[]) {
  unwrapResult(await commands.discardFiles(repoPath, files))
}

export async function stageAll(repoPath: string) {
  unwrapResult(await commands.stageAll(repoPath))
}

export async function unstageAll(repoPath: string) {
  unwrapResult(await commands.unstageAll(repoPath))
}

export async function commitStaged(repoPath: string, message: string) {
  return unwrapResult<string>(await commands.commitStaged(repoPath, message))
}
