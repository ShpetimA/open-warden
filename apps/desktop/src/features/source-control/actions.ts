import { open } from '@tauri-apps/plugin-dialog'

import type { AppThunk } from '@/app/store'
import { gitApi } from './api'
import type { Bucket, BucketedFile, GitSnapshot, RunningAction, ViewMode } from './types'
import {
  addRepo,
  clearDiffSelection,
  clearError,
  clearHistorySelection,
  setActiveBucket,
  setActivePath,
  setActiveRepo,
  setCommitMessage,
  setDiffStyle,
  setError,
  setHistoryCommitId,
  setHistoryNavTarget,
  setLastCommitId,
  setRunningAction,
  setViewMode as setViewModeAction,
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

export const selectFolder = (): AppThunk => async (dispatch) => {
  const selected = await open({ directory: true, multiple: false })
  if (typeof selected !== 'string') return

  dispatch(addRepo(selected))
  dispatch(setActiveRepo(selected))
  dispatch(clearError())
  dispatch(clearHistorySelection())
  dispatch(clearDiffSelection())
  dispatch(setActiveBucket('unstaged'))
}

export const selectRepo = (repo: string): AppThunk => async (dispatch, getState) => {
  const { activeRepo } = getState().sourceControl
  if (repo === activeRepo) return
  dispatch(setActiveRepo(repo))
  dispatch(clearError())
  dispatch(clearHistorySelection())
  dispatch(clearDiffSelection())
  dispatch(setActiveBucket('unstaged'))
}

export const refreshActiveRepo = (): AppThunk => async (dispatch, getState) => {
  const { activeRepo, viewMode } = getState().sourceControl
  if (!activeRepo) return
  dispatch(gitApi.util.invalidateTags([{ type: 'Snapshot', id: activeRepo }]))
  if (viewMode === 'history') {
    dispatch(gitApi.util.invalidateTags([{ type: 'HistoryCommits', id: activeRepo }]))
  }
}

export const selectFile = (bucket: Bucket, relPath: string): AppThunk => async (dispatch, getState) => {
  if (getState().sourceControl.viewMode !== 'changes') return
  if (!getState().sourceControl.activeRepo) return
  dispatch(setActiveBucket(bucket))
  dispatch(setActivePath(relPath))
}

export const selectHistoryCommit = (commitId: string): AppThunk => async (dispatch, getState) => {
  if (getState().sourceControl.viewMode !== 'history') return
  if (!getState().sourceControl.activeRepo) return
  dispatch(setHistoryNavTarget('commits'))
  dispatch(setHistoryCommitId(commitId))
}

export const selectHistoryFile = (relPath: string): AppThunk => async (dispatch, getState) => {
  if (getState().sourceControl.viewMode !== 'history') return
  if (!getState().sourceControl.activeRepo) return
  if (!getState().sourceControl.historyCommitId) return
  dispatch(setHistoryNavTarget('files'))
  dispatch(setActivePath(relPath))
}

export const setViewMode = (mode: ViewMode): AppThunk => async (dispatch, getState) => {
  const { viewMode, activeRepo } = getState().sourceControl
  if (viewMode === mode) return
  dispatch(setViewModeAction(mode))
  dispatch(setHistoryNavTarget('commits'))
  dispatch(clearError())

  if (!activeRepo && mode === 'history') {
    dispatch(clearHistorySelection())
  }
}

export const setCommitMessageValue = (value: string): AppThunk => (dispatch) => {
  dispatch(setCommitMessage(value))
}

export const setDiffStyleValue = (value: 'split' | 'unified'): AppThunk => (dispatch) => {
  dispatch(setDiffStyle(value))
}

const runRepoAction = (action: RunningAction, thunk: AppThunk<Promise<void>>): AppThunk => async (dispatch, getState) => {
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

export const stageFileAction = (filePath: string): AppThunk => async (dispatch, getState) => {
  const state = getState()
  const { activeRepo, viewMode, activePath } = state.sourceControl
  if (!activeRepo) return

  if (viewMode === 'changes' && activePath === filePath) {
    const snapshot = gitApi.endpoints.getGitSnapshot.select(activeRepo)(state).data
    const next = nextChangedFileAfterStage(snapshot, filePath)
    if (next) {
      dispatch(setActiveBucket(next.bucket))
      dispatch(setActivePath(next.path))
    }
  }

  await dispatch(
    runRepoAction(`file:stage:${filePath}`,
      async (innerDispatch) => {
        const result = innerDispatch(
          gitApi.endpoints.stageFile.initiate(
            { repoPath: activeRepo, relPath: filePath },
            { subscribe: false },
          ),
        )
        await result.unwrap()
      },
    ),
  )
}

export const unstageFileAction = (filePath: string): AppThunk => async (dispatch, getState) => {
  const { activeRepo } = getState().sourceControl
  if (!activeRepo) return

  await dispatch(
    runRepoAction(`file:unstage:${filePath}`,
      async (innerDispatch) => {
        const result = innerDispatch(
          gitApi.endpoints.unstageFile.initiate(
            { repoPath: activeRepo, relPath: filePath },
            { subscribe: false },
          ),
        )
        await result.unwrap()
      },
    ),
  )
}

export const discardFileAction = (bucket: Bucket, filePath: string): AppThunk => async (dispatch, getState) => {
  const { activeRepo } = getState().sourceControl
  if (!activeRepo) return

  await dispatch(
    runRepoAction(`file:discard:${filePath}`,
      async (innerDispatch) => {
        const result = innerDispatch(
          gitApi.endpoints.discardFile.initiate(
            { repoPath: activeRepo, relPath: filePath, bucket },
            { subscribe: false },
          ),
        )
        await result.unwrap()
      },
    ),
  )
}

export const stageAllAction = (): AppThunk => async (dispatch, getState) => {
  const { activeRepo } = getState().sourceControl
  if (!activeRepo) return

  await dispatch(
    runRepoAction('stage-all',
      async (innerDispatch) => {
        const result = innerDispatch(
          gitApi.endpoints.stageAll.initiate({ repoPath: activeRepo }, { subscribe: false }),
        )
        await result.unwrap()
      },
    ),
  )
}

export const unstageAllAction = (): AppThunk => async (dispatch, getState) => {
  const { activeRepo } = getState().sourceControl
  if (!activeRepo) return

  await dispatch(
    runRepoAction('unstage-all',
      async (innerDispatch) => {
        const result = innerDispatch(
          gitApi.endpoints.unstageAll.initiate({ repoPath: activeRepo }, { subscribe: false }),
        )
        await result.unwrap()
      },
    ),
  )
}

export const discardChangesGroupAction = (files: BucketedFile[]): AppThunk => async (dispatch, getState) => {
  const { activeRepo } = getState().sourceControl
  if (!activeRepo) return

  await dispatch(
    runRepoAction('discard-changes',
      async (innerDispatch) => {
        const payload = files.map((file) => ({ relPath: file.path, bucket: file.bucket }))
        const result = innerDispatch(
          gitApi.endpoints.discardFiles.initiate({ repoPath: activeRepo, files: payload }, { subscribe: false }),
        )
        await result.unwrap()
      },
    ),
  )
}

export const commitAction = (): AppThunk => async (dispatch, getState) => {
  const { activeRepo, commitMessage } = getState().sourceControl
  if (!activeRepo) return
  const trimmed = commitMessage.trim()
  if (!trimmed) return

  await dispatch(
    runRepoAction('commit',
      async (innerDispatch) => {
        const result = innerDispatch(
          gitApi.endpoints.commitStaged.initiate({ repoPath: activeRepo, message: trimmed }, { subscribe: false }),
        )
        const commitId = await result.unwrap()
        innerDispatch(setLastCommitId(commitId))
        innerDispatch(setCommitMessage(''))
      },
    ),
  )
}
