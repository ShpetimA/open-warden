import { skipToken } from '@reduxjs/toolkit/query'
import { useOutletContext } from 'react-router'

import type { AppShellOutletContext } from '@/app/AppShell'
import { useAppSelector } from '@/app/hooks'
import { DiffWorkspace } from '@/features/diff-view/DiffWorkspace'
import { DiffWorkspaceHeader } from '@/features/diff-view/components/DiffWorkspaceHeader'
import { useGetFileVersionsQuery } from '@/features/source-control/api'
import { useChangesKeyboardNav } from '@/features/source-control/hooks/useChangesKeyboardNav'
import { useChangesSync } from '@/features/source-control/hooks/useChangesSync'
import { errorMessageFrom } from '@/features/source-control/shared-utils/errorMessage'

export function ChangesScreen() {
  useChangesKeyboardNav()
  useChangesSync()

  const { sidebarOpen, onToggleSidebar } = useOutletContext<AppShellOutletContext>()
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo)
  const activeBucket = useAppSelector((state) => state.sourceControl.activeBucket)
  const activePath = useAppSelector((state) => state.sourceControl.activePath)
  const workingFileVersions = useGetFileVersionsQuery(
    activeRepo && activePath ? { repoPath: activeRepo, bucket: activeBucket, relPath: activePath } : skipToken,
  )
  const fileVersions = workingFileVersions.data
  const loadingPatch = workingFileVersions.isFetching
  const oldFile = fileVersions?.oldFile ?? null
  const newFile = fileVersions?.newFile ?? null
  const errorMessage = errorMessageFrom(workingFileVersions.error, '')
  const showDiffActions = Boolean(activePath && (oldFile || newFile))

  return (
    <div className="grid h-full min-h-0" style={{ gridTemplateColumns: '1fr' }}>
      <section className="flex h-full min-h-0 flex-col">
        <DiffWorkspaceHeader
          sidebarOpen={sidebarOpen}
          onToggleSidebar={onToggleSidebar}
          canComment
          showDiffActions={showDiffActions}
        />

        <div className="min-h-0 flex-1">
          {errorMessage ? (
            <div className="p-3 text-sm text-red-400">{errorMessage}</div>
          ) : loadingPatch ? (
            <div className="p-3 text-sm text-[#8f96a8]">Loading diff...</div>
          ) : !activePath ? (
            <div className="p-3 text-sm text-[#8f96a8]">Select a file to view diff.</div>
          ) : !oldFile && !newFile ? (
            <div className="p-3 text-sm text-[#8f96a8]">No diff content.</div>
          ) : (
            <DiffWorkspace oldFile={oldFile} newFile={newFile} canComment />
          )}
        </div>
      </section>
    </div>
  )
}
