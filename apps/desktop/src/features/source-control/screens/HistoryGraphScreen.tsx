import { skipToken } from "@reduxjs/toolkit/query";
import { RefreshCw, Users, X, ArrowUp, ArrowDown } from "lucide-react";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useStore } from "react-redux";
import { useSearchParams } from "react-router";

import { useAppDispatch, useAppSelector } from "@/app/hooks";
import type { RootState } from "@/app/store";
import { Button } from "@/components/ui/button";
import { ErrorState, ErrorNotice } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { ListLoadingState } from "@/components/ui/list-loading-state";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import type { HistoryGraphCommit } from "@/platform/desktop/history";
import { selectHistoryPullRequestCommit } from "../actions";
import { useGetHistoryGraphQuery } from "../api";
import type { HistoryGraphViewData } from "../historyGraph";
import { buildGraphNavigation } from "../historyGraphNavigation";
import { selectGraphCommit } from "../historyGraphUiSlice";
import { HistoryGraphCommitDetails } from "../components/HistoryGraphCommitDetails";
import { HistoryGraphRows } from "../components/HistoryGraphRows";
import { HistoryGraphInspector } from "../components/HistoryGraphInspector";

export function HistoryGraphScreen() {
  const dispatch = useAppDispatch();
  const repoPath = useAppSelector((state) => state.sourceControl.activeRepo);
  const lastCommitId = useAppSelector((state) => state.sourceControl.historyCommitId);
  const [searchParams, setSearchParams] = useSearchParams();
  const { data, error, isFetching, refetch, fulfilledTimeStamp } = useGetHistoryGraphQuery(
    repoPath || skipToken,
    {
      selectFromResult: ({ currentData, error, isFetching, fulfilledTimeStamp }) => ({
        data: currentData,
        error,
        isFetching,
        fulfilledTimeStamp,
      }),
    },
  );
  const recovery = {
    label: "Retry",
    onAction: () => {
      void refetch();
    },
  };

  if (!repoPath)
    return (
      <p className="text-muted-foreground p-6 text-sm">
        Open a repository to view its history graph.
      </p>
    );
  if (error && !data)
    return (
      <ErrorState
        title="Couldn’t load the history graph"
        error={error}
        busy={isFetching}
        recovery={recovery}
      />
    );
  if (!data) return <ListLoadingState label="Loading repository history…" />;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      {error ? (
        <ErrorNotice
          title="Couldn’t refresh the history graph"
          error={error}
          busy={isFetching}
          lastUpdated={fulfilledTimeStamp}
          recovery={recovery}
        />
      ) : null}
      <HistoryGraphView
        key={repoPath}
        data={data}
        initialCommitId={searchParams.get("commit") ?? lastCommitId}
        busy={isFetching}
        onRefresh={() => {
          void refetch();
        }}
        renderDetails={(commit) => <HistoryGraphCommitDetails commit={commit} />}
        onOpen={(commitId) => {
          void dispatch(selectHistoryPullRequestCommit(commitId));
          const next = new URLSearchParams(searchParams);
          next.delete("view");
          next.set("commit", commitId);
          setSearchParams(next);
        }}
      />
    </div>
  );
}

export function HistoryGraphView({
  data,
  onOpen,
  onRefresh,
  busy = false,
  initialCommitId,
  renderDetails,
}: {
  data: HistoryGraphViewData;
  onOpen: (commitId: string) => void;
  onRefresh: () => void;
  busy?: boolean;
  initialCommitId?: string;
  renderDetails?: (commit: HistoryGraphCommit) => ReactNode;
}) {
  const dispatch = useAppDispatch();
  const store = useStore<RootState>();
  const [query, setQuery] = useState("");
  const [author, setAuthor] = useState<{ name: string; email: string } | null>(null);
  const [contributorsOpen, setContributorsOpen] = useState(false);
  const filterRef = useRef<HTMLInputElement>(null);
  const moveRef = useRef<((direction: number) => void) | null>(null);
  const scrollToRef = useRef<((index: number) => void) | null>(null);
  const opened = useRef(false);
  const model = buildGraphNavigation(data, { query, author });
  const filtering = model.filtering;
  const matchingIndices = model.matchingIndices;

  useLayoutEffect(() => {
    const currentId = store.getState().historyGraphUi.commitId;
    const preferredId = opened.current ? currentId : initialCommitId;
    const row = data.rows.find((item) => item.commit.commitId === preferredId) ?? data.rows[0];
    opened.current = true;
    if (row)
      dispatch(
        selectGraphCommit({
          commitId: row.commit.commitId,
          column: row.column,
          totalLanes: model.totalLanes,
        }),
      );
  }, [data, model.totalLanes, initialCommitId, store, dispatch]);

  function applyFilter(text: string, identity = author) {
    setQuery(text);
    setAuthor(identity);
    const next = buildGraphNavigation(data, { query: text, author: identity });
    const index = next.matchingIndices[0];
    const row = index === undefined ? undefined : next.rows[index];
    if (row && index !== undefined) {
      dispatch(
        selectGraphCommit({
          commitId: row.commit.commitId,
          column: row.column,
          totalLanes: next.totalLanes,
        }),
      );
      scrollToRef.current?.(index);
    }
  }

  return (
    <section
      aria-label="Repository history graph"
      className="bg-background @container flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
    >
      <header className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <div className="mr-auto min-w-0">
          <div className="text-xs font-medium">All branches and tags</div>
          <p className="text-muted-foreground text-[11px] tabular-nums">
            {data.rows.length.toLocaleString()} commits ·{" "}
            {data.contributors.length.toLocaleString()} contributors · locally available history
          </p>
        </div>
        <Input
          ref={filterRef}
          aria-label="Filter graph commits"
          placeholder="Find message, author, hash or ref…"
          value={query}
          className="h-7 w-64 max-w-full text-xs"
          onChange={(event) => applyFilter(event.target.value)}
        />
        <Popover open={contributorsOpen} onOpenChange={setContributorsOpen}>
          <PopoverTrigger asChild>
            <Button size="xs" variant="outline" className="max-w-48" aria-pressed={Boolean(author)}>
              <Users />
              <span className="truncate">{author?.name ?? "Contributors"}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] p-0">
            <div className="border-b p-3">
              <h2 className="text-xs font-semibold">Contributions by commit count</h2>
              <p className="text-muted-foreground mt-1 text-[11px]">
                All branches · includes merge commits · identities use Git mailmap
              </p>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {data.contributors.map((contributor) => (
                <button
                  key={contributor.email || contributor.name}
                  type="button"
                  className="hover:bg-accent focus-visible:bg-accent flex min-h-10 w-full items-center gap-3 border-b px-3 py-2 text-left text-xs outline-none"
                  onClick={() => {
                    applyFilter(query, contributor);
                    setContributorsOpen(false);
                  }}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{contributor.name}</span>
                    <span className="text-muted-foreground block truncate text-[11px]">
                      {contributor.email}
                    </span>
                  </span>
                  <span className="text-right tabular-nums">
                    <span className="block">{contributor.commits.toLocaleString()}</span>
                    <span className="text-muted-foreground text-[11px]">
                      {Math.round((contributor.commits / Math.max(1, data.rows.length)) * 100)}%
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label="Refresh history graph"
          disabled={busy}
          onClick={onRefresh}
        >
          {busy ? <Spinner /> : <RefreshCw />}
        </Button>
      </header>
      {data.shallow ? (
        <p
          role="status"
          className="bg-surface-toolbar border-b px-3 py-2 text-xs text-muted-foreground"
        >
          This is a shallow clone. Only history available in this clone is shown; fetch older
          history to see earlier commits.
        </p>
      ) : null}
      {filtering ? (
        <div className="text-muted-foreground flex flex-wrap items-center gap-2 border-b px-3 py-1 text-[11px]">
          <span aria-live="polite" className="mr-auto tabular-nums">
            {matchingIndices.length.toLocaleString()} matches · ancestry retained
          </span>
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label="Previous matching commit"
            disabled={!matchingIndices.length}
            onClick={() => moveRef.current?.(-1)}
          >
            <ArrowUp />
          </Button>
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label="Next matching commit"
            disabled={!matchingIndices.length}
            onClick={() => moveRef.current?.(1)}
          >
            <ArrowDown />
          </Button>
          <Button size="xs" variant="ghost" onClick={() => applyFilter("", null)}>
            <X />
            Clear
          </Button>
        </div>
      ) : null}
      <HistoryGraphRows
        model={model}
        filterRef={filterRef}
        moveRef={moveRef}
        scrollToRef={scrollToRef}
        onOpen={onOpen}
      />
      <HistoryGraphInspector
        model={model}
        shallow={data.shallow}
        onOpen={onOpen}
        renderDetails={renderDetails}
      />
    </section>
  );
}
