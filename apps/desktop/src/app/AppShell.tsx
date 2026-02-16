import { useState } from 'react'
import { Outlet } from 'react-router'

import { useAppDispatch, useAppSelector } from '@/app/hooks'

import { RepoTabs } from '@/app/RepoTabs'
import { useGetGitSnapshotQuery } from '@/features/source-control/api'
import { closeRepo, selectFolder, selectRepo } from '@/features/source-control/actions'
import { SourceControlSidebar } from '@/features/source-control/components/SourceControlSidebar'
import { errorMessageFrom } from '@/features/source-control/shared-utils/errorMessage'

export type AppShellOutletContext = {
  sidebarOpen: boolean
  onToggleSidebar: () => void
}

export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo)
  const stateError = useAppSelector((state) => state.sourceControl.error)
  const { error: snapshotError } = useGetGitSnapshotQuery(activeRepo, { skip: !activeRepo })
  const errorMessage = errorMessageFrom(snapshotError, stateError)
  const toggleSidebar = () => setSidebarOpen((open) => !open)

  return (
    <div className="bg-background text-foreground h-screen w-screen overflow-hidden">
      <div className="grid h-full grid-rows-[1fr_34px]">
        <div className="grid min-h-0" style={{ gridTemplateColumns: sidebarOpen ? '320px 1fr' : '1fr' }}>
          {sidebarOpen ? <SourceControlSidebar /> : null}

          <main className="min-h-0">
            {!activeRepo ? (
              <div className="text-muted-foreground p-3 text-sm">Select a repository tab or add one with +.</div>
            ) : errorMessage ? (
              <div className="text-destructive p-3 text-sm">{errorMessage}</div>
            ) : (
              <Outlet context={{ sidebarOpen, onToggleSidebar: toggleSidebar }} />
            )}
          </main>
        </div>

        <RepoTabsContainer sidebarOpen={sidebarOpen} onToggleSidebar={toggleSidebar} />
      </div>
    </div>
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
      onCloseRepo={(repo) => {
        void dispatch(closeRepo(repo))
      }}
      onAddRepo={() => {
        void dispatch(selectFolder())
      }}
    />
  )
}
