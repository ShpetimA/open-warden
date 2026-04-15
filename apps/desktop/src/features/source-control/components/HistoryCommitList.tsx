import { skipToken } from "@reduxjs/toolkit/query";

import { useAppDispatch, useAppSelector } from "@/app/hooks";

import { Kbd } from "@/components/ui/kbd";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useGetCommitHistoryQuery } from "@/features/source-control/api";
import { selectHistoryCommit } from "@/features/source-control/actions";
import { HISTORY_FILTER_INPUT_ID } from "@/features/source-control/constants";
import { setHistoryFilter } from "@/features/source-control/sourceControlSlice";
import type { HistoryCommit } from "@/features/source-control/types";

export function HistoryCommitList() {
  const dispatch = useAppDispatch();
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo);
  const historyFilter = useAppSelector((state) => state.sourceControl.historyFilter);
  const { data: historyCommits = [], isFetching: loadingHistoryCommits } = useGetCommitHistoryQuery(
    activeRepo ? { repoPath: activeRepo } : skipToken,
  );

  const allHistoryCommits = historyCommits as HistoryCommit[];
  const query = historyFilter.trim().toLowerCase();
  const filteredHistoryCommits = query
    ? allHistoryCommits.filter((commit) => {
        return (
          commit.summary.toLowerCase().includes(query) ||
          commit.shortId.toLowerCase().includes(query) ||
          commit.commitId.toLowerCase().includes(query) ||
          commit.author.toLowerCase().includes(query)
        );
      })
    : allHistoryCommits;

  return (
    <ScrollArea data-nav-region="history-commits" className="min-h-0 flex-1 overflow-hidden">
      <div className="flex w-full min-w-0 flex-col gap-2 p-2">
        <div className="border-input bg-surface-alt/50 rounded-md border p-2">
          <Input
            id={HISTORY_FILTER_INPUT_ID}
            value={historyFilter}
            onChange={(event) => dispatch(setHistoryFilter(event.target.value))}
            placeholder="Filter commits (msg, id, author)"
            className="border-input bg-input h-8 px-2 text-xs"
          />

          <div className="mt-1.5 flex items-center justify-between gap-2">
            <div className="text-muted-foreground text-[11px]">
              {filteredHistoryCommits.length} / {historyCommits.length} commits
            </div>
            <Kbd className="h-4 px-1 text-[10px]">/</Kbd>
          </div>
        </div>

        {loadingHistoryCommits ? (
          <div className="border-input bg-surface text-muted-foreground rounded-md border px-2 py-2 text-[11px]">
            Loading history...
          </div>
        ) : filteredHistoryCommits.length === 0 ? (
          <div className="border-input bg-surface text-muted-foreground rounded-md border px-2 py-2 text-[11px]">
            {historyCommits.length === 0 ? "No commits found." : "No matches."}
          </div>
        ) : (
          <div className="space-y-1.5 pb-2">
            {filteredHistoryCommits.map((commit, index) => (
              <HistoryCommitRow
                key={commit.commitId}
                commit={commit}
                navIndex={index}
                onSelect={(commitId) => {
                  void dispatch(selectHistoryCommit(commitId));
                }}
              />
            ))}
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

type HistoryCommitRowProps = {
  commit: HistoryCommit;
  navIndex: number;
  onSelect: (commitId: string) => void;
};

function HistoryCommitRow({ commit, navIndex, onSelect }: HistoryCommitRowProps) {
  const isActive = useAppSelector(
    (state) => state.sourceControl.historyCommitId === commit.commitId,
  );
  const stateClass = isActive
    ? "border-ring/30 bg-surface-active shadow-[inset_0_0_0_1px_rgba(120,132,160,0.3)]"
    : "border-input bg-surface hover:bg-accent/45";

  return (
    <button
      type="button"
      data-nav-index={navIndex}
      className={`block w-full min-w-0 overflow-hidden rounded-md border px-2.5 py-2 text-left ${stateClass}`}
      onClick={() => onSelect(commit.commitId)}
      title={commit.summary || commit.commitId}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="text-foreground w-0 flex-1 truncate text-[13px] leading-5 font-semibold">
          {commit.summary || "(no commit message)"}
        </span>
      </div>
      <div className="text-muted-foreground mt-1.5 flex min-w-0 items-center gap-1.5 overflow-hidden text-[11px]">
        <span className="border-input bg-surface-alt text-foreground/90 max-w-[32%] shrink-0 truncate rounded-sm border px-1.5 py-0.5 font-semibold">
          {commit.shortId}
        </span>
        <span className="min-w-0 flex-1 truncate">{commit.author || "Unknown"}</span>
        <span className="shrink-0 truncate">{commit.relativeTime}</span>
      </div>
    </button>
  );
}
