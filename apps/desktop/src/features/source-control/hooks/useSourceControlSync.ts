import { useEffect } from 'react'
import { skipToken } from '@reduxjs/toolkit/query'

import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { useGetCommitFilesQuery, useGetCommitHistoryQuery, useGetGitSnapshotQuery } from '@/features/source-control/api'
import {
  clearDiffSelection,
  clearHistorySelection,
  setActiveBucket,
  setActivePath,
  setHistoryCommitId,
} from '@/features/source-control/sourceControlSlice'
import { findExistingBucket } from '@/features/source-control/utils'

export function useSourceControlSync() {
  const dispatch = useAppDispatch()
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo)
  const viewMode = useAppSelector((state) => state.sourceControl.viewMode)
  const activePath = useAppSelector((state) => state.sourceControl.activePath)
  const activeBucket = useAppSelector((state) => state.sourceControl.activeBucket)
  const historyCommitId = useAppSelector((state) => state.sourceControl.historyCommitId)

  const { data: snapshot } = useGetGitSnapshotQuery(activeRepo, { skip: !activeRepo })

  const { data: historyCommits } = useGetCommitHistoryQuery(
    activeRepo && viewMode === 'history' ? { repoPath: activeRepo } : skipToken,
  )

  const { data: historyFiles } = useGetCommitFilesQuery(
    activeRepo && historyCommitId && viewMode === 'history'
      ? { repoPath: activeRepo, commitId: historyCommitId }
      : skipToken,
  )

  useEffect(() => {
    if (viewMode !== 'changes') return
    if (!activeRepo) {
      dispatch(clearDiffSelection())
      return
    }
    if (!snapshot) return

    if (!activePath) return
    const activeBucketHasPath =
      activeBucket === 'unstaged'
        ? snapshot.unstaged.some((file) => file.path === activePath)
        : activeBucket === 'untracked'
          ? snapshot.untracked.some((file) => file.path === activePath)
          : snapshot.staged.some((file) => file.path === activePath)
    if (activeBucketHasPath) return
    const existingBucket = findExistingBucket(snapshot, activePath)
    if (!existingBucket) {
      dispatch(clearDiffSelection())
      return
    }
    if (existingBucket !== activeBucket) {
      dispatch(setActiveBucket(existingBucket))
    }
  }, [activeRepo, activeBucket, activePath, dispatch, snapshot, viewMode])

  useEffect(() => {
    if (viewMode !== 'history') return
    if (!activeRepo) {
      dispatch(clearHistorySelection())
      return
    }
    if (!historyCommits) return
    if (historyCommits.length === 0) {
      dispatch(clearHistorySelection())
      return
    }

    const existing = historyCommits.find((commit) => commit.commitId === historyCommitId)
    const nextCommit = existing ?? historyCommits[0]
    if (nextCommit && nextCommit.commitId !== historyCommitId) {
      dispatch(setHistoryCommitId(nextCommit.commitId))
    }
  }, [activeRepo, dispatch, historyCommits, historyCommitId, viewMode])

  useEffect(() => {
    if (viewMode !== 'history') return
    if (!historyCommitId) {
      dispatch(setActivePath(''))
      return
    }
    if (!historyFiles) return
    if (historyFiles.length === 0) {
      dispatch(setActivePath(''))
      return
    }
    const existing = historyFiles.find((file) => file.path === activePath)
    if (!existing) {
      dispatch(setActivePath(historyFiles[0].path))
    }
  }, [activePath, dispatch, historyCommitId, historyFiles, viewMode])
}
