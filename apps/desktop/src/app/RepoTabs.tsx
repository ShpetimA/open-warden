import { repoLabel } from '@/features/source-control/utils'

type Props = {
  sidebarOpen: boolean
  repos: Array<string | undefined>
  activeRepo: string
  onToggleSidebar: () => void
  onSelectRepo: (repo: string) => void
  onCloseRepo: (repo: string) => void
  onAddRepo: () => void
}

export function RepoTabs({
  sidebarOpen,
  repos,
  activeRepo,
  onToggleSidebar,
  onSelectRepo,
  onCloseRepo,
  onAddRepo,
}: Props) {
  return (
    <div className="border-border bg-surface border-t px-2">
      <div className="flex h-full items-center gap-1">
        <button
          type="button"
          className="border-input text-muted-foreground hover:bg-accent hover:text-accent-foreground border px-2 py-0.5 text-xs"
          onClick={onToggleSidebar}
          title={sidebarOpen ? 'Close Source Control' : 'Open Source Control'}
        >
          {sidebarOpen ? 'Hide' : 'Show'}
        </button>

        {repos.map((repoPath) => {
          if (!repoPath) return null

          const isActive = repoPath === activeRepo

          return (
            <div
              key={repoPath}
              className={`flex items-center border text-xs ${
                isActive
                  ? 'border-ring/40 bg-surface-active text-foreground'
                  : 'border-input text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              }`}
              title={repoPath}
            >
              <button type="button" className="px-2 py-0.5" onClick={() => onSelectRepo(repoPath)}>
                {repoLabel(repoPath)}
              </button>
              <button
                type="button"
                className="hover:bg-destructive/20 hover:text-destructive px-1.5 py-0.5"
                onClick={(event) => {
                  event.stopPropagation()
                  onCloseRepo(repoPath)
                }}
                title={`Close ${repoLabel(repoPath)}`}
                aria-label={`Close ${repoLabel(repoPath)} repository`}
              >
                x
              </button>
            </div>
          )
        })}

        <button
          type="button"
          className="border-input text-muted-foreground hover:bg-accent hover:text-accent-foreground border px-2 py-0.5 text-xs"
          onClick={onAddRepo}
          title="Add repository"
        >
          +
        </button>
      </div>
    </div>
  )
}
