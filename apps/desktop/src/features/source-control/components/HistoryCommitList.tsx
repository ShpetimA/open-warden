import { useSearchParams } from "react-router";
import { skipToken } from "@reduxjs/toolkit/query";

import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { Button } from "@/components/ui/button";
import { CommitRow } from "@/components/ui/commit-row";
import { Kbd } from "@/components/ui/kbd";
import { useGetCommitHistoryQuery } from "@/features/source-control/api";
import {
  selectHistoryCommit,
  setHistoryCommitSelectedValue,
} from "@/features/source-control/actions";
import { HISTORY_FILTER_INPUT_ID } from "@/features/source-control/constants";
import {
  clearHistoryCommitSelection,
  setHistoryFilter,
} from "@/features/source-control/sourceControlSlice";
import type { HistoryCommit } from "@/features/source-control/types";
import { CommitHoverDetails } from "./CommitHoverDetails";
import { CommitListPane } from "./CommitListPane";
import { HistoryCommitMenu } from "./HistoryCommitMenu";

const EMPTY_COMMITS: readonly HistoryCommit[] = [];

export function HistoryCommitList() {
  const [searchParams] = useSearchParams();
  const dispatch = useAppDispatch();
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo);
  const historyFilter = useAppSelector((state) => state.sourceControl.historyFilter);
  const { historyCommits, loadingHistoryCommits, error, lastUpdated, refetch } =
    useGetCommitHistoryQuery(activeRepo ? { repoPath: activeRepo } : skipToken, {
      selectFromResult: ({ currentData, isFetching, error, fulfilledTimeStamp }) => ({
        historyCommits: currentData ?? EMPTY_COMMITS,
        loadingHistoryCommits: isFetching,
        error,
        lastUpdated: fulfilledTimeStamp,
      }),
    });
  const query = historyFilter.trim().toLowerCase();
  const filteredHistoryCommits = historyCommits.filter((commit) =>
    [commit.summary, commit.shortId, commit.commitId, commit.author].some((value) =>
      value.toLowerCase().includes(query),
    ),
  );

  return (
    <CommitListPane
      title="History commits"
      virtualize
      initialIndex={filteredHistoryCommits.findIndex(
        (commit) => commit.commitId === searchParams.get("commit"),
      )}
      commits={filteredHistoryCommits}
      totalCount={historyCommits.length}
      filter={historyFilter}
      onFilterChange={(filter) => dispatch(setHistoryFilter(filter))}
      filterInputId={HISTORY_FILTER_INPUT_ID}
      filterHint={<Kbd className="h-4 px-1 text-[10px]">/</Kbd>}
      navRegion="history-commits"
      loading={loadingHistoryCommits}
      error={error}
      lastUpdated={lastUpdated}
      onRetry={() => {
        void refetch();
      }}
      emptyMessage="No commits found."
      notice={<HistorySelectionNotice commits={historyCommits} />}
      renderHoverContent={(commit) => (
        <CommitHoverDetails commitId={commit.commitId} summary={commit.summary} />
      )}
      renderRow={(commit, index) => <HistoryCommitListRow commit={commit} navIndex={index} />}
    />
  );
}

function HistorySelectionNotice({ commits }: { commits: readonly HistoryCommit[] }) {
  const dispatch = useAppDispatch();
  const selectedCount = useAppSelector(
    (state) => state.sourceControl.historySelectedCommitIds.length,
  );
  const pinnedCommitId = useAppSelector((state) => {
    const { historyPinnedCommitId, historyCommitId } = state.sourceControl;
    return historyPinnedCommitId === historyCommitId ? historyPinnedCommitId : "";
  });

  return (
    <>
      {selectedCount > 0 ? (
        <div className="border-border bg-surface-active flex shrink-0 items-center justify-between gap-2 border-b px-2 py-1.5 text-[11px]">
          <span role="status">
            {selectedCount === 2 ? "Showing combined changes" : "Select one more commit to combine"}
          </span>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            className="h-6 shrink-0 px-1.5 text-[11px]"
            onClick={() => dispatch(clearHistoryCommitSelection())}
          >
            Clear
          </Button>
        </div>
      ) : null}
      {pinnedCommitId && !commits.some((commit) => commit.commitId === pinnedCommitId) ? (
        <div className="border-border shrink-0 border-b px-2 py-2 text-xs">
          <div className="font-medium">Selected commit outside this branch</div>
          <div className="text-muted-foreground mt-1 truncate font-mono" title={pinnedCommitId}>
            {pinnedCommitId}
          </div>
        </div>
      ) : null}
    </>
  );
}

function HistoryCommitListRow({ commit, navIndex }: { commit: HistoryCommit; navIndex: number }) {
  const dispatch = useAppDispatch();
  const isActive = useAppSelector(
    (state) => state.sourceControl.historyCommitId === commit.commitId,
  );
  const isSelected = useAppSelector((state) =>
    state.sourceControl.historySelectedCommitIds.includes(commit.commitId),
  );
  const selectionDisabled = useAppSelector((state) => {
    const selectedIds = state.sourceControl.historySelectedCommitIds;
    return selectedIds.length >= 2 && !selectedIds.includes(commit.commitId);
  });

  return (
    <HistoryCommitMenu commit={commit}>
      <div>
        <CommitRow
          {...commit}
          navIndex={navIndex}
          active={isActive}
          onOpen={() => {
            void dispatch(selectHistoryCommit(commit.commitId));
          }}
          selection={{
            checked: isSelected,
            disabled: selectionDisabled,
            onCheckedChange: (selected) => {
              void dispatch(setHistoryCommitSelectedValue(commit.commitId, selected));
            },
          }}
        />
      </div>
    </HistoryCommitMenu>
  );
}
