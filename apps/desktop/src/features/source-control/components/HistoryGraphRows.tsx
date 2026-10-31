import { useHotkey } from "@tanstack/react-hotkeys";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronLeft, ChevronRight, GitMerge } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import { useStore } from "react-redux";

import { useAppDispatch, useAppSelector } from "@/app/hooks";
import type { RootState } from "@/app/store";
import { Button } from "@/components/ui/button";
import { graphRefLabel, type GraphRow } from "../historyGraph";
import type { GraphNavigation } from "../historyGraphNavigation";
import { panGraphLanes, selectGraphCommit } from "../historyGraphUiSlice";
import {
  GRAPH_VISIBLE_LANES,
  GRAPH_VIEWPORT_WIDTH,
  graphLanePosition,
  visibleGraphEdges,
} from "../historyGraphViewport";
import { isTypingTarget } from "../utils";

const ROW_HEIGHT = 40;
const HEADER_HEIGHT = 28;
const color = (index: number) => `var(--chart-${(index % 5) + 1})`;

function ignoresKeys(event: KeyboardEvent) {
  return (
    isTypingTarget(event.target) ||
    (event.target instanceof Element &&
      Boolean(
        event.target.closest('[role="dialog"], [role="menu"], [data-slot="popover-content"]'),
      ))
  );
}

function GraphLaneControls({ totalLanes }: { totalLanes: number }) {
  const dispatch = useAppDispatch();
  const start = useAppSelector((state) => state.historyGraphUi.laneStart);
  return (
    <div
      className="flex shrink-0 items-center justify-between px-1"
      style={{ width: GRAPH_VIEWPORT_WIDTH }}
    >
      {totalLanes > GRAPH_VISIBLE_LANES ? (
        <>
          <Button
            size="icon-xs"
            variant="ghost"
            className="size-5"
            aria-label="Earlier graph lanes"
            disabled={!start}
            onClick={() => dispatch(panGraphLanes({ direction: -1, totalLanes }))}
          >
            <ChevronLeft />
          </Button>
          <span
            className="text-[10px] tabular-nums"
            title={`Graph lanes ${start + 1}–${Math.min(totalLanes, start + GRAPH_VISIBLE_LANES)} of ${totalLanes}. Other lanes continue outside this viewport.`}
          >
            {start + 1}–{Math.min(totalLanes, start + GRAPH_VISIBLE_LANES)} / {totalLanes}
          </span>
          <Button
            size="icon-xs"
            variant="ghost"
            className="size-5"
            aria-label="Later graph lanes"
            disabled={start + GRAPH_VISIBLE_LANES >= totalLanes}
            onClick={() => dispatch(panGraphLanes({ direction: 1, totalLanes }))}
          >
            <ChevronRight />
          </Button>
        </>
      ) : (
        <span className="pl-2">Graph</span>
      )}
    </div>
  );
}

function GraphMark({ row }: { row: GraphRow }) {
  const start = useAppSelector((state) => state.historyGraphUi.laneStart);
  const position = (column: number) => graphLanePosition(column, start);
  const nodeVisible = row.column >= start && row.column < start + GRAPH_VISIBLE_LANES;
  return (
    <svg
      data-history-graph-mark
      aria-hidden="true"
      width={GRAPH_VIEWPORT_WIDTH}
      height={ROW_HEIGHT}
      className="shrink-0 overflow-hidden"
    >
      {visibleGraphEdges(row, start).map((edge) => {
        const from = position(edge.column);
        const to = position(edge.target);
        const path =
          edge.part === "through"
            ? `M${from} 0C${from} 20 ${to} 20 ${to} 40`
            : edge.part === "incoming"
              ? `M${from} 0V20`
              : `M${from} 20C${from} 32 ${to} 28 ${to} 40`;
        return (
          <path
            key={`${edge.part}:${edge.column}:${edge.target}`}
            d={path}
            fill="none"
            stroke={color(edge.color)}
            strokeWidth={edge.part === "through" ? 1 : 1.5}
            strokeOpacity={edge.part === "through" ? 0.5 : 0.9}
          />
        );
      })}
      {nodeVisible ? (
        <>
          <circle
            cx={position(row.column)}
            cy={20}
            r={row.commit.parents.length > 1 ? 5 : 3.5}
            fill="var(--background)"
            stroke={color(row.color)}
            strokeWidth={2}
          />
          {row.commit.parents.length > 1 ? (
            <circle cx={position(row.column)} cy={20} r={1.5} fill={color(row.color)} />
          ) : null}
        </>
      ) : (
        <path
          d={row.column < start ? "M6 16L2 20L6 24" : "M122 16L126 20L122 24"}
          fill="none"
          stroke={color(row.color)}
          strokeWidth={1.5}
        />
      )}
    </svg>
  );
}

function GraphCommitButton({
  row,
  index,
  totalLanes,
  onOpen,
  children,
  matched,
}: {
  row: GraphRow;
  index: number;
  totalLanes: number;
  onOpen: (commitId: string) => void;
  children: ReactNode;
  matched: boolean;
}) {
  const dispatch = useAppDispatch();
  const active = useAppSelector((state) => state.historyGraphUi.commitId === row.commit.commitId);
  const commit = row.commit;
  return (
    <button
      type="button"
      data-graph-index={index}
      data-filter-match={matched}
      aria-pressed={active}
      aria-label={`${commit.parents.length > 1 ? "Merge: " : ""}${commit.summary} ${commit.shortId} ${commit.author}`}
      className="border-border/40 hover:bg-accent focus-visible:ring-ring/50 flex h-10 w-full min-w-0 items-center border-b pr-3 text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-inset aria-pressed:bg-surface-active"
      onClick={() =>
        dispatch(selectGraphCommit({ commitId: commit.commitId, column: row.column, totalLanes }))
      }
      onDoubleClick={() => onOpen(commit.commitId)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onOpen(commit.commitId);
        }
      }}
    >
      {children}
    </button>
  );
}

function GraphCommitContent({ row, muted }: { row: GraphRow; muted: boolean }) {
  const commit = row.commit;
  return (
    <>
      <GraphMark row={row} />
      <span className={`min-w-0 flex-1 py-1 pr-3 ${muted ? "text-muted-foreground" : ""}`}>
        <span className="flex min-w-0 items-center gap-1.5">
          {commit.parents.length > 1 ? (
            <GitMerge aria-hidden="true" className="text-muted-foreground size-3 shrink-0" />
          ) : null}
          <span className={muted ? "truncate" : "truncate font-medium"}>
            {commit.summary || "(no commit message)"}
          </span>
        </span>
        <span className="text-muted-foreground flex min-w-0 items-center gap-2 overflow-hidden text-[10px]">
          {commit.refs.length ? (
            <span className="max-w-[60%] truncate font-mono text-foreground/80">
              {commit.refs.map(graphRefLabel).join(" · ")}
            </span>
          ) : null}
          <span className="truncate @min-[850px]:hidden">{commit.author}</span>
          <span className="shrink-0 tabular-nums @min-[1000px]:hidden">{commit.relativeTime}</span>
          <span className="shrink-0 font-mono @min-[1150px]:hidden">{commit.shortId}</span>
        </span>
      </span>
      <span className="text-muted-foreground hidden w-32 shrink-0 truncate pr-3 @min-[850px]:block">
        {commit.author}
      </span>
      <span className="text-muted-foreground hidden w-24 shrink-0 truncate text-[11px] tabular-nums @min-[1000px]:block">
        {commit.relativeTime}
      </span>
      <span className="text-muted-foreground hidden w-24 shrink-0 truncate font-mono text-[11px] @min-[1150px]:block">
        {commit.shortId}
      </span>
    </>
  );
}

export function HistoryGraphRows({
  model,
  filterRef,
  moveRef,
  scrollToRef,
  onOpen,
}: {
  model: GraphNavigation;
  filterRef: RefObject<HTMLInputElement | null>;
  moveRef: RefObject<((direction: number) => void) | null>;
  scrollToRef: RefObject<((index: number) => void) | null>;
  onOpen: (commitId: string) => void;
}) {
  const dispatch = useAppDispatch();
  const store = useStore<RootState>();
  const scrollRef = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<number | null>(null);
  const revealed = useRef(false);
  const virtualizer = useVirtualizer({
    count: model.rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    getItemKey: (index) => model.rows[index]?.commit.commitId ?? index,
    overscan: 6,
    scrollMargin: HEADER_HEIGHT,
    scrollPaddingStart: HEADER_HEIGHT,
  });
  const visible = virtualizer.getVirtualItems();
  const viewportHeight = virtualizer.scrollRect?.height ?? 0;

  function reveal(index: number) {
    const offset = scrollRef.current?.scrollTop ?? 0;
    const top = HEADER_HEIGHT + index * ROW_HEIGHT;
    if (top < offset + HEADER_HEIGHT || top + ROW_HEIGHT > offset + viewportHeight) {
      virtualizer.scrollToIndex(index, { align: "auto" });
    }
  }
  function move(direction: number) {
    const selectedId = store.getState().historyGraphUi.commitId;
    const index = model.byId.get(selectedId)?.index;
    const position = index === undefined ? -1 : (model.matchPosition.get(index) ?? -1);
    const nextIndex =
      model.matchingIndices[
        Math.max(0, Math.min(model.matchingIndices.length - 1, position + direction))
      ];
    const row = nextIndex === undefined ? undefined : model.rows[nextIndex];
    if (!row || nextIndex === undefined) return;
    dispatch(
      selectGraphCommit({
        commitId: row.commit.commitId,
        column: row.column,
        totalLanes: model.totalLanes,
      }),
    );
    pendingFocus.current = nextIndex;
    reveal(nextIndex);
    const target = scrollRef.current?.querySelector<HTMLElement>(
      `[data-graph-index="${nextIndex}"]`,
    );
    if (target) {
      target.focus({ preventScroll: true });
      pendingFocus.current = null;
    }
  }
  useLayoutEffect(() => {
    moveRef.current = move;
    scrollToRef.current = (index) => virtualizer.scrollToIndex(index, { align: "center" });
    return () => {
      moveRef.current = null;
      scrollToRef.current = null;
    };
  });
  useEffect(() => {
    if (!viewportHeight || revealed.current) return;
    revealed.current = true;
    const index = model.byId.get(store.getState().historyGraphUi.commitId)?.index;
    if (index !== undefined) reveal(index);
  });
  useLayoutEffect(() => {
    const index = pendingFocus.current;
    if (index === null) return;
    const element = scrollRef.current?.querySelector<HTMLElement>(`[data-graph-index="${index}"]`);
    if (element) {
      element.focus({ preventScroll: true });
      pendingFocus.current = null;
    }
  }, [visible]);
  function navigate(event: KeyboardEvent, direction: number) {
    if (ignoresKeys(event)) return;
    event.preventDefault();
    move(direction);
  }
  const options = { ignoreInputs: false, preventDefault: false, stopPropagation: false } as const;
  useHotkey("J", (event) => navigate(event, 1), options);
  useHotkey("ArrowDown", (event) => navigate(event, 1), options);
  useHotkey("K", (event) => navigate(event, -1), options);
  useHotkey("ArrowUp", (event) => navigate(event, -1), options);
  useHotkey(
    "/",
    (event) => {
      if (!ignoresKeys(event)) {
        event.preventDefault();
        filterRef.current?.focus();
      }
    },
    options,
  );

  return (
    <div
      ref={scrollRef}
      data-workspace-scroll
      data-history-graph-scroll
      className="min-h-20 min-w-0 flex-1 overflow-x-hidden overflow-y-auto"
    >
      <div className="bg-surface-toolbar text-muted-foreground sticky top-0 z-10 flex h-7 items-center border-b pr-3 text-[11px]">
        <GraphLaneControls totalLanes={model.totalLanes} />
        <span className="min-w-0 flex-1">Commit / refs</span>
        <span className="hidden w-32 shrink-0 @min-[850px]:block">Author</span>
        <span className="hidden w-24 shrink-0 @min-[1000px]:block">Authored</span>
        <span className="hidden w-24 shrink-0 @min-[1150px]:block">Commit</span>
      </div>
      {model.rows.length ? (
        <div
          role="list"
          aria-label="Commit ancestry"
          className="relative min-w-0"
          style={{ height: virtualizer.getTotalSize() }}
        >
          {visible.map((item) => {
            const row = model.rows[item.index];
            if (!row) return null;
            const muted = !model.matchPosition.has(item.index);
            return (
              <div
                role="listitem"
                key={row.commit.commitId}
                data-filter-match={!muted}
                className="absolute left-0 top-0 w-full min-w-0"
                style={{
                  height: ROW_HEIGHT,
                  transform: `translateY(${item.start - HEADER_HEIGHT}px)`,
                }}
              >
                <GraphCommitButton
                  row={row}
                  index={item.index}
                  totalLanes={model.totalLanes}
                  onOpen={onOpen}
                  matched={!muted}
                >
                  <GraphCommitContent row={row} muted={muted} />
                </GraphCommitButton>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-muted-foreground p-6 text-center text-sm">
          No commits in this repository yet.
        </p>
      )}
    </div>
  );
}
