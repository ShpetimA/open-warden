import { GitCommitHorizontal, RefreshCw } from 'lucide-react'
import { useSelector } from '@legendapp/state/react'

import { Input } from '@/components/ui/input'
import {
  commitAction,
  refreshActiveRepo,
  setCommitMessage,
} from '@/features/source-control/actions'
import { appState$ } from '@/features/source-control/store'

type Props = {
  canCommit: boolean
}

export function CommitBox({ canCommit }: Props) {
  const activeRepo = useSelector(appState$.activeRepo)
  const loadingSnapshot = useSelector(appState$.loadingSnapshot)
  const runningAction = useSelector(appState$.runningAction)
  const commitMessage = useSelector(appState$.commitMessage)

  return (
    <div className="border-b border-[#2f3138] p-2">
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="p-1.5 text-[#b7bdcc] hover:bg-[#2b2f3a] hover:text-white disabled:opacity-50"
          title="Refresh"
          onClick={() => {
            void refreshActiveRepo()
          }}
          disabled={!activeRepo || loadingSnapshot || runningAction !== ''}
        >
          <RefreshCw className={`h-4 w-4 ${loadingSnapshot ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="mt-2 border border-[#32353f] bg-[#101116] p-1.5">
        <Input
          value={commitMessage}
          onChange={(e) => setCommitMessage(e.target.value)}
          placeholder="Message (Cmd+Enter to commit)"
          className="h-7 border-[#3a3d48] bg-[#151721] text-xs"
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault()
              void commitAction()
            }
          }}
        />
        <button
          type="button"
          className="mt-1.5 flex w-full items-center justify-center gap-1.5 bg-[#f1cad2] px-2 py-1.5 text-xs font-semibold text-[#1b1c20] hover:bg-[#f6d7dd] disabled:cursor-not-allowed disabled:opacity-60"
          onClick={() => {
            void commitAction()
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
