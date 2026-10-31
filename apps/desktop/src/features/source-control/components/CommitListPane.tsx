import { ErrorState, ErrorNotice } from "@/components/ui/error-state";
import { Fragment, useState, type ReactNode } from "react";

import { Input } from "@/components/ui/input";
import { COMMIT_ROW_HEIGHT } from "@/components/ui/commit-row";
import type { HistoryCommit } from "@/features/source-control/types";
import { TreeRowHover } from "./TreeRowHover";
import { VirtualCommitRows } from "./VirtualCommitRows";
import { useCommitListScrollAnchor } from "./useCommitListScrollAnchor";

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
  error?: unknown;
  lastUpdated?: number;
  virtualize?: boolean;
  initialIndex?: number;
  onRetry?: () => void;
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
  lastUpdated,
  virtualize = false,
  initialIndex = 0,
  onRetry,
  emptyMessage,
  notice,
  renderRow,
  renderHoverContent,
}: CommitListPaneProps) {
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null);
  useCommitListScrollAnchor({
    commits,
    scroller: scrollElement,
    filter,
    initialCommitId: virtualize ? commits[initialIndex]?.commitId : undefined,
  });
  return (
    <div
      data-slot="commit-list-pane"
      className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
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
      {error && totalCount > 0 ? (
        <div className="absolute inset-x-2 bottom-2 z-20 max-h-[50%] overflow-y-auto rounded-md border bg-surface-elevated shadow-md">
          <ErrorNotice
            lastUpdated={lastUpdated}
            title="Couldn’t refresh commits"
            error={error}
            busy={loading}
            recovery={onRetry ? { label: "Retry", onAction: onRetry } : undefined}
          />
        </div>
      ) : null}
      <div className="absolute inset-x-2 bottom-2 z-10 overflow-hidden rounded-md border bg-surface-toolbar shadow-md empty:hidden">
        {notice}
      </div>
      <div
        ref={setScrollElement}
        className="min-h-0 flex-1 overflow-y-auto [overflow-anchor:none]"
        data-nav-region={navRegion}
      >
        {loading && !error && totalCount === 0 ? (
          <div role="status" aria-label="Loading commits…">
            <span className="sr-only">Loading commits…</span>
            {Array.from({ length: 8 }, (_, index) => (
              <div
                key={index}
                aria-hidden="true"
                style={{ height: COMMIT_ROW_HEIGHT }}
                className="flex flex-col justify-center gap-2 px-3 motion-safe:animate-pulse"
              >
                <span className="bg-border h-2.5 w-3/4 rounded-sm" />
                <span className="bg-border h-2 w-1/2 rounded-sm" />
              </div>
            ))}
          </div>
        ) : error && totalCount === 0 ? (
          <ErrorState
            title="Couldn’t load commits"
            error={error}
            busy={loading}
            recovery={onRetry ? { label: "Retry", onAction: onRetry } : undefined}
          />
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
            {virtualize && commits.length > 100 ? (
              <VirtualCommitRows
                commits={commits}
                scrollElement={scrollElement}
                renderRow={renderRow}
                initialIndex={initialIndex}
              />
            ) : (
              commits.map((commit, index) => (
                <Fragment key={commit.commitId}>{renderRow(commit, index)}</Fragment>
              ))
            )}
          </TreeRowHover>
        )}
      </div>
    </div>
  );
}
