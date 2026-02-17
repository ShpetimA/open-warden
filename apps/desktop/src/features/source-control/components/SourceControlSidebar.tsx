import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { useGetGitSnapshotQuery } from '@/features/source-control/api'
import { setHistoryNavTarget } from '@/features/source-control/sourceControlSlice'
import { repoLabel } from '@/features/source-control/utils'
import { useLocation, useNavigate } from 'react-router'
import { ChangesTab } from './ChangesTab'
import { HistoryTab } from './HistoryTab'

export function SourceControlSidebar() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const location = useLocation()
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo)
  const { data: snapshot } = useGetGitSnapshotQuery(activeRepo, { skip: !activeRepo })
  const isHistoryRoute = location.pathname.startsWith('/history')
  const isChangesRoute = location.pathname.startsWith('/changes') || !isHistoryRoute

  return (
    <aside
      onMouseDown={() => {
        if (isHistoryRoute) {
          dispatch(setHistoryNavTarget('commits'))
        }
      }}
      className="border-border bg-surface flex min-h-0 flex-col overflow-hidden overflow-x-hidden border-r"
    >
      <div className="border-border border-b px-3 py-2">
        <div className="text-foreground/80 text-[11px] font-semibold tracking-[0.14em]">
          SOURCE CONTROL
        </div>
        <div className="text-muted-foreground mt-1 truncate text-xs">
          {activeRepo
            ? `${repoLabel(activeRepo)}${snapshot?.branch ? ` · ${snapshot.branch}` : ''}`
            : 'No repo selected'}
        </div>

        <div className="border-input bg-surface-alt mt-2 grid grid-cols-2 gap-1 border p-1">
          <button
            type="button"
            className={`px-2 py-1 text-xs font-medium ${
              isChangesRoute
                ? 'bg-surface-active text-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            }`}
            onClick={() => {
              navigate('/changes')
            }}
          >
            Changes
          </button>
          <button
            type="button"
            className={`px-2 py-1 text-xs font-medium ${
              isHistoryRoute
                ? 'bg-surface-active text-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            }`}
            onClick={() => {
              navigate('/history')
            }}
          >
            History
          </button>
        </div>
      </div>

      {isHistoryRoute ? <HistoryTab /> : <ChangesTab />}
    </aside>
  )
}
