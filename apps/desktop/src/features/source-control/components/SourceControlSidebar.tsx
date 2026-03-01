import type { FeatureKey } from '@/app/featureNavigation'
import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { setHistoryNavTarget } from '@/features/source-control/sourceControlSlice'
import { repoLabel } from '@/features/source-control/utils'
import { ChangesTab } from './ChangesTab'
import { HistoryTab } from './HistoryTab'

type SourceControlSidebarProps = {
  feature: Extract<FeatureKey, 'changes' | 'history'>
  activeBranch?: string
}

export function SourceControlSidebar({ feature, activeBranch }: SourceControlSidebarProps) {
  const dispatch = useAppDispatch()
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo)
  const isHistoryFeature = feature === 'history'

  return (
    <aside
      onMouseDown={() => {
        if (isHistoryFeature) {
          dispatch(setHistoryNavTarget('commits'))
        }
      }}
      className="bg-surface flex min-h-0 flex-col overflow-hidden overflow-x-hidden"
    >
      <div className="border-border border-b px-3 py-2">
        <div className="text-foreground/80 text-[11px] font-semibold tracking-[0.14em]">
          SOURCE CONTROL
        </div>
        <div className="text-muted-foreground mt-1 truncate text-xs">
          {activeRepo
            ? `${repoLabel(activeRepo)}${activeBranch ? ` · ${activeBranch}` : ''}`
            : 'No repo selected'}
        </div>
      </div>

      {isHistoryFeature ? <HistoryTab /> : <ChangesTab />}
    </aside>
  )
}
