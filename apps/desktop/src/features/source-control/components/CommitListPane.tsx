import { Fragment, type ReactNode } from "react";

import { Input } from "@/components/ui/input";
import { ListLoadingState } from "@/components/ui/list-loading-state";
import type { HistoryCommit } from "@/features/source-control/types";
import { TreeRowHover } from "./TreeRowHover";

type CommitListPaneProps = Readonly<{
  title: string;
  commits: readonly HistoryCommit[];
  totalCount: number;
  filter: string;
  onFilterChange: (filter: string) => void;
  filterInputId?: string;
  filterHint?: ReactNode;
  navRegion: string;
  loading: boolean;
  error?: string;
  emptyMessage: string;
  notice?: ReactNode;
  renderRow: (commit: HistoryCommit, index: number) => ReactNode;
  renderHoverContent?: (commit: HistoryCommit) => ReactNode;
}>;

export function CommitListPane({
  title,
  commits,
  totalCount,
  filter,
  onFilterChange,
  filterInputId,
  filterHint,
  navRegion,
  loading,
  error,
  emptyMessage,
  notice,
  renderRow,
  renderHoverContent,
}: CommitListPaneProps) {
  return (
    <div
      data-slot="commit-list-pane"
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
    >
      <div className="border-border flex shrink-0 flex-col gap-1 border-b px-2 py-2">
        <div className="text-muted-foreground flex items-center justify-between text-[11px]">
          <span className="font-medium uppercase tracking-wider">{title}</span>
          <span className="flex items-center gap-2">
            <span className="tabular-nums">
              {commits.length === totalCount ? totalCount : `${commits.length} / ${totalCount}`}
            </span>
            {filterHint}
          </span>
        </div>
        <Input
          id={filterInputId}
          aria-label="Filter commits"
          placeholder="Filter commits…"
          className="h-7 px-2 text-xs"
          value={filter}
          onChange={(event) => onFilterChange(event.target.value)}
        />
      </div>
      {notice}
      <div className="min-h-0 flex-1 overflow-y-auto" data-nav-region={navRegion}>
        {loading ? (
          <ListLoadingState label="Loading commits…" />
        ) : error ? (
          <p role="alert" className="text-destructive p-3 text-xs">
            {error}
          </p>
        ) : commits.length === 0 ? (
          <p className="text-muted-foreground p-3 text-xs">
            {totalCount ? "No matching commits." : emptyMessage}
          </p>
        ) : (
          <TreeRowHover
            renderContent={(path) => {
              const commit = commits.find((item) => item.commitId === path);
              return commit ? renderHoverContent?.(commit) : undefined;
            }}
          >
            {commits.map((commit, index) => (
              <Fragment key={commit.commitId}>{renderRow(commit, index)}</Fragment>
            ))}
          </TreeRowHover>
        )}
      </div>
    </div>
  );
}
