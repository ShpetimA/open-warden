import { open } from '@tauri-apps/plugin-dialog'

import type { AppThunk } from '@/app/store'
import { removeCommentsForRepo } from '@/features/comments/commentsSlice'
import { gitApi } from './api'
import type { Bucket, BucketedFile, GitSnapshot, RunningAction, SelectedFile } from './types'
import {
  addRepo,
  clearDiffSelection,
  clearError,
  clearHistorySelection,
  removeRepo,
  setActiveBucket,
  setActivePath,
  setActiveRepo,
  setCommitMessage,
  setDiffStyle,
  setError,
  setHistoryCommitId,
  setHistoryNavTarget,
  setLastCommitId,
  setSelectedFiles,
  setSelectionAnchor,
  setRunningAction,
} from './sourceControlSlice'

function nextChangedFileAfterStage(snapshot: GitSnapshot | null | undefined, filePath: string) {
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

function fileSelectionKey(file: SelectedFile): string {
  return `${file.bucket}\u0000${file.path}`
}

function dedupeSelection(files: SelectedFile[]): SelectedFile[] {
  const seen = new Set<string>()
  return files.filter((file) => {
    const key = fileSelectionKey(file)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export const selectFolder = (): AppThunk => async (dispatch) => {
  const selected = await open({ directory: true, multiple: false })
  if (typeof selected !== 'string') return

  dispatch(addRepo(selected))
  dispatch(setActiveRepo(selected))
  dispatch(clearError())
  dispatch(clearHistorySelection())
  dispatch(clearDiffSelection())
  dispatch(setActiveBucket('unstaged'))
  dispatch(setSelectedFiles([]))
  dispatch(setSelectionAnchor(null))
}

export const selectRepo =
  (repo: string): AppThunk =>
  async (dispatch, getState) => {
    const { activeRepo } = getState().sourceControl
    if (repo === activeRepo) return
    dispatch(setActiveRepo(repo))
    dispatch(clearError())
    dispatch(clearHistorySelection())
    dispatch(clearDiffSelection())
    dispatch(setActiveBucket('unstaged'))
    dispatch(setSelectedFiles([]))
    dispatch(setSelectionAnchor(null))
  }

export const closeRepo =
  (repo: string): AppThunk =>
  async (dispatch, getState) => {
    const { activeRepo } = getState().sourceControl
    const closingActiveRepo = repo === activeRepo
    dispatch(removeRepo(repo))
    dispatch(removeCommentsForRepo(repo))

    if (closingActiveRepo) {
      dispatch(clearError())
      dispatch(clearHistorySelection())
      dispatch(clearDiffSelection())
      dispatch(setActiveBucket('unstaged'))
      dispatch(setSelectedFiles([]))
      dispatch(setSelectionAnchor(null))
    }
  }

export const refreshActiveRepo = (): AppThunk => async (dispatch, getState) => {
  const { activeRepo } = getState().sourceControl
  if (!activeRepo) return

  dispatch(gitApi.util.invalidateTags([{ type: 'Snapshot', id: activeRepo }]))
  dispatch(gitApi.util.invalidateTags(['FileVersions']))
  dispatch(gitApi.util.invalidateTags([{ type: 'HistoryCommits', id: activeRepo }, 'HistoryFiles']))
}

export const selectFile =
  (bucket: Bucket, relPath: string): AppThunk =>
  async (dispatch, getState) => {
    if (!getState().sourceControl.activeRepo) return
    dispatch(setActiveBucket(bucket))
    dispatch(setActivePath(relPath))
    dispatch(setSelectedFiles([{ bucket, path: relPath }]))
    dispatch(setSelectionAnchor({ bucket, path: relPath }))
  }

export const toggleSelectFile =
  (bucket: Bucket, relPath: string): AppThunk =>
  async (dispatch, getState) => {
    if (!getState().sourceControl.activeRepo) return

    const target: SelectedFile = { bucket, path: relPath }
    const { selectedFiles } = getState().sourceControl
    const targetKey = fileSelectionKey(target)
    const exists = selectedFiles.some((file) => fileSelectionKey(file) === targetKey)
    const nextSelection = exists
      ? selectedFiles.filter((file) => fileSelectionKey(file) !== targetKey)
      : [...selectedFiles, target]

    dispatch(setActiveBucket(bucket))
    dispatch(setActivePath(relPath))
    dispatch(setSelectedFiles(dedupeSelection(nextSelection)))
    dispatch(setSelectionAnchor(target))
  }

export const rangeSelectFile =
  (target: SelectedFile, visibleRows: BucketedFile[]): AppThunk =>
  async (dispatch, getState) => {
    if (!getState().sourceControl.activeRepo) return

    const { selectionAnchor, activeBucket, activePath, selectedFiles } = getState().sourceControl
    const activeSelection = activePath ? { bucket: activeBucket, path: activePath } : null
    const base = selectionAnchor ?? activeSelection ?? target

    const baseIndex = visibleRows.findIndex(
      (file) => file.bucket === base.bucket && file.path === base.path,
    )
    const targetIndex = visibleRows.findIndex(
      (file) => file.bucket === target.bucket && file.path === target.path,
    )

    if (baseIndex < 0 || targetIndex < 0) {
      dispatch(setActiveBucket(target.bucket))
      dispatch(setActivePath(target.path))
      dispatch(setSelectedFiles([target]))
      dispatch(setSelectionAnchor(base))
      return
    }

    const from = Math.min(baseIndex, targetIndex)
    const to = Math.max(baseIndex, targetIndex)
    const rangeSelection = visibleRows.slice(from, to + 1).map((file) => ({
      bucket: file.bucket,
      path: file.path,
    }))

    const carryForward = selectedFiles.filter(
      (file) => visibleRows.findIndex((row) => row.bucket === file.bucket && row.path === file.path) < 0,
    )

    dispatch(setActiveBucket(target.bucket))
    dispatch(setActivePath(target.path))
    dispatch(setSelectedFiles(dedupeSelection([...carryForward, ...rangeSelection])))
    dispatch(setSelectionAnchor(base))
  }

export const clearFileSelection = (): AppThunk => async (dispatch) => {
  dispatch(setSelectedFiles([]))
  dispatch(setSelectionAnchor(null))
}

export const selectHistoryCommit =
  (commitId: string): AppThunk =>
  async (dispatch, getState) => {
    if (!getState().sourceControl.activeRepo) return
    dispatch(setHistoryNavTarget('commits'))
    dispatch(setHistoryCommitId(commitId))
  }

export const selectHistoryFile =
  (relPath: string): AppThunk =>
  async (dispatch, getState) => {
    if (!getState().sourceControl.activeRepo) return
    if (!getState().sourceControl.historyCommitId) return
    dispatch(setHistoryNavTarget('files'))
    dispatch(setActivePath(relPath))
  }

export const setCommitMessageValue =
  (value: string): AppThunk =>
  (dispatch) => {
    dispatch(setCommitMessage(value))
  }

export const setDiffStyleValue =
  (value: 'split' | 'unified'): AppThunk =>
  (dispatch) => {
    dispatch(setDiffStyle(value))
  }

const runRepoAction =
  (action: RunningAction, thunk: AppThunk<Promise<void>>): AppThunk =>
  async (dispatch, getState) => {
    const { activeRepo } = getState().sourceControl
    if (!activeRepo) return
    dispatch(setRunningAction(action))
    dispatch(clearError())
    try {
      await dispatch(thunk)
    } catch (error) {
      dispatch(setError(error instanceof Error ? error.message : String(error)))
    } finally {
      dispatch(setRunningAction(''))
    }
  }

export const stageFileAction =
  (filePath: string): AppThunk =>
  async (dispatch, getState) => {
    const state = getState()
    const { activeRepo, activePath } = state.sourceControl
    if (!activeRepo) return

    if (activePath === filePath) {
      const snapshot = gitApi.endpoints.getGitSnapshot.select(activeRepo)(state).data
      const next = nextChangedFileAfterStage(snapshot, filePath)
      if (next) {
        dispatch(setActiveBucket(next.bucket))
        dispatch(setActivePath(next.path))
      }
    }

    await dispatch(
      runRepoAction(`file:stage:${filePath}`, async (innerDispatch) => {
        const result = innerDispatch(
          gitApi.endpoints.stageFile.initiate(
            { repoPath: activeRepo, relPath: filePath },
            { subscribe: false },
          ),
        )
        await result.unwrap()
      }),
    )
  }

export const unstageFileAction =
  (filePath: string): AppThunk =>
  async (dispatch, getState) => {
    const { activeRepo } = getState().sourceControl
    if (!activeRepo) return

    await dispatch(
      runRepoAction(`file:unstage:${filePath}`, async (innerDispatch) => {
        const result = innerDispatch(
          gitApi.endpoints.unstageFile.initiate(
            { repoPath: activeRepo, relPath: filePath },
            { subscribe: false },
          ),
        )
        await result.unwrap()
      }),
    )
  }

export const discardFileAction =
  (bucket: Bucket, filePath: string): AppThunk =>
  async (dispatch, getState) => {
    const { activeRepo } = getState().sourceControl
    if (!activeRepo) return

    await dispatch(
      runRepoAction(`file:discard:${filePath}`, async (innerDispatch) => {
        const result = innerDispatch(
          gitApi.endpoints.discardFile.initiate(
            { repoPath: activeRepo, relPath: filePath, bucket },
            { subscribe: false },
          ),
        )
        await result.unwrap()
      }),
    )
  }

export const stageOrUnstageSelectionAction = (): AppThunk => async (dispatch, getState) => {
  const { activeRepo, activeBucket, activePath, selectedFiles, runningAction } = getState().sourceControl
  if (!activeRepo || runningAction) return

  const candidates = selectedFiles.length
    ? selectedFiles
    : activePath
      ? [{ bucket: activeBucket, path: activePath }]
      : []
  if (candidates.length === 0) return

  const uniqueCandidates = dedupeSelection(candidates)

  const toUnstage = uniqueCandidates.filter((file) => file.bucket === 'staged')
  const toStage = uniqueCandidates.filter((file) => file.bucket !== 'staged')

  for (const file of toUnstage) {
    await dispatch(unstageFileAction(file.path))
  }
  for (const file of toStage) {
    await dispatch(stageFileAction(file.path))
  }
}

export const stageAllAction = (): AppThunk => async (dispatch, getState) => {
  const { activeRepo } = getState().sourceControl
  if (!activeRepo) return

  await dispatch(
    runRepoAction('stage-all', async (innerDispatch) => {
      const result = innerDispatch(
        gitApi.endpoints.stageAll.initiate({ repoPath: activeRepo }, { subscribe: false }),
      )
      await result.unwrap()
    }),
  )
}

export const unstageAllAction = (): AppThunk => async (dispatch, getState) => {
  const { activeRepo } = getState().sourceControl
  if (!activeRepo) return

  await dispatch(
    runRepoAction('unstage-all', async (innerDispatch) => {
      const result = innerDispatch(
        gitApi.endpoints.unstageAll.initiate({ repoPath: activeRepo }, { subscribe: false }),
      )
      await result.unwrap()
    }),
  )
}

export const discardChangesGroupAction =
  (files: BucketedFile[]): AppThunk =>
  async (dispatch, getState) => {
    const { activeRepo } = getState().sourceControl
    if (!activeRepo) return

    await dispatch(
      runRepoAction('discard-changes', async (innerDispatch) => {
        const payload = files.map((file) => ({ relPath: file.path, bucket: file.bucket }))
        const result = innerDispatch(
          gitApi.endpoints.discardFiles.initiate(
            { repoPath: activeRepo, files: payload },
            { subscribe: false },
          ),
        )
        await result.unwrap()
      }),
    )
  }

export const commitAction = (): AppThunk => async (dispatch, getState) => {
  const { activeRepo, commitMessage } = getState().sourceControl
  if (!activeRepo) return
  const trimmed = commitMessage.trim()
  if (!trimmed) return

  await dispatch(
    runRepoAction('commit', async (innerDispatch) => {
      const result = innerDispatch(
        gitApi.endpoints.commitStaged.initiate(
          { repoPath: activeRepo, message: trimmed },
          { subscribe: false },
        ),
      )
      const commitId = await result.unwrap()
      innerDispatch(setLastCommitId(commitId))
      innerDispatch(setCommitMessage(''))
    }),
  )
}
