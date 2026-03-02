import { repoLabel } from '@/features/source-control/utils'

type Props = {
  repos: Array<string | undefined>
  activeRepo: string
  onSelectRepo: (repo: string) => void
  onCloseRepo: (repo: string) => void
  onAddRepo: () => void
}

function tabStateClass(isActive: boolean): string {
  if (isActive) return 'bg-surface-active text-foreground'
  return 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
}

export function RepoTabs({
  repos,
  activeRepo,
  onSelectRepo,
  onCloseRepo,
  onAddRepo,
}: Props) {
  const openRepos = repos.filter((repoPath): repoPath is string => Boolean(repoPath))

  return (
    <div className="border-border bg-surface h-full border-t">
      <div className="flex h-full items-stretch overflow-x-auto">
        {openRepos.map((repoPath, index) => {
          const isActive = repoPath === activeRepo
          const firstTabBorderClass = index === 0 ? 'border-l' : ''

          return (
            <div
              key={repoPath}
              className={`border-border ${tabStateClass(isActive)} ${firstTabBorderClass} flex h-full shrink-0 items-stretch border-r`}
              title={repoPath}
            >
              <button
                type="button"
                className="flex h-full max-w-56 items-center truncate px-3 text-xs"
                onClick={() => onSelectRepo(repoPath)}
              >
                {repoLabel(repoPath)}
              </button>
              <button
                type="button"
                className="border-border/70 hover:bg-destructive/20 hover:text-destructive flex h-full items-center border-l px-2 text-xs"
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
          className="border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground flex h-full shrink-0 items-center border-r border-l px-3 text-xs"
          onClick={onAddRepo}
          title="Add repository"
        >
          +
        </button>
      </div>
    </div>
  )
}
