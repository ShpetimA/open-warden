import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { Outlet, useLocation } from 'react-router'

import { AppHeader } from '@/app/AppHeader'
import { featureHasPrimarySidebar, featureKeyFromPath } from '@/app/featureNavigation'
import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { ResizableSidebarLayout } from '@/components/layout/ResizableSidebarLayout'
import { SidebarPanelRegistryProvider } from '@/components/layout/SidebarPanelRegistry'
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
  const [headerCollapsed, setHeaderCollapsed] = useState(false)
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
    <SidebarPanelRegistryProvider>
    <div className="bg-background text-foreground h-screen w-screen overflow-hidden">
      <div
        className="grid h-full"
        style={{ gridTemplateRows: headerCollapsed ? '0px 1fr 34px' : '56px 1fr 34px' }}
      >
        <div className="overflow-hidden">
          <AppHeader
            activeFeature={activeFeature}
            onOpenCommandPalette={() => {
              setCommandPaletteOpen(true)
            }}
          />
        </div>

        <div className="relative min-h-0">
          <HeaderEdgeToggle
            collapsed={headerCollapsed}
            onToggle={() => {
              setHeaderCollapsed((value) => !value)
            }}
          />

          {showPrimarySidebar ? (
            <ResizableSidebarLayout
              panelId="primary"
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
    </SidebarPanelRegistryProvider>
  )
}

type HeaderEdgeToggleProps = {
  collapsed: boolean
  onToggle: () => void
}

function HeaderEdgeToggle({ collapsed, onToggle }: HeaderEdgeToggleProps) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-40">
      <div className="flex h-6 w-full justify-center">
        <button
          type="button"
          className="border-input bg-surface-alt text-muted-foreground hover:text-foreground pointer-events-auto inline-flex h-6 w-14 items-center justify-center rounded-b-md rounded-t-none border-t-0 opacity-0 shadow-sm transition-opacity duration-150 hover:opacity-100 focus-visible:opacity-100"
          onClick={onToggle}
          title={collapsed ? 'Expand header' : 'Collapse header'}
          aria-label={collapsed ? 'Expand header' : 'Collapse header'}
        >
          {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </button>
      </div>
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
