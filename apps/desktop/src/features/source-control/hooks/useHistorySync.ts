import { useEffect } from 'react'
import { skipToken } from '@reduxjs/toolkit/query'

import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { useGetCommitFilesQuery, useGetCommitHistoryQuery } from '@/features/source-control/api'
import { clearHistorySelection, setActivePath, setHistoryCommitId } from '@/features/source-control/sourceControlSlice'

export function useHistorySync() {
  const dispatch = useAppDispatch()
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo)
  const historyCommitId = useAppSelector((state) => state.sourceControl.historyCommitId)
  const activePath = useAppSelector((state) => state.sourceControl.activePath)

  const { data: historyCommits } = useGetCommitHistoryQuery(
    activeRepo ? { repoPath: activeRepo } : skipToken,
  )

  const { data: historyFiles } = useGetCommitFilesQuery(
    activeRepo && historyCommitId ? { repoPath: activeRepo, commitId: historyCommitId } : skipToken,
  )

  useEffect(() => {
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
  }, [activeRepo, dispatch, historyCommits, historyCommitId])

  useEffect(() => {
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
  }, [activePath, dispatch, historyCommitId, historyFiles])
}
