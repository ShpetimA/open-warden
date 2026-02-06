import { open } from '@tauri-apps/plugin-dialog'

import type { Bucket, FileItem, RunningAction } from './types'
import { appState$ } from './store'
import { findExistingBucket } from './utils'
import {
  commitStaged,
  discardFile,
  getFileVersions,
  getGitSnapshot,
  stageAll,
  stageFile,
  unstageAll,
  unstageFile,
} from './services/git'

export async function loadSnapshot(repoPath: string) {
  appState$.loadingSnapshot.set(true)
  appState$.error.set('')

  try {
    const snapshot = await getGitSnapshot(repoPath)
    appState$.snapshot.set(snapshot)

    const previousPath = appState$.activePath.get()
    const existingBucket = previousPath ? findExistingBucket(snapshot, previousPath) : null

    if (existingBucket && previousPath) {
      appState$.activeBucket.set(existingBucket)
      await loadPatch(repoPath, existingBucket, previousPath)
      return
    }

    appState$.activePath.set('')
    appState$.patch.set('')
    appState$.oldFile.set(null)
    appState$.newFile.set(null)
  } catch (error) {
    appState$.snapshot.set(null)
    appState$.activePath.set('')
    appState$.patch.set('')
    appState$.oldFile.set(null)
    appState$.newFile.set(null)
    appState$.error.set(error instanceof Error ? error.message : String(error))
  } finally {
    appState$.loadingSnapshot.set(false)
  }
}

export async function loadPatch(repoPath: string, bucket: Bucket, relPath: string) {
  appState$.loadingPatch.set(true)
  appState$.error.set('')

  try {
    const versions = await getFileVersions(repoPath, bucket, relPath)
    appState$.activeBucket.set(bucket)
    appState$.activePath.set(relPath)
    appState$.oldFile.set(versions.oldFile)
    appState$.newFile.set(versions.newFile)
    appState$.patch.set('')
  } catch (error) {
    appState$.oldFile.set(null)
    appState$.newFile.set(null)
    appState$.patch.set('')
    appState$.error.set(error instanceof Error ? error.message : String(error))
  } finally {
    appState$.loadingPatch.set(false)
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
  await loadSnapshot(selected)
}

export async function selectRepo(repo: string) {
  const activeRepo = appState$.activeRepo.get()
  if (repo === activeRepo) return
  appState$.activeRepo.set(repo)
  await loadSnapshot(repo)
}

export async function refreshActiveRepo() {
  const activeRepo = appState$.activeRepo.get()
  if (!activeRepo) return
  await loadSnapshot(activeRepo)
}

export async function selectFile(bucket: Bucket, relPath: string) {
  const activeRepo = appState$.activeRepo.get()
  if (!activeRepo) return
  await loadPatch(activeRepo, bucket, relPath)
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
    await loadSnapshot(activeRepo)
  } catch (error) {
    appState$.error.set(error instanceof Error ? error.message : String(error))
  } finally {
    appState$.runningAction.set('')
  }
}

export async function stageFileAction(filePath: string) {
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

export async function discardChangesGroupAction(files: Array<FileItem & { bucket: Bucket }>) {
  await runRepoAction('discard-changes', async () => {
    for (const file of files) {
      await discardFile(appState$.activeRepo.get(), file.path, file.bucket)
    }
  })
}

export async function commitAction() {
  const commitMessage = appState$.commitMessage.get().trim()
  if (!commitMessage) return
  await runRepoAction('commit', async () => {
    await commitStaged(appState$.activeRepo.get(), commitMessage)
    appState$.commitMessage.set('')
  })
}
