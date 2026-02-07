import { useEffect, useMemo } from 'react'
import { useSelector } from '@legendapp/state/react'

import { selectFile, selectHistoryCommit, selectHistoryFile } from '@/features/source-control/actions'
import { HISTORY_FILTER_INPUT_ID } from '@/features/source-control/constants'
import { appState$ } from '@/features/source-control/store'
import type { BucketedFile, FileItem, HistoryCommit } from '@/features/source-control/types'
import { isTypingTarget } from '@/features/source-control/utils'

export function useSourceControlKeyboardNav() {
  const viewMode = useSelector(appState$.viewMode)
  const activeBucket = useSelector(appState$.activeBucket)
  const activePath = useSelector(appState$.activePath)
  const snapshot = useSelector(appState$.snapshot)
  const historyCommits = useSelector(appState$.historyCommits)
  const historyFilter = useSelector(appState$.historyFilter)
  const historyCommitId = useSelector(appState$.historyCommitId)
  const historyNavTarget = useSelector(appState$.historyNavTarget)
  const historyFiles = useSelector(appState$.historyFiles)
  const collapseStaged = useSelector(appState$.collapseStaged)
  const collapseUnstaged = useSelector(appState$.collapseUnstaged)
  const allHistoryCommits = historyCommits as HistoryCommit[]
  const allHistoryFiles = historyFiles as FileItem[]

  const visibleChangeRows = useMemo<BucketedFile[]>(() => {
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

    const rows: BucketedFile[] = []
    if (!collapseStaged) rows.push(...stagedRows)
    if (!collapseUnstaged) rows.push(...changedRows)
    return rows
  }, [snapshot, collapseStaged, collapseUnstaged])

  const filteredHistoryCommits = useMemo<HistoryCommit[]>(() => {
    const query = historyFilter.trim().toLowerCase()
    if (!query) return allHistoryCommits

    return allHistoryCommits.filter((commit) => {
      return (
        commit.summary.toLowerCase().includes(query) ||
        commit.shortId.toLowerCase().includes(query) ||
        commit.commitId.toLowerCase().includes(query) ||
        commit.author.toLowerCase().includes(query)
      )
    })
  }, [allHistoryCommits, historyFilter])

  useEffect(() => {
    const onGlobalKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return
      if (event.metaKey || event.ctrlKey || event.altKey) return

      const lowerKey = event.key.toLowerCase()

      if (viewMode === 'history' && lowerKey === 'h') {
        event.preventDefault()
        appState$.historyNavTarget.set('commits')
        return
      }

      if (viewMode === 'history' && lowerKey === 'l') {
        event.preventDefault()
        appState$.historyNavTarget.set('files')
        return
      }

      if (viewMode === 'history' && (event.key === '/' || event.key === '?')) {
        event.preventDefault()
        appState$.historyNavTarget.set('commits')
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
        void selectFile(targetFile.bucket, targetFile.path)
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
        void selectHistoryFile(targetFile.path)
        return
      }

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
      void selectHistoryCommit(targetCommit.commitId)
    }

    window.addEventListener('keydown', onGlobalKeyDown)
    return () => window.removeEventListener('keydown', onGlobalKeyDown)
  }, [
    viewMode,
    visibleChangeRows,
    activeBucket,
    activePath,
    historyNavTarget,
    allHistoryFiles,
    filteredHistoryCommits,
    historyCommitId,
  ])
}
