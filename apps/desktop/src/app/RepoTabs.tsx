import { Plus, X } from 'lucide-react'

import { repoLabel } from '@/features/source-control/utils'

type Props = {
  repos: Array<string | undefined>
  activeRepo: string
  onSelectRepo: (repo: string) => void
  onCloseRepo: (repo: string) => void
  onAddRepo: () => void
}

function tabStateClass(isActive: boolean): string {
  if (isActive) {
    return 'border-ring/30 bg-surface-active text-foreground shadow-[inset_0_0_0_1px_rgba(120,132,160,0.22)]'
  }
  return 'border-border/70 bg-surface-alt/40 text-muted-foreground hover:bg-accent/45 hover:text-foreground'
}

function closeButtonClass(isActive: boolean): string {
  if (isActive) {
    return 'text-muted-foreground hover:bg-destructive/20 hover:text-destructive'
  }
  return 'text-muted-foreground/85 hover:bg-accent hover:text-foreground'
}

export function RepoTabs({ repos, activeRepo, onSelectRepo, onCloseRepo, onAddRepo }: Props) {
  const openRepos = repos.filter((repoPath): repoPath is string => Boolean(repoPath))

  return (
    <div className="border-border/70 bg-surface h-full border-t px-1.5">
      <div className="flex h-full items-center gap-1 overflow-x-auto">
        {openRepos.map((repoPath, index) => {
          const isActive = repoPath === activeRepo
          const tabClass = tabStateClass(isActive)
          const closeClass = closeButtonClass(isActive)
          const firstTabEdgeClass = index === 0 ? 'rounded-tl-none' : ''

          return (
            <div
              key={repoPath}
              className={`flex h-7 shrink-0 items-center rounded-md border pl-1.5 ${tabClass} ${firstTabEdgeClass}`}
              title={repoPath}
            >
              <button
                type="button"
                className="flex h-full max-w-56 min-w-0 items-center truncate pr-1 text-sm font-medium"
                onClick={() => onSelectRepo(repoPath)}
              >
                {repoLabel(repoPath)}
              </button>
              <button
                type="button"
                className={`ml-1 inline-flex h-5 w-5 items-center justify-center rounded-sm transition-colors ${closeClass}`}
                onClick={(event) => {
                  event.stopPropagation()
                  onCloseRepo(repoPath)
                }}
                title={`Close ${repoLabel(repoPath)}`}
                aria-label={`Close ${repoLabel(repoPath)} repository`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )
        })}

        <button
          type="button"
          className="border-border/70 text-muted-foreground hover:bg-accent hover:text-foreground inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition-colors"
          onClick={onAddRepo}
          title="Add repository"
          aria-label="Add repository"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
