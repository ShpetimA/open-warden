import { open } from '@tauri-apps/plugin-dialog'

import type { Bucket, BucketedFile, RunningAction, ViewMode } from './types'
import { appState$ } from './store'
import { findExistingBucket } from './utils'
import {
  commitStaged,
  discardFile,
  discardFiles,
  getCommitFileVersions,
  getCommitFiles,
  getCommitHistory,
  getFileVersions,
  getGitSnapshot,
  stageAll,
  stageFile,
  unstageAll,
  unstageFile,
} from './services/git'

let snapshotLoadRequestId = 0
let historyCommitsLoadRequestId = 0
let historyFilesLoadRequestId = 0
let fileVersionsLoadRequestId = 0

function isRepoStillActive(repoPath: string): boolean {
  return appState$.activeRepo.get() === repoPath
}

function nextChangedFileAfterStage(filePath: string): { bucket: Bucket; path: string } | null {
  const snapshot = appState$.snapshot.get()
  if (!snapshot) return null

  const changed: Array<{ bucket: Bucket; path: string }> = [
    ...snapshot.unstaged.map((file) => ({ bucket: 'unstaged' as const, path: file.path })),
    ...snapshot.untracked.map((file) => ({ bucket: 'untracked' as const, path: file.path })),
  ]
  if (changed.length === 0) return null

  const index = changed.findIndex((item) => item.path === filePath)
  if (index < 0) return null

  const next = changed[index + 1]
  if (next) return next

  const prev = changed[index - 1]
  if (prev) return prev

  return null
}

function clearDiffSelection() {
  appState$.activePath.set('')
  appState$.oldFile.set(null)
  appState$.newFile.set(null)
}

function clearHistorySelection() {
  appState$.historyCommitId.set('')
  appState$.historyNavTarget.set('commits')
  appState$.historyFiles.set([])
  clearDiffSelection()
}

async function loadHistoryFileVersions(
  repoPath: string,
  commitId: string,
  relPath: string,
  previousPath?: string,
) {
  const requestId = ++fileVersionsLoadRequestId
  appState$.loadingPatch.set(true)
  appState$.error.set('')

  try {
    const versions = await getCommitFileVersions(repoPath, commitId, relPath, previousPath)
    if (requestId !== fileVersionsLoadRequestId || !isRepoStillActive(repoPath)) return
    appState$.historyCommitId.set(commitId)
    appState$.activePath.set(relPath)
    appState$.oldFile.set(versions.oldFile)
    appState$.newFile.set(versions.newFile)
  } catch (error) {
    if (requestId !== fileVersionsLoadRequestId || !isRepoStillActive(repoPath)) return
    appState$.oldFile.set(null)
    appState$.newFile.set(null)
    appState$.error.set(error instanceof Error ? error.message : String(error))
  } finally {
    if (requestId === fileVersionsLoadRequestId) {
      appState$.loadingPatch.set(false)
    }
  }
}

async function loadHistoryFiles(repoPath: string, commitId: string, preferredPath = '') {
  const requestId = ++historyFilesLoadRequestId
  appState$.loadingHistoryFiles.set(true)
  appState$.error.set('')

  try {
    const files = await getCommitFiles(repoPath, commitId)
    if (requestId !== historyFilesLoadRequestId || !isRepoStillActive(repoPath)) return
    appState$.historyNavTarget.set('commits')
    appState$.historyCommitId.set(commitId)
    appState$.historyFiles.set(files)

    const existing = preferredPath ? files.find((file) => file.path === preferredPath) : undefined
    const nextFile = existing ?? files[0]
    if (!nextFile) {
      clearDiffSelection()
      return
    }

    await loadHistoryFileVersions(repoPath, commitId, nextFile.path, nextFile.previousPath ?? undefined)
  } catch (error) {
    if (requestId !== historyFilesLoadRequestId || !isRepoStillActive(repoPath)) return
    appState$.historyFiles.set([])
    clearDiffSelection()
    appState$.error.set(error instanceof Error ? error.message : String(error))
  } finally {
    if (requestId === historyFilesLoadRequestId) {
      appState$.loadingHistoryFiles.set(false)
    }
  }
}

async function reloadActiveView(repoPath: string) {
  if (appState$.viewMode.get() === 'history') {
    await loadHistoryCommits(repoPath)
    return
  }

  await loadSnapshot(repoPath)
}

export async function loadSnapshot(repoPath: string) {
  const requestId = ++snapshotLoadRequestId
  appState$.loadingSnapshot.set(true)
  appState$.error.set('')

  try {
    const snapshot = await getGitSnapshot(repoPath)
    if (requestId !== snapshotLoadRequestId || !isRepoStillActive(repoPath)) return
    appState$.snapshot.set(snapshot)

    const previousPath = appState$.activePath.get()
    const existingBucket = previousPath ? findExistingBucket(snapshot, previousPath) : null

    if (existingBucket && previousPath) {
      appState$.activeBucket.set(existingBucket)
      await loadFileVersions(repoPath, existingBucket, previousPath)
      return
    }

    clearDiffSelection()
  } catch (error) {
    if (requestId !== snapshotLoadRequestId || !isRepoStillActive(repoPath)) return
    appState$.snapshot.set(null)
    clearDiffSelection()
    appState$.error.set(error instanceof Error ? error.message : String(error))
  } finally {
    if (requestId === snapshotLoadRequestId) {
      appState$.loadingSnapshot.set(false)
    }
  }
}

export async function loadHistoryCommits(repoPath: string) {
  const requestId = ++historyCommitsLoadRequestId
  appState$.loadingHistoryCommits.set(true)
  appState$.error.set('')

  try {
    const commits = await getCommitHistory(repoPath)
    if (requestId !== historyCommitsLoadRequestId || !isRepoStillActive(repoPath)) return
    appState$.historyCommits.set(commits)

    if (commits.length === 0) {
      clearHistorySelection()
      return
    }

    const previousCommitId = appState$.historyCommitId.get()
    const selectedCommit =
      commits.find((commit) => commit.commitId === previousCommitId) ?? commits[0] ?? null

    if (!selectedCommit) {
      clearHistorySelection()
      return
    }

    await loadHistoryFiles(repoPath, selectedCommit.commitId, appState$.activePath.get())
  } catch (error) {
    if (requestId !== historyCommitsLoadRequestId || !isRepoStillActive(repoPath)) return
    appState$.historyCommits.set([])
    clearHistorySelection()
    appState$.error.set(error instanceof Error ? error.message : String(error))
  } finally {
    if (requestId === historyCommitsLoadRequestId) {
      appState$.loadingHistoryCommits.set(false)
    }
  }
}

export async function loadFileVersions(repoPath: string, bucket: Bucket, relPath: string) {
  const requestId = ++fileVersionsLoadRequestId
  appState$.loadingPatch.set(true)
  appState$.error.set('')

  try {
    const versions = await getFileVersions(repoPath, bucket, relPath)
    if (requestId !== fileVersionsLoadRequestId || !isRepoStillActive(repoPath)) return
    appState$.activeBucket.set(bucket)
    appState$.activePath.set(relPath)
    appState$.oldFile.set(versions.oldFile)
    appState$.newFile.set(versions.newFile)
  } catch (error) {
    if (requestId !== fileVersionsLoadRequestId || !isRepoStillActive(repoPath)) return
    appState$.oldFile.set(null)
    appState$.newFile.set(null)
    appState$.error.set(error instanceof Error ? error.message : String(error))
  } finally {
    if (requestId === fileVersionsLoadRequestId) {
      appState$.loadingPatch.set(false)
    }
  }
}

export async function selectFolder() {
  const selected = await open({ directory: true, multiple: false })
  if (typeof selected !== 'string') return

  const current = appState$.repos.get()
  if (!current.includes(selected)) {
    appState$.repos.set([...current, selected])
  }

  appState$.activeRepo.set(selected)
  await reloadActiveView(selected)
}

export async function selectRepo(repo: string) {
  const activeRepo = appState$.activeRepo.get()
  if (repo === activeRepo) return
  appState$.activeRepo.set(repo)
  await reloadActiveView(repo)
}

export async function refreshActiveRepo() {
  const activeRepo = appState$.activeRepo.get()
  if (!activeRepo) return
  await reloadActiveView(activeRepo)
}

export async function selectFile(bucket: Bucket, relPath: string) {
  if (appState$.viewMode.get() !== 'changes') return
  const activeRepo = appState$.activeRepo.get()
  if (!activeRepo) return
  await loadFileVersions(activeRepo, bucket, relPath)
}

export async function selectHistoryCommit(commitId: string) {
  const activeRepo = appState$.activeRepo.get()
  if (!activeRepo) return
  if (appState$.viewMode.get() !== 'history') return
  appState$.historyNavTarget.set('commits')
  await loadHistoryFiles(activeRepo, commitId, appState$.activePath.get())
}

export async function selectHistoryFile(relPath: string) {
  const activeRepo = appState$.activeRepo.get()
  const commitId = appState$.historyCommitId.get()
  if (!activeRepo || !commitId) return
  if (appState$.viewMode.get() !== 'history') return
  appState$.historyNavTarget.set('files')

  const file = appState$.historyFiles.get().find((item) => item.path === relPath)
  await loadHistoryFileVersions(activeRepo, commitId, relPath, file?.previousPath ?? undefined)
}

export async function setViewMode(mode: ViewMode) {
  if (appState$.viewMode.get() === mode) return
  appState$.viewMode.set(mode)
  appState$.historyNavTarget.set('commits')
  appState$.error.set('')

  const activeRepo = appState$.activeRepo.get()
  if (!activeRepo) {
    if (mode === 'history') {
      clearHistorySelection()
    }
    return
  }

  await reloadActiveView(activeRepo)
}

export function setCommitMessage(value: string) {
  appState$.commitMessage.set(value)
}

export function setDiffStyle(value: 'split' | 'unified') {
  appState$.diffStyle.set(value)
}

async function runRepoAction(action: RunningAction, fn: () => Promise<void>) {
  const activeRepo = appState$.activeRepo.get()
  if (!activeRepo) return
  appState$.runningAction.set(action)
  appState$.error.set('')
  try {
    await fn()
    await reloadActiveView(activeRepo)
  } catch (error) {
    appState$.error.set(error instanceof Error ? error.message : String(error))
  } finally {
    appState$.runningAction.set('')
  }
}

export async function stageFileAction(filePath: string) {
  if (appState$.viewMode.get() === 'changes' && appState$.activePath.get() === filePath) {
    const next = nextChangedFileAfterStage(filePath)
    if (next) {
      appState$.activeBucket.set(next.bucket)
      appState$.activePath.set(next.path)
    }
  }

  await runRepoAction(`file:stage:${filePath}`, async () => {
    await stageFile(appState$.activeRepo.get(), filePath)
  })
}

export async function unstageFileAction(filePath: string) {
  await runRepoAction(`file:unstage:${filePath}`, async () => {
    await unstageFile(appState$.activeRepo.get(), filePath)
  })
}

export async function discardFileAction(bucket: Bucket, filePath: string) {
  await runRepoAction(`file:discard:${filePath}`, async () => {
    await discardFile(appState$.activeRepo.get(), filePath, bucket)
  })
}

export async function stageAllAction() {
  await runRepoAction('stage-all', async () => {
    await stageAll(appState$.activeRepo.get())
  })
}

export async function unstageAllAction() {
  await runRepoAction('unstage-all', async () => {
    await unstageAll(appState$.activeRepo.get())
  })
}

export async function discardChangesGroupAction(files: BucketedFile[]) {
  await runRepoAction('discard-changes', async () => {
    const payload = files.map((file) => ({ relPath: file.path, bucket: file.bucket }))
    await discardFiles(appState$.activeRepo.get(), payload)
  })
}

export async function commitAction() {
  const commitMessage = appState$.commitMessage.get().trim()
  if (!commitMessage) return
  await runRepoAction('commit', async () => {
    const commitId = await commitStaged(appState$.activeRepo.get(), commitMessage)
    appState$.lastCommitId.set(commitId)
    appState$.commitMessage.set('')
  })
}
