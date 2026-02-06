import { useState } from 'react'
import { useSelector } from '@legendapp/state/react'

import { RepoTabs } from '@/app/RepoTabs'
import { DiffWorkspace } from '@/features/diff-view/DiffWorkspace'
import { selectFolder, selectRepo } from '@/features/source-control/actions'
import { SourceControlSidebar } from '@/features/source-control/components/SourceControlSidebar'
import { appState$ } from '@/features/source-control/store'

export function AppShell() {
  const repos = useSelector(appState$.repos)
  const activeRepo = useSelector(appState$.activeRepo)
  const activePath = useSelector(appState$.activePath)
  const patch = useSelector(appState$.patch)
  const oldFile = useSelector(appState$.oldFile)
  const newFile = useSelector(appState$.newFile)
  const loadingPatch = useSelector(appState$.loadingPatch)
  const error = useSelector(appState$.error)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#111216] text-[#d8dbe3]">
      <div className="grid h-full grid-rows-[1fr_34px]">
        <div className="grid min-h-0" style={{ gridTemplateColumns: sidebarOpen ? '320px 1fr' : '1fr' }}>
          {sidebarOpen ? <SourceControlSidebar /> : null}

          <main className="min-h-0">
            {!activeRepo ? (
              <div className="p-3 text-sm text-[#8f96a8]">Select a repository tab or add one with +.</div>
            ) : error ? (
              <div className="p-3 text-sm text-red-400">{error}</div>
            ) : loadingPatch ? (
              <div className="p-3 text-sm text-[#8f96a8]">Loading patch...</div>
            ) : !activePath ? (
              <div className="p-3 text-sm text-[#8f96a8]">Select a file to view diff.</div>
            ) : !patch.trim() && !oldFile && !newFile ? (
              <div className="p-3 text-sm text-[#8f96a8]">No diff content.</div>
            ) : (
              <DiffWorkspace
                key={`${activeRepo}:${activePath}:${patch.length}:${oldFile?.contents.length ?? -1}:${newFile?.contents.length ?? -1}`}
                sidebarOpen={sidebarOpen}
                onToggleSidebar={() => setSidebarOpen((v) => !v)}
              />
            )}
          </main>
        </div>

        <RepoTabs
          sidebarOpen={sidebarOpen}
          repos={repos}
          activeRepo={activeRepo}
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
          onSelectRepo={(repo) => {
            void selectRepo(repo)
          }}
          onAddRepo={() => {
            void selectFolder()
          }}
        />
      </div>
    </div>
  )
}
