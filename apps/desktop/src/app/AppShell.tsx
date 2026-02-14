import { useState } from 'react'
import { skipToken } from '@reduxjs/toolkit/query'
import { useAppDispatch, useAppSelector } from '@/app/hooks'

import { RepoTabs } from '@/app/RepoTabs'
import { DiffWorkspace } from '@/features/diff-view/DiffWorkspace'
import { DiffWorkspaceHeader } from '@/features/diff-view/components/DiffWorkspaceHeader'
import {
  useGetCommitFilesQuery,
  useGetCommitFileVersionsQuery,
  useGetFileVersionsQuery,
  useGetGitSnapshotQuery,
} from '@/features/source-control/api'
import { selectFolder, selectRepo } from '@/features/source-control/actions'
import { HistoryFilesPane } from '@/features/source-control/components/HistoryFilesPane'
import { SourceControlSidebar } from '@/features/source-control/components/SourceControlSidebar'

export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(true)

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#111216] text-[#d8dbe3]">
      <div className="grid h-full grid-rows-[1fr_34px]">
        <div className="grid min-h-0" style={{ gridTemplateColumns: sidebarOpen ? '320px 1fr' : '1fr' }}>
          {sidebarOpen ? <SourceControlSidebar /> : null}

          <main className="min-h-0">
            <AppMainContent
              sidebarOpen={sidebarOpen}
              onToggleSidebar={() => setSidebarOpen((v) => !v)}
            />
          </main>
        </div>

        <RepoTabsContainer sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen((v) => !v)} />
      </div>
    </div>
  )
}

type AppMainContentProps = {
  sidebarOpen: boolean
  onToggleSidebar: () => void
}

function AppMainContent({ sidebarOpen, onToggleSidebar }: AppMainContentProps) {
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo)
  const viewMode = useAppSelector((state) => state.sourceControl.viewMode)
  const stateError = useAppSelector((state) => state.sourceControl.error)
  const { error: snapshotError } = useGetGitSnapshotQuery(activeRepo, { skip: !activeRepo })
  const errorMessage = errorMessageFrom(snapshotError, stateError)

  if (!activeRepo) {
    return <div className="p-3 text-sm text-[#8f96a8]">Select a repository tab or add one with +.</div>
  }

  if (errorMessage) {
    return <div className="p-3 text-sm text-red-400">{errorMessage}</div>
  }

  return viewMode === 'history' ? (
    <HistoryPane sidebarOpen={sidebarOpen} onToggleSidebar={onToggleSidebar} />
  ) : (
    <ChangesPane sidebarOpen={sidebarOpen} onToggleSidebar={onToggleSidebar} />
  )
}

type PaneProps = {
  sidebarOpen: boolean
  onToggleSidebar: () => void
}

function HistoryPane({ sidebarOpen, onToggleSidebar }: PaneProps) {
  return (
    <div className="grid h-full min-h-0" style={{ gridTemplateColumns: '300px 1fr' }}>
      <HistoryFilesPane />
      <HistoryDiffPanel sidebarOpen={sidebarOpen} onToggleSidebar={onToggleSidebar} />
    </div>
  )
}

function ChangesPane({ sidebarOpen, onToggleSidebar }: PaneProps) {
  return (
    <div className="grid h-full min-h-0" style={{ gridTemplateColumns: '1fr' }}>
      <ChangesDiffPanel sidebarOpen={sidebarOpen} onToggleSidebar={onToggleSidebar} />
    </div>
  )
}

function HistoryDiffPanel({ sidebarOpen, onToggleSidebar }: PaneProps) {
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
    <section className="flex h-full min-h-0 flex-col">
      <DiffWorkspaceHeader
        sidebarOpen={sidebarOpen}
        onToggleSidebar={onToggleSidebar}
        canComment={false}
        showDiffActions={showDiffActions}
      />

      <div className="min-h-0 flex-1">
        {errorMessage ? (
          <div className="p-3 text-sm text-red-400">{errorMessage}</div>
        ) : loadingPatch ? (
          <div className="p-3 text-sm text-[#8f96a8]">Loading diff...</div>
        ) : !activePath ? (
          <div className="p-3 text-sm text-[#8f96a8]">Select a commit file to view diff.</div>
        ) : !oldFile && !newFile ? (
          <div className="p-3 text-sm text-[#8f96a8]">No diff content.</div>
        ) : (
          <DiffWorkspace oldFile={oldFile} newFile={newFile} canComment={false} />
        )}
      </div>
    </section>
  )
}

function ChangesDiffPanel({ sidebarOpen, onToggleSidebar }: PaneProps) {
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
  )
}

type RepoTabsContainerProps = {
  sidebarOpen: boolean
  onToggleSidebar: () => void
}

function RepoTabsContainer({ sidebarOpen, onToggleSidebar }: RepoTabsContainerProps) {
  const dispatch = useAppDispatch()
  const repos = useAppSelector((state) => state.sourceControl.repos)
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo)

  return (
    <RepoTabs
      sidebarOpen={sidebarOpen}
      repos={repos}
      activeRepo={activeRepo}
      onToggleSidebar={onToggleSidebar}
      onSelectRepo={(repo) => {
        void dispatch(selectRepo(repo))
      }}
      onAddRepo={() => {
        void dispatch(selectFolder())
      }}
    />
  )
}

function errorMessageFrom(error: unknown, fallback: string): string {
  if (!error) return fallback
  if (typeof error === 'object' && 'message' in error && typeof (error as { message?: unknown }).message === 'string') {
    return (error as { message: string }).message
  }
  return fallback
}
