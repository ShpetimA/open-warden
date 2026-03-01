import { Search } from 'lucide-react'
import { useNavigate } from 'react-router'

import { ThemeSwitcher } from '@/app/ThemeSwitcher'
import { FEATURE_NAV_ITEMS, type FeatureKey } from '@/app/featureNavigation'
import { repoLabel } from '@/features/source-control/utils'

type AppHeaderProps = {
  activeFeature: FeatureKey
  activeRepo: string
  activeBranch?: string
  onOpenCommandPalette: () => void
}

function repoSummary(activeRepo: string, activeBranch?: string) {
  if (!activeRepo) return 'No repo selected'
  const label = repoLabel(activeRepo)
  if (!activeBranch) return label
  return `${label} · ${activeBranch}`
}

export function AppHeader({
  activeFeature,
  activeRepo,
  activeBranch,
  onOpenCommandPalette,
}: AppHeaderProps) {
  const navigate = useNavigate()
  const repoInfo = repoSummary(activeRepo, activeBranch)

  return (
    <header className="border-border bg-surface-toolbar grid h-14 grid-cols-[auto_1fr_auto] items-center gap-3 border-b px-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className="text-sm font-semibold tracking-tight">Open Warden</span>
      </div>

      <div className="flex min-w-0 justify-center">
        <div className="border-input bg-surface-alt inline-flex w-fit items-center gap-1 rounded-xl border p-1">
          {FEATURE_NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const isActive = item.key === activeFeature

            return (
              <button
                key={item.key}
                type="button"
                className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm ${
                  isActive
                    ? 'bg-surface-active text-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                }`}
                onClick={() => {
                  navigate(item.path)
                }}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{item.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex min-w-0 items-center justify-end gap-2">
        <button
          type="button"
          className="border-input bg-surface-alt text-muted-foreground hover:text-foreground inline-flex h-8 items-center gap-2 rounded-md border px-2 text-xs"
          onClick={onOpenCommandPalette}
          title="Open Command Palette (⌘K)"
        >
          <Search className="h-3.5 w-3.5" />
          <span>Command</span>
          <kbd className="bg-surface border-input rounded-sm border px-1 text-[10px]">⌘K</kbd>
        </button>

        <ThemeSwitcher />

        <div className="text-muted-foreground min-w-0 max-w-[240px] truncate text-xs" title={repoInfo}>
          {repoInfo}
        </div>
      </div>
    </header>
  )
}
