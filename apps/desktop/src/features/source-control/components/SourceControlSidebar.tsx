import type { FeatureKey } from '@/app/featureNavigation'
import { GitBranch, RefreshCw } from 'lucide-react'
import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { refreshActiveRepo } from '@/features/source-control/actions'
import { setHistoryNavTarget } from '@/features/source-control/sourceControlSlice'
import { repoLabel } from '@/features/source-control/utils'
import { OpenInExternalEditor } from './OpenInExternalEditor'
import { ChangesTab } from './ChangesTab'
import { HistoryTab } from './HistoryTab'

type SourceControlSidebarProps = {
  feature: Extract<FeatureKey, 'changes' | 'history'>
  activeBranch?: string
}

export function SourceControlSidebar({ feature, activeBranch }: SourceControlSidebarProps) {
  const dispatch = useAppDispatch()
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo)
  const runningAction = useAppSelector((state) => state.sourceControl.runningAction)
  const isHistoryFeature = feature === 'history'
  const branchLabel = activeBranch || 'Detached HEAD'

  return (
    <aside
      onMouseDown={() => {
        if (isHistoryFeature) {
          dispatch(setHistoryNavTarget('commits'))
        }
      }}
      className="bg-surface-toolbar border-border/70 flex h-full min-h-0 flex-col overflow-hidden overflow-x-hidden border-r"
    >
      <div className="border-border border-b px-3 py-1.5">
        <div className="flex items-center gap-2">
          <div className="text-foreground/80 text-[11px] font-semibold tracking-[0.14em]">
            CURRENT REPOSITORY
          </div>
          <div className="ml-auto flex items-center gap-0.5">
            <OpenInExternalEditor repoPath={activeRepo} target="repository" compact disabled={!!runningAction} />
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground inline-flex h-6 w-6 items-center justify-center"
              title="Refresh repository status"
              aria-label="Refresh repository status"
              disabled={!activeRepo || !!runningAction}
              onClick={() => {
                void dispatch(refreshActiveRepo())
              }}
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <div className="text-muted-foreground mt-0.5 flex min-w-0 items-center gap-1 text-xs">
          <span className="truncate">
            {activeRepo ? repoLabel(activeRepo) : 'No repo selected'}
          </span>
          {activeRepo ? (
            <>
              <span aria-hidden>·</span>
              <GitBranch className="h-3 w-3 shrink-0" />
              <span className="truncate">{branchLabel}</span>
            </>
          ) : null}
        </div>

      </div>

      {isHistoryFeature ? <HistoryTab /> : <ChangesTab />}
    </aside>
  )
}
