import { GitCommitHorizontal, RefreshCw } from 'lucide-react'

import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { Input } from '@/components/ui/input'
import { useGetGitSnapshotQuery } from '@/features/source-control/api'
import {
  commitAction,
  refreshActiveRepo,
  setCommitMessageValue,
} from '@/features/source-control/actions'

export function CommitBox() {
  const dispatch = useAppDispatch()
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo)
  const runningAction = useAppSelector((state) => state.sourceControl.runningAction)
  const commitMessage = useAppSelector((state) => state.sourceControl.commitMessage)
  const { data: snapshot, isFetching: loadingSnapshot } = useGetGitSnapshotQuery(activeRepo, {
    skip: !activeRepo,
  })
  const stagedCount = snapshot?.staged?.length ?? 0
  const canCommit = !!commitMessage.trim() && stagedCount > 0 && !runningAction

  return (
    <div className="border-border border-b p-2">
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="text-muted-foreground hover:bg-accent hover:text-foreground p-1.5 disabled:opacity-50"
          title="Refresh"
          onClick={() => {
            void dispatch(refreshActiveRepo())
          }}
          disabled={!activeRepo || loadingSnapshot || runningAction !== ''}
        >
          <RefreshCw className={`h-4 w-4 ${loadingSnapshot ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="border-input bg-surface-alt mt-2 border p-1.5">
        <Input
          value={commitMessage}
          onChange={(e) => dispatch(setCommitMessageValue(e.target.value))}
          placeholder="Message (Cmd+Enter to commit)"
          className="border-input bg-input h-7 text-xs"
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault()
              void dispatch(commitAction())
            }
          }}
        />
        <button
          type="button"
          className="bg-destructive text-destructive-foreground hover:bg-destructive/90 mt-1.5 flex w-full items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60"
          onClick={() => {
            void dispatch(commitAction())
          }}
          disabled={!canCommit}
        >
          <GitCommitHorizontal className="h-3.5 w-3.5" />
          {runningAction === 'commit' ? 'Committing...' : 'Commit'}
        </button>
      </div>
    </div>
  )
}
