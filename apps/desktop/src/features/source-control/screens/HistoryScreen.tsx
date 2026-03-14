import { skipToken } from '@reduxjs/toolkit/query'

import { useAppSelector } from '@/app/hooks'
import { ResizableSidebarLayout } from '@/components/layout/ResizableSidebarLayout'
import { DiffWorkspace } from '@/features/diff-view/DiffWorkspace'
import {
  useGetCommitFilesQuery,
  useGetCommitFileVersionsQuery,
} from '@/features/source-control/api'
import { usePrefetchHistoryDiffs } from '@/features/source-control/hooks/usePrefetchNearbyDiffs'
import { HistoryFilesPane } from '@/features/source-control/components/HistoryFilesPane'
import { useHistoryKeyboardNav } from '@/features/source-control/hooks/useHistoryKeyboardNav'
import { useHistorySync } from '@/features/source-control/hooks/useHistorySync'
import { useThrottledDiffSelection } from '@/features/source-control/hooks/useThrottledDiffSelection'
import { errorMessageFrom } from '@/features/source-control/shared-utils/errorMessage'

export function HistoryScreen() {
  useHistoryKeyboardNav()
  useHistorySync()

  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo)
  const historyCommitId = useAppSelector((state) => state.sourceControl.historyCommitId)
  const activePath = useAppSelector((state) => state.sourceControl.activePath)
  const { data: historyFiles } = useGetCommitFilesQuery(
    activeRepo && historyCommitId ? { repoPath: activeRepo, commitId: historyCommitId } : skipToken,
  )
  usePrefetchHistoryDiffs(historyFiles ?? [], activeRepo, historyCommitId, activePath)
  const selectedHistoryFile = historyFiles?.find((file) => file.path === activePath)
  const previewSelection = useThrottledDiffSelection(
    historyCommitId && activePath
      ? {
          commitId: historyCommitId,
          path: activePath,
          previousPath: selectedHistoryFile?.previousPath ?? undefined,
        }
      : null,
  )
  const historyFileVersions = useGetCommitFileVersionsQuery(
    activeRepo && previewSelection
      ? {
          repoPath: activeRepo,
          commitId: previewSelection.commitId,
          relPath: previewSelection.path,
          previousPath: previewSelection.previousPath,
        }
      : skipToken,
  )
  const fileVersions = historyFileVersions.data
  const loadingPatch = historyFileVersions.isFetching
  const oldFile = fileVersions?.oldFile ?? null
  const newFile = fileVersions?.newFile ?? null
  const errorMessage = errorMessageFrom(historyFileVersions.error, '')
  const previewPath = previewSelection?.path ?? ''

  return (
    <ResizableSidebarLayout
      panelId="history-files"
      sidebarDefaultSize={24}
      sidebarMinSize={16}
      sidebarMaxSize={40}
      sidebar={<HistoryFilesPane />}
      content={
        <section className="flex h-full min-h-0 flex-col">
          <div className="min-h-0 flex-1">
            {errorMessage ? (
              <div className="text-destructive p-3 text-sm">{errorMessage}</div>
            ) : loadingPatch ? (
              <div className="text-muted-foreground p-3 text-sm">Loading diff...</div>
            ) : !activePath ? (
              <div className="text-muted-foreground p-3 text-sm">
                Select a commit file to view diff.
              </div>
            ) : !oldFile && !newFile ? (
              <div className="text-muted-foreground p-3 text-sm">No diff content.</div>
            ) : (
              <DiffWorkspace
                oldFile={oldFile}
                newFile={newFile}
                activePath={previewPath}
                commentContext={{ kind: 'changes' }}
                canComment={false}
              />
            )}
          </div>
        </section>
      }
    />
  )
}
