import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { useGetGitSnapshotQuery } from '@/features/source-control/api'
import { setHistoryNavTarget } from '@/features/source-control/sourceControlSlice'
import { setViewMode } from '@/features/source-control/actions'
import { repoLabel } from '@/features/source-control/utils'
import { ChangesTab } from './ChangesTab'
import { HistoryTab } from './HistoryTab'

export function SourceControlSidebar() {
  const dispatch = useAppDispatch()
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo)
  const viewMode = useAppSelector((state) => state.sourceControl.viewMode)
  const { data: snapshot } = useGetGitSnapshotQuery(activeRepo, { skip: !activeRepo })

  return (
    <aside
      onMouseDown={() => {
        if (viewMode === 'history') {
          dispatch(setHistoryNavTarget('commits'))
        }
      }}
      className="flex min-h-0 flex-col overflow-hidden overflow-x-hidden border-r border-[#2f3138] bg-[#17181d]"
    >
      <div className="border-b border-[#2f3138] px-3 py-2">
        <div className="text-[11px] font-semibold tracking-[0.14em] text-[#aeb5c6]">SOURCE CONTROL</div>
        <div className="mt-1 truncate text-xs text-[#7f8698]">
          {activeRepo
            ? `${repoLabel(activeRepo)}${snapshot?.branch ? ` · ${snapshot.branch}` : ''}`
            : 'No repo selected'}
        </div>

        <div className="mt-2 grid grid-cols-2 gap-1 border border-[#32353f] bg-[#11131a] p-1">
          <button
            type="button"
            className={`px-2 py-1 text-xs font-medium ${
              viewMode === 'changes'
                ? 'bg-[#2b3140] text-[#ebeffa]'
                : 'text-[#8f96a8] hover:bg-[#222733] hover:text-[#d7deef]'
            }`}
            onClick={() => {
              void dispatch(setViewMode('changes'))
            }}
          >
            Changes
          </button>
          <button
            type="button"
            className={`px-2 py-1 text-xs font-medium ${
              viewMode === 'history'
                ? 'bg-[#2b3140] text-[#ebeffa]'
                : 'text-[#8f96a8] hover:bg-[#222733] hover:text-[#d7deef]'
            }`}
            onClick={() => {
              void dispatch(setViewMode('history'))
            }}
          >
            History
          </button>
        </div>
      </div>

      {viewMode === 'changes' ? <ChangesTab /> : <HistoryTab />}
    </aside>
  )
}
