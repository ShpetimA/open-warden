import { useState } from 'react'
import { Outlet, useLocation } from 'react-router'

import { AppHeader } from '@/app/AppHeader'
import { featureHasPrimarySidebar, featureKeyFromPath } from '@/app/featureNavigation'
import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { ResizableSidebarLayout } from '@/components/layout/ResizableSidebarLayout'
import { AppCommandPalette } from '@/features/command-palette/AppCommandPalette'

import { RepoTabs } from '@/app/RepoTabs'
import { useGetGitSnapshotQuery } from '@/features/source-control/api'
import { closeRepo, selectFolder, selectRepo } from '@/features/source-control/actions'
import { SourceControlSidebar } from '@/features/source-control/components/SourceControlSidebar'
import { errorMessageFrom } from '@/features/source-control/shared-utils/errorMessage'

function renderMainContent(activeRepo: string, errorMessage: string) {
  if (!activeRepo) {
    return (
      <div className="text-muted-foreground p-3 text-sm">
        Select a repository tab or add one with +.
      </div>
    )
  }

  if (errorMessage) {
    return <div className="text-destructive p-3 text-sm">{errorMessage}</div>
  }

  return <Outlet />
}

export function AppShell() {
  const location = useLocation()
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo)
  const stateError = useAppSelector((state) => state.sourceControl.error)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const activeFeature = featureKeyFromPath(location.pathname)
  const showPrimarySidebar = featureHasPrimarySidebar(activeFeature)
  const sidebarFeature = activeFeature === 'history' ? 'history' : 'changes'
  const { snapshotError, activeBranch } = useGetGitSnapshotQuery(activeRepo, {
    skip: !activeRepo,
    selectFromResult: ({ error, data }) => ({
      snapshotError: error,
      activeBranch: data?.branch ?? '',
    }),
  })
  const errorMessage = errorMessageFrom(snapshotError, stateError)
  const mainContent = renderMainContent(activeRepo, errorMessage)

  return (
    <div className="bg-background text-foreground h-screen w-screen overflow-hidden">
      <div className="grid h-full grid-rows-[56px_1fr_34px]">
        <AppHeader
          activeFeature={activeFeature}
          activeRepo={activeRepo}
          activeBranch={activeBranch}
          onOpenCommandPalette={() => {
            setCommandPaletteOpen(true)
          }}
        />

        <div className="min-h-0">
          {showPrimarySidebar ? (
            <ResizableSidebarLayout
              sidebarDefaultSize={22}
              sidebarMinSize={14}
              sidebarMaxSize={34}
              sidebar={<SourceControlSidebar feature={sidebarFeature} activeBranch={activeBranch} />}
              content={<main className="h-full min-h-0">{mainContent}</main>}
            />
          ) : (
            <main className="h-full min-h-0">{mainContent}</main>
          )}
        </div>

        <RepoTabsContainer />
      </div>

      <AppCommandPalette open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen} />
    </div>
  )
}

function RepoTabsContainer() {
  const dispatch = useAppDispatch()
  const repos = useAppSelector((state) => state.sourceControl.repos)
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo)

  return (
    <RepoTabs
      repos={repos}
      activeRepo={activeRepo}
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
