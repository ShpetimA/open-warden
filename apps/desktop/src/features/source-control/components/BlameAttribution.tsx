import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef, useState, type ReactNode } from "react";

import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { BLAME_LINE_HEIGHT, isWorkingTreeCommit, type BlameGroup } from "../blameGroups";

export function BlameAttribution({
  groups,
  selectedGroup,
  onSelectGroup,
  renderCommitDetails,
}: {
  groups: readonly BlameGroup[];
  selectedGroup: BlameGroup | null;
  onSelectGroup: (group: BlameGroup | null) => void;
  renderCommitDetails: (group: BlameGroup) => ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: groups.length,
    getScrollElement: () =>
      containerRef.current?.closest<HTMLElement>(".file-viewer-scroll") ?? null,
    estimateSize: (index) => {
      const group = groups[index];
      return group ? (group.endLine - group.line + 1) * BLAME_LINE_HEIGHT : BLAME_LINE_HEIGHT;
    },
    getItemKey: (index) => {
      const group = groups[index];
      return group ? `${group.commitId}:${group.line}:${group.endLine}` : index;
    },
    overscan: 4,
  });

  return (
    <div ref={containerRef} className="relative" style={{ height: virtualizer.getTotalSize() }}>
      {virtualizer.getVirtualItems().map((row) => {
        const group = groups[row.index];
        if (!group) return null;

        return (
          <BlameGroupTrigger
            key={row.key}
            group={group}
            top={row.start}
            height={row.size}
            open={selectedGroup?.line === group.line && selectedGroup.commitId === group.commitId}
            onOpenChange={(open) => onSelectGroup(open ? group : null)}
            renderCommitDetails={renderCommitDetails}
          />
        );
      })}
    </div>
  );
}

function BlameGroupTrigger({
  group,
  top,
  height,
  open,
  onOpenChange,
  renderCommitDetails,
}: {
  group: BlameGroup;
  top: number;
  height: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  renderCommitDetails: (group: BlameGroup) => ReactNode;
}) {
  const rangeRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<
    { side: "top" } | { side: "left"; gutterWidth: number; width: number }
  >({ side: "top" });

  function changeOpen(nextOpen: boolean) {
    const bounds = rangeRef.current?.getBoundingClientRect();

    if (nextOpen && bounds) {
      const availableAbove = bounds.top - 12;
      const availableBelow = window.innerHeight - bounds.bottom - 12;

      setPlacement(
        Math.max(availableAbove, availableBelow) >= 240
          ? { side: "top" }
          : { side: "left", gutterWidth: bounds.width, width: Math.min(360, bounds.right - 12) },
      );
    }

    onOpenChange(nextOpen);
  }

  const workingTree = isWorkingTreeCommit(group.commitId);
  const author = workingTree ? "Working tree" : group.author || "Unknown author";
  const summary = workingTree ? "Uncommitted changes" : group.summary || "Untitled commit";
  const multipleLines = group.endLine > group.line;
  const range = multipleLines ? `Lines ${group.line}–${group.endLine}` : `Line ${group.line}`;

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverAnchor asChild>
        <div
          ref={rangeRef}
          data-blame-start={group.line}
          data-blame-end={group.endLine}
          className="absolute inset-x-0 border-t first:border-t-0"
          style={{ top, height }}
        >
          <div className="sticky top-0">
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={`${range}: ${author} · ${summary}`}
                className="bg-surface-toolbar hover:bg-surface-active data-[state=open]:bg-surface-active focus-visible:ring-ring relative block w-full min-w-0 px-2 text-left text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset"
                style={{ height: multipleLines ? BLAME_LINE_HEIGHT * 2 : BLAME_LINE_HEIGHT }}
              >
                <span className="flex h-5 min-w-0 items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-medium">{author}</span>
                  {!workingTree ? (
                    <code className="text-muted-foreground shrink-0 text-[10px]">
                      {group.commitId.slice(0, 8)}
                    </code>
                  ) : null}
                </span>
                {multipleLines ? (
                  <span className="text-muted-foreground block h-5 truncate leading-5">
                    {summary}
                  </span>
                ) : null}
              </button>
            </PopoverTrigger>
          </div>
        </div>
      </PopoverAnchor>
      <PopoverContent
        aria-label="Blame commit details"
        side={placement.side}
        sideOffset={placement.side === "left" ? -placement.gutterWidth : 8}
        style={placement.side === "left" ? { width: placement.width } : undefined}
        align="start"
        collisionPadding={12}
        className="bg-surface-elevated flex max-h-[min(440px,var(--radix-popover-content-available-height))] w-[360px] max-w-[calc(100vw-24px)] flex-col overflow-hidden p-3 text-xs data-[state=open]:animate-none data-[state=closed]:animate-none"
      >
        <p className="text-muted-foreground mb-1 text-[11px] tabular-nums">{range}</p>
        {workingTree ? (
          <>
            <p className="font-medium">Uncommitted changes</p>
            <p className="text-muted-foreground mt-1">These lines have not been committed yet.</p>
          </>
        ) : (
          renderCommitDetails(group)
        )}
      </PopoverContent>
    </Popover>
  );
}
