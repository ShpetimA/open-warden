import { skipToken } from '@reduxjs/toolkit/query'

import { useAppDispatch, useAppSelector } from '@/app/hooks'

import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useGetCommitHistoryQuery } from '@/features/source-control/api'
import { selectHistoryCommit } from '@/features/source-control/actions'
import { HISTORY_FILTER_INPUT_ID } from '@/features/source-control/constants'
import { setHistoryFilter } from '@/features/source-control/sourceControlSlice'
import type { HistoryCommit } from '@/features/source-control/types'

export function HistoryTab() {
  const dispatch = useAppDispatch()
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo)
  const historyFilter = useAppSelector((state) => state.sourceControl.historyFilter)
  const { data: historyCommits = [], isFetching: loadingHistoryCommits } = useGetCommitHistoryQuery(
    activeRepo ? { repoPath: activeRepo } : skipToken,
  )

  const allHistoryCommits = historyCommits as HistoryCommit[]
  const query = historyFilter.trim().toLowerCase()
  const filteredHistoryCommits = query
    ? allHistoryCommits.filter((commit) => {
        return (
          commit.summary.toLowerCase().includes(query) ||
          commit.shortId.toLowerCase().includes(query) ||
          commit.commitId.toLowerCase().includes(query) ||
          commit.author.toLowerCase().includes(query)
        )
      })
    : allHistoryCommits

  return (
    <ScrollArea className="min-h-0 flex-1 overflow-hidden p-2">
      <div className="flex w-full min-w-0 flex-col space-y-1 overflow-hidden">
        <Input
          id={HISTORY_FILTER_INPUT_ID}
          value={historyFilter}
          onChange={(event) => dispatch(setHistoryFilter(event.target.value))}
          placeholder="Filter commits (/, msg, id, author)"
          className="h-7 border-[#32353f] bg-[#101116] px-2 text-xs"
        />

        <div className="text-[11px] text-[#7f8698]">
          {filteredHistoryCommits.length} / {historyCommits.length} commits
        </div>

        {loadingHistoryCommits ? (
          <div className="border border-[#30323a] bg-[#1a1b1f] px-2 py-2 text-[11px] text-[#8c92a5]">
            Loading history...
          </div>
        ) : filteredHistoryCommits.length === 0 ? (
          <div className="border border-[#30323a] bg-[#1a1b1f] px-2 py-2 text-[11px] text-[#8c92a5]">
            {historyCommits.length === 0 ? 'No commits found.' : 'No matches.'}
          </div>
        ) : (
          filteredHistoryCommits.map((commit) => (
            <HistoryCommitRow
              key={commit.commitId}
              commit={commit}
              onSelect={(commitId) => {
                void dispatch(selectHistoryCommit(commitId))
              }}
            />
          ))
        )}
      </div>
    </ScrollArea>
  )
}

type HistoryCommitRowProps = {
  commit: HistoryCommit
  onSelect: (commitId: string) => void
}

function HistoryCommitRow({ commit, onSelect }: HistoryCommitRowProps) {
  const isActive = useAppSelector((state) => state.sourceControl.historyCommitId === commit.commitId)

  return (
    <button
      type="button"
      className={`block w-full min-w-0 overflow-hidden border px-2 py-1.5 text-left ${
        isActive
          ? 'border-[#445172] bg-[#262d3d]'
          : 'border-[#30323a] bg-[#1a1b1f] hover:bg-[#23262d]'
      }`}
      onClick={() => onSelect(commit.commitId)}
      title={commit.summary || commit.commitId}
    >
      <div className="flex min-w-0">
        <span className="w-0 flex-1 truncate text-xs font-semibold text-[#e9edf8]">
          {commit.summary || '(no commit message)'}
        </span>
      </div>
      <div className="mt-1 flex min-w-0 items-center gap-1 overflow-hidden text-[11px] text-[#8f96a8]">
        <span className="max-w-[32%] shrink-0 truncate bg-[#303544] px-1 py-0.5 font-medium text-[#c9d2ea]">
          {commit.shortId}
        </span>
        <span className="min-w-0 flex-1 truncate">{commit.author || 'Unknown'}</span>
        <span className="max-w-[35%] shrink truncate">{commit.relativeTime}</span>
      </div>
    </button>
  )
}
