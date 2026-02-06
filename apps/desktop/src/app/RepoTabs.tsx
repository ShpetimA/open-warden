import { repoLabel } from '@/features/source-control/utils'

type Props = {
  sidebarOpen: boolean
  repos: Array<string | undefined>
  activeRepo: string
  onToggleSidebar: () => void
  onSelectRepo: (repo: string) => void
  onAddRepo: () => void
}

export function RepoTabs({ sidebarOpen, repos, activeRepo, onToggleSidebar, onSelectRepo, onAddRepo }: Props) {
  return (
    <div className="border-t border-[#2f3138] bg-[#17181d] px-2">
      <div className="flex h-full items-center gap-1">
        <button
          type="button"
          className="rounded border border-[#3a3d46] px-2 py-0.5 text-xs text-[#aeb5c6] hover:bg-[#23262e]"
          onClick={onToggleSidebar}
          title={sidebarOpen ? 'Close Source Control' : 'Open Source Control'}
        >
          {sidebarOpen ? 'Hide' : 'Show'}
        </button>

        {repos.map((repoPath) => {
          if (!repoPath) return null

          return (
            <button
              key={repoPath}
              type="button"
              className={`rounded border px-2 py-0.5 text-xs ${
                repoPath === activeRepo
                  ? 'border-[#505768] bg-[#2c3240] text-[#e5e8f0]'
                  : 'border-[#3a3d46] text-[#aeb5c6] hover:bg-[#23262e]'
              }`}
              onClick={() => onSelectRepo(repoPath)}
              title={repoPath}
            >
              {repoLabel(repoPath)}
            </button>
          )
        })}

        <button
          type="button"
          className="rounded border border-[#3a3d46] px-2 py-0.5 text-xs text-[#aeb5c6] hover:bg-[#23262e]"
          onClick={onAddRepo}
          title="Add repository"
        >
          +
        </button>
      </div>
    </div>
  )
}
