import { useEffect } from 'react'
import { useStore } from 'react-redux'

import { useAppDispatch } from '@/app/hooks'
import type { RootState } from '@/app/store'
import { gitApi } from '@/features/source-control/api'
import { selectFile, selectHistoryCommit, selectHistoryFile } from '@/features/source-control/actions'
import { HISTORY_FILTER_INPUT_ID } from '@/features/source-control/constants'
import { setHistoryNavTarget } from '@/features/source-control/sourceControlSlice'
import type { BucketedFile, FileItem, HistoryCommit } from '@/features/source-control/types'
import { isTypingTarget } from '@/features/source-control/utils'

export function useSourceControlKeyboardNav() {
  const dispatch = useAppDispatch()
  const store = useStore<RootState>()

  useEffect(() => {
    const onGlobalKeyDown = (event: KeyboardEvent) => {
      const state = store.getState()
      const {
        viewMode,
        activeBucket,
        activePath,
        historyCommitId,
        historyNavTarget,
        historyFilter,
        activeRepo,
        collapseStaged,
        collapseUnstaged,
      } = state.sourceControl
      const historyCommitsArgs = activeRepo ? { repoPath: activeRepo } : null
      const historyFilesArgs = activeRepo && historyCommitId ? { repoPath: activeRepo, commitId: historyCommitId } : null
      const snapshot = activeRepo ? gitApi.endpoints.getGitSnapshot.select(activeRepo)(state).data : undefined
      const historyCommits = historyCommitsArgs
        ? gitApi.endpoints.getCommitHistory.select(historyCommitsArgs)(state).data
        : undefined
      const historyFiles = historyFilesArgs
        ? gitApi.endpoints.getCommitFiles.select(historyFilesArgs)(state).data
        : undefined
      const allHistoryFiles = (historyFiles ?? []) as FileItem[]

      if (isTypingTarget(event.target)) return
      if (event.metaKey || event.ctrlKey || event.altKey) return

      const lowerKey = event.key.toLowerCase()

      if (viewMode === 'history' && lowerKey === 'h') {
        event.preventDefault()
        dispatch(setHistoryNavTarget('commits'))
        return
      }

      if (viewMode === 'history' && lowerKey === 'l') {
        event.preventDefault()
        dispatch(setHistoryNavTarget('files'))
        return
      }

      if (viewMode === 'history' && (event.key === '/' || event.key === '?')) {
        event.preventDefault()
        dispatch(setHistoryNavTarget('commits'))
        const filterInput = document.getElementById(HISTORY_FILTER_INPUT_ID)
        if (filterInput instanceof HTMLInputElement) {
          filterInput.focus()
          filterInput.select()
        }
        return
      }

      const nextKey = event.key === 'ArrowDown' || lowerKey === 'j'
      const prevKey = event.key === 'ArrowUp' || lowerKey === 'k'
      if (!nextKey && !prevKey) return
      event.preventDefault()

      if (viewMode === 'changes') {
        const unstaged = snapshot?.unstaged ?? []
        const staged = snapshot?.staged ?? []
        const untracked = snapshot?.untracked ?? []
        const stagedRows: BucketedFile[] = staged.map((file) => ({
          ...file,
          bucket: 'staged',
        }))
        const changedRows: BucketedFile[] = [
          ...unstaged.map((file) => ({ ...file, bucket: 'unstaged' as const })),
          ...untracked.map((file) => ({ ...file, bucket: 'untracked' as const })),
        ]
        const visibleChangeRows: BucketedFile[] = []
        if (!collapseStaged) visibleChangeRows.push(...stagedRows)
        if (!collapseUnstaged) visibleChangeRows.push(...changedRows)

        if (visibleChangeRows.length === 0) return

        const activeIndex = visibleChangeRows.findIndex(
          (file) => file.bucket === activeBucket && file.path === activePath,
        )

        let targetIndex = 0
        if (activeIndex < 0) {
          targetIndex = nextKey ? 0 : visibleChangeRows.length - 1
        } else if (nextKey) {
          targetIndex = Math.min(activeIndex + 1, visibleChangeRows.length - 1)
        } else {
          targetIndex = Math.max(activeIndex - 1, 0)
        }

        const targetFile = visibleChangeRows[targetIndex]
        if (!targetFile) return
        void dispatch(selectFile(targetFile.bucket, targetFile.path))
        return
      }

      if (historyNavTarget === 'files') {
        if (allHistoryFiles.length === 0) return

        const activeIndex = allHistoryFiles.findIndex((file) => file.path === activePath)

        let targetIndex = 0
        if (activeIndex < 0) {
          targetIndex = nextKey ? 0 : allHistoryFiles.length - 1
        } else if (nextKey) {
          targetIndex = Math.min(activeIndex + 1, allHistoryFiles.length - 1)
        } else {
          targetIndex = Math.max(activeIndex - 1, 0)
        }

        const targetFile = allHistoryFiles[targetIndex]
        if (!targetFile) return
        void dispatch(selectHistoryFile(targetFile.path))
        return
      }

      const allHistoryCommits = (historyCommits ?? []) as HistoryCommit[]
      const query = historyFilter.trim().toLowerCase()
      const filteredHistoryCommits = !query
        ? allHistoryCommits
        : allHistoryCommits.filter((commit) => {
            return (
              commit.summary.toLowerCase().includes(query) ||
              commit.shortId.toLowerCase().includes(query) ||
              commit.commitId.toLowerCase().includes(query) ||
              commit.author.toLowerCase().includes(query)
            )
          })

      if (filteredHistoryCommits.length === 0) return

      const activeIndex = filteredHistoryCommits.findIndex((commit) => commit.commitId === historyCommitId)

      let targetIndex = 0
      if (activeIndex < 0) {
        targetIndex = nextKey ? 0 : filteredHistoryCommits.length - 1
      } else if (nextKey) {
        targetIndex = Math.min(activeIndex + 1, filteredHistoryCommits.length - 1)
      } else {
        targetIndex = Math.max(activeIndex - 1, 0)
      }

      const targetCommit = filteredHistoryCommits[targetIndex]
      if (!targetCommit) return
      void dispatch(selectHistoryCommit(targetCommit.commitId))
    }

    window.addEventListener('keydown', onGlobalKeyDown)
    return () => window.removeEventListener('keydown', onGlobalKeyDown)
  }, [dispatch, store])
}
