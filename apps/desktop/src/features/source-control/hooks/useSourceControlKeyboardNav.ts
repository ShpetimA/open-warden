import { useEffect } from 'react'

import { selectFile, selectHistoryCommit, selectHistoryFile } from '@/features/source-control/actions'
import { HISTORY_FILTER_INPUT_ID } from '@/features/source-control/constants'
import { appState$ } from '@/features/source-control/store'
import type { BucketedFile, FileItem, HistoryCommit } from '@/features/source-control/types'
import { isTypingTarget } from '@/features/source-control/utils'

export function useSourceControlKeyboardNav() {
  useEffect(() => {
    const onGlobalKeyDown = (event: KeyboardEvent) => {
      const viewMode = appState$.viewMode.get()
      const activeBucket = appState$.activeBucket.get()
      const activePath = appState$.activePath.get()
      const historyCommitId = appState$.historyCommitId.get()
      const allHistoryFiles = (appState$.historyFiles.get() ?? []) as FileItem[]
      const historyNavTarget = appState$.historyNavTarget.get()

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
        const snapshot = appState$.snapshot.get()
        const collapseStaged = appState$.collapseStaged.get()
        const collapseUnstaged = appState$.collapseUnstaged.get()
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

      const allHistoryCommits = (appState$.historyCommits.get() ?? []) as HistoryCommit[]
      const historyFilter = appState$.historyFilter.get()
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
      void selectHistoryCommit(targetCommit.commitId)
    }

    window.addEventListener('keydown', onGlobalKeyDown)
    return () => window.removeEventListener('keydown', onGlobalKeyDown)
  }, [])
}
