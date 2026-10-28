import { skipToken } from "@reduxjs/toolkit/query";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowRight, GitMerge, RefreshCw, Users, X } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";

import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { Button } from "@/components/ui/button";
import { ErrorState, ErrorNotice } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { ListLoadingState } from "@/components/ui/list-loading-state";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { selectHistoryPullRequestCommit } from "../actions";
import { useGetHistoryGraphQuery } from "../api";
import { graphRefLabel, type GraphRow, type HistoryGraphViewData } from "../historyGraph";
import { isTypingTarget } from "../utils";

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
        data={data}
        initialCommitId={searchParams.get("commit") ?? lastCommitId}
        busy={isFetching}
        onRefresh={() => {
          void refetch();
        }}
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

const ROW_HEIGHT = 40;
const HEADER_HEIGHT = 28;
const color = (index: number) => `var(--chart-${(index % 5) + 1})`;
const x = (column: number) => 16 + column * 16;

function ancestryLabel(parentCount: number, shallow: boolean) {
  if (parentCount > 1) return `Merge · ${parentCount} parents`;
  if (parentCount === 0) return shallow ? "Root or shallow boundary" : "Root commit";
  return "1 parent";
}

function GraphMark({ row, width, filtered }: { row: GraphRow; width: number; filtered: boolean }) {
  const column = filtered ? 0 : row.column;
  return (
    <svg
      data-history-graph-mark
      aria-hidden="true"
      width={width}
      height={ROW_HEIGHT}
      className="shrink-0 overflow-visible"
    >
      {!filtered
        ? row.edges.map((edge) => {
            const from = x(edge.column);
            const to = x(edge.target);
            const path =
              edge.part === "through"
                ? `M${from} 0V40`
                : edge.part === "incoming"
                  ? `M${from} 0V20`
                  : `M${from} 20C${from} 32 ${to} 28 ${to} 40`;
            return (
              <path
                key={`${edge.part}:${edge.column}:${edge.target}`}
                d={path}
                fill="none"
                stroke={color(edge.color)}
                strokeWidth={1.5}
              />
            );
          })
        : null}
      <circle
        cx={x(column)}
        cy={20}
        r={row.commit.parents.length > 1 ? 5 : 3.5}
        fill="var(--background)"
        stroke={color(row.color)}
        strokeWidth={2}
      />
      {row.commit.parents.length > 1 ? (
        <circle cx={x(column)} cy={20} r={1.5} fill={color(row.color)} />
      ) : null}
    </svg>
  );
}

export function HistoryGraphView({
  data,
  onOpen,
  onRefresh,
  busy = false,
  initialCommitId,
}: {
  data: HistoryGraphViewData;
  onOpen: (commitId: string) => void;
  onRefresh: () => void;
  busy?: boolean;
  initialCommitId?: string;
}) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(
    initialCommitId || data.rows[0]?.commit.commitId || "",
  );
  const filterRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<number | null>(null);
  const revealed = useRef(false);
  const filter = query.trim().toLowerCase();
  const rows = filter
    ? data.rows.filter((row) =>
        [
          row.commit.summary,
          row.commit.author,
          row.commit.authorEmail,
          row.commit.commitId,
          ...row.commit.refs.map(graphRefLabel),
        ].some((value) => value.toLowerCase().includes(filter)),
      )
    : data.rows;
  const selected = rows.find((row) => row.commit.commitId === selectedId) ?? rows[0];
  const graphWidth = filter ? 40 : data.width;
  const columns = `${graphWidth}px minmax(240px, 1fr) 150px 110px 90px`;
  const minimumWidth = graphWidth + 630;
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
    scrollMargin: HEADER_HEIGHT,
    getItemKey: (index) => rows[index]?.commit.commitId ?? index,
  });
  const visible = virtualizer.getVirtualItems();
  const viewportHeight = virtualizer.scrollRect?.height ?? 0;

  useLayoutEffect(() => {
    if (!viewportHeight || revealed.current) return;
    revealed.current = true;
    const index = rows.findIndex((row) => row.commit.commitId === selectedId);
    if (index >= 0) virtualizer.scrollToIndex(index, { align: "auto" });
  }, [rows, selectedId, viewportHeight, virtualizer]);

  useLayoutEffect(() => {
    const index = pendingFocus.current;
    if (index === null) return;
    const element = scrollRef.current?.querySelector<HTMLElement>(`[data-graph-index="${index}"]`);
    if (element) {
      element.focus({ preventScroll: true });
      pendingFocus.current = null;
    }
  }, [visible]);

  function ignoresKeys(event: KeyboardEvent) {
    return (
      isTypingTarget(event.target) ||
      (event.target instanceof Element &&
        Boolean(
          event.target.closest('[role="dialog"], [role="menu"], [data-slot="popover-content"]'),
        ))
    );
  }
  function move(event: KeyboardEvent, direction: number) {
    if (ignoresKeys(event) || !rows.length) return;
    event.preventDefault();
    const current = rows.findIndex((row) => row.commit.commitId === selected?.commit.commitId);
    const index = Math.max(0, Math.min(rows.length - 1, current + direction));
    const row = rows[index];
    if (!row) return;
    setSelectedId(row.commit.commitId);
    pendingFocus.current = index;
    virtualizer.scrollToIndex(index, { align: "auto" });
    scrollRef.current
      ?.querySelector<HTMLElement>(`[data-graph-index="${index}"]`)
      ?.focus({ preventScroll: true });
  }
  const hotkeyOptions = {
    ignoreInputs: false,
    preventDefault: false,
    stopPropagation: false,
  } as const;
  useHotkey("J", (event) => move(event, 1), hotkeyOptions);
  useHotkey("ArrowDown", (event) => move(event, 1), hotkeyOptions);
  useHotkey("K", (event) => move(event, -1), hotkeyOptions);
  useHotkey("ArrowUp", (event) => move(event, -1), hotkeyOptions);
  useHotkey(
    "/",
    (event) => {
      if (ignoresKeys(event)) return;
      event.preventDefault();
      filterRef.current?.focus();
    },
    hotkeyOptions,
  );

  return (
    <section
      aria-label="Repository history graph"
      className="bg-background flex min-h-0 min-w-0 flex-1 flex-col"
    >
      <header className="flex flex-wrap items-center gap-3 border-b px-3 py-2">
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
          placeholder="Message, author, hash or ref…"
          value={query}
          className="h-7 w-64 text-xs"
          onChange={(event) => {
            setQuery(event.target.value);
            virtualizer.scrollToOffset(0);
          }}
        />
        <Popover>
          <PopoverTrigger asChild>
            <Button size="xs" variant="outline">
              <Users />
              Contributors
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0">
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
                  className="hover:bg-accent focus-visible:bg-accent flex w-full items-center gap-3 border-b px-3 py-2 text-left text-xs outline-none"
                  onClick={() => {
                    setQuery(contributor.email || contributor.name);
                    virtualizer.scrollToOffset(0);
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
      {filter ? (
        <div className="text-muted-foreground flex items-center gap-2 border-b px-3 py-1 text-[11px]">
          <span>{rows.length.toLocaleString()} matches · connections hidden while filtering</span>
          <Button size="xs" variant="ghost" onClick={() => setQuery("")}>
            <X />
            Clear
          </Button>
        </div>
      ) : null}
      <div ref={scrollRef} data-workspace-scroll className="min-h-0 flex-1 overflow-auto">
        <div
          className="bg-surface-toolbar text-muted-foreground sticky top-0 z-10 grid h-7 items-center border-b text-[11px]"
          style={{ gridTemplateColumns: columns, minWidth: minimumWidth }}
        >
          <span />
          <span>Commit / refs</span>
          <span>Author</span>
          <span>Authored</span>
          <span>Commit</span>
        </div>
        {rows.length ? (
          <div
            role="list"
            aria-label="Commit ancestry"
            className="relative"
            style={{ height: virtualizer.getTotalSize(), minWidth: minimumWidth }}
          >
            {visible.map((item) => {
              const row = rows[item.index];
              if (!row) return null;
              const commit = row.commit;
              return (
                <div
                  role="listitem"
                  key={commit.commitId}
                  className="absolute left-0 top-0 w-full"
                  style={{
                    height: ROW_HEIGHT,
                    transform: `translateY(${item.start - HEADER_HEIGHT}px)`,
                  }}
                >
                  <button
                    type="button"
                    data-graph-index={item.index}
                    aria-pressed={selected?.commit.commitId === commit.commitId}
                    title={commit.summary}
                    aria-label={`${commit.parents.length > 1 ? "Merge: " : ""}${commit.summary} ${commit.shortId} ${commit.author}`}
                    className="border-border/40 hover:bg-accent focus-visible:ring-ring/50 grid h-10 w-full items-center border-b text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-inset aria-pressed:bg-surface-active"
                    style={{ gridTemplateColumns: columns }}
                    onClick={() => setSelectedId(commit.commitId)}
                    onDoubleClick={() => onOpen(commit.commitId)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        onOpen(commit.commitId);
                      }
                    }}
                  >
                    <GraphMark row={row} width={graphWidth} filtered={Boolean(filter)} />
                    <span className="flex min-w-0 items-center gap-2 pr-3">
                      {commit.parents.length > 1 ? (
                        <GitMerge
                          aria-hidden="true"
                          className="text-muted-foreground size-3 shrink-0"
                        />
                      ) : null}
                      <span className="truncate font-medium">
                        {commit.summary || "(no commit message)"}
                      </span>
                      {commit.refs.slice(0, 2).map((ref) => (
                        <span
                          key={ref}
                          title={ref}
                          className="bg-surface-toolbar max-w-48 shrink-0 truncate rounded border px-1 py-0.5 text-[10px]"
                        >
                          {graphRefLabel(ref)}
                        </span>
                      ))}
                      {commit.refs.length > 2 ? (
                        <span
                          title={commit.refs.map(graphRefLabel).join(", ")}
                          className="text-muted-foreground shrink-0 text-[10px]"
                        >
                          +{commit.refs.length - 2}
                        </span>
                      ) : null}
                    </span>
                    <span
                      className="text-muted-foreground truncate pr-3"
                      title={`${commit.author} <${commit.authorEmail}>`}
                    >
                      {commit.author}
                    </span>
                    <span
                      className="text-muted-foreground truncate text-[11px]"
                      title={commit.authoredAt}
                    >
                      {commit.relativeTime}
                    </span>
                    <span className="text-muted-foreground font-mono text-[11px]">
                      {commit.shortId}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-muted-foreground p-6 text-center text-sm">
            {filter ? "No commits match this filter." : "No commits in this repository yet."}
          </p>
        )}
      </div>
      <footer className="flex min-h-10 items-center gap-3 border-t px-3 py-1.5 text-[11px]">
        <span className="text-muted-foreground min-w-0 flex-1 truncate">
          {selected
            ? `${selected.commit.shortId} · ${ancestryLabel(selected.commit.parents.length, data.shallow)} · ${selected.commit.summary}`
            : "Select a commit"}
        </span>
        <span className="text-muted-foreground hidden shrink-0 sm:inline">
          J/K to move · Enter to open
        </span>
        <Button
          size="xs"
          variant="outline"
          disabled={!selected}
          onClick={() => {
            if (selected) onOpen(selected.commit.commitId);
          }}
        >
          Open changes
          <ArrowRight />
        </Button>
      </footer>
    </section>
  );
}
