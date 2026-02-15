import { skipToken } from '@reduxjs/toolkit/query'
import { useOutletContext } from 'react-router'

import type { AppShellOutletContext } from '@/app/AppShell'
import { useAppSelector } from '@/app/hooks'
import { DiffWorkspace } from '@/features/diff-view/DiffWorkspace'
import { DiffWorkspaceHeader } from '@/features/diff-view/components/DiffWorkspaceHeader'
import { useGetCommitFilesQuery, useGetCommitFileVersionsQuery } from '@/features/source-control/api'
import { HistoryFilesPane } from '@/features/source-control/components/HistoryFilesPane'
import { useHistoryKeyboardNav } from '@/features/source-control/hooks/useHistoryKeyboardNav'
import { useHistorySync } from '@/features/source-control/hooks/useHistorySync'
import { errorMessageFrom } from '@/features/source-control/shared-utils/errorMessage'

export function HistoryScreen() {
  useHistoryKeyboardNav()
  useHistorySync()

  const { sidebarOpen, onToggleSidebar } = useOutletContext<AppShellOutletContext>()
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo)
  const historyCommitId = useAppSelector((state) => state.sourceControl.historyCommitId)
  const activePath = useAppSelector((state) => state.sourceControl.activePath)
  const { data: historyFiles } = useGetCommitFilesQuery(
    activeRepo && historyCommitId ? { repoPath: activeRepo, commitId: historyCommitId } : skipToken,
  )
  const selectedHistoryFile = historyFiles?.find((file) => file.path === activePath)
  const historyFileVersions = useGetCommitFileVersionsQuery(
    activeRepo && historyCommitId && activePath
      ? {
          repoPath: activeRepo,
          commitId: historyCommitId,
          relPath: activePath,
          previousPath: selectedHistoryFile?.previousPath ?? undefined,
        }
      : skipToken,
  )
  const fileVersions = historyFileVersions.data
  const loadingPatch = historyFileVersions.isFetching
  const oldFile = fileVersions?.oldFile ?? null
  const newFile = fileVersions?.newFile ?? null
  const errorMessage = errorMessageFrom(historyFileVersions.error, '')
  const showDiffActions = Boolean(activePath && (oldFile || newFile))

  return (
    <div className="grid h-full min-h-0" style={{ gridTemplateColumns: '300px 1fr' }}>
      <HistoryFilesPane />

      <section className="flex h-full min-h-0 flex-col">
        <DiffWorkspaceHeader
          sidebarOpen={sidebarOpen}
          onToggleSidebar={onToggleSidebar}
          canComment={false}
          showDiffActions={showDiffActions}
        />

        <div className="min-h-0 flex-1">
          {errorMessage ? (
            <div className="text-destructive p-3 text-sm">{errorMessage}</div>
          ) : loadingPatch ? (
            <div className="text-muted-foreground p-3 text-sm">Loading diff...</div>
          ) : !activePath ? (
            <div className="text-muted-foreground p-3 text-sm">Select a commit file to view diff.</div>
          ) : !oldFile && !newFile ? (
            <div className="text-muted-foreground p-3 text-sm">No diff content.</div>
          ) : (
            <DiffWorkspace oldFile={oldFile} newFile={newFile} canComment={false} />
          )}
        </div>
      </section>
    </div>
  )
}
