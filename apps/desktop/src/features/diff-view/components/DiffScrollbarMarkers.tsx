import { useCallback, type PointerEvent, type RefObject } from "react";
import type { FileDiffMetadata } from "@pierre/diffs";

type DiffStyle = "unified" | "split";

export type DiffScrollbarMarker = {
  key: string;
  type: "addition" | "deletion";
  top: number;
  height: number;
};

export type MultiDiffScrollbarEntry = {
  id: string;
  fileDiff: FileDiffMetadata;
};

function clampPercent(value: number) {
  return Math.min(100, Math.max(0, value));
}

export function getDiffTotalLines(fileDiff: FileDiffMetadata, diffStyle: DiffStyle) {
  return diffStyle === "split" ? fileDiff.splitLineCount : fileDiff.unifiedLineCount;
}

export function buildDiffScrollbarMarkers(
  fileDiff: FileDiffMetadata,
  diffStyle: DiffStyle,
): DiffScrollbarMarker[] {
  const totalLines = getDiffTotalLines(fileDiff, diffStyle);
  if (totalLines <= 0) return [];

  const markers: DiffScrollbarMarker[] = [];

  fileDiff.hunks.forEach((hunk, hunkIndex) => {
    let splitOffset = 0;
    let unifiedOffset = 0;

    hunk.hunkContent.forEach((content, contentIndex) => {
      if (content.type === "context") {
        splitOffset += content.lines;
        unifiedOffset += content.lines;
        return;
      }

      const splitStart = hunk.splitLineStart + splitOffset;
      const unifiedStart = hunk.unifiedLineStart + unifiedOffset;
      const splitRows = Math.max(content.additions, content.deletions);

      if (content.deletions > 0) {
        const start = diffStyle === "split" ? splitStart : unifiedStart;
        const rows = diffStyle === "split" ? splitRows : content.deletions;
        markers.push({
          key: `${hunkIndex}-${contentIndex}-deletions`,
          type: "deletion",
          top: clampPercent((start / totalLines) * 100),
          height: clampPercent((Math.max(1, rows) / totalLines) * 100),
        });
      }

      if (content.additions > 0) {
        const start = diffStyle === "split" ? splitStart : unifiedStart + content.deletions;
        const rows = diffStyle === "split" ? splitRows : content.additions;
        markers.push({
          key: `${hunkIndex}-${contentIndex}-additions`,
          type: "addition",
          top: clampPercent((start / totalLines) * 100),
          height: clampPercent((Math.max(1, rows) / totalLines) * 100),
        });
      }

      splitOffset += splitRows;
      unifiedOffset += content.deletions + content.additions;
    });
  });

  return markers;
}

export function buildMultiDiffScrollbarMarkers(
  entries: readonly MultiDiffScrollbarEntry[],
  diffStyle: DiffStyle,
): DiffScrollbarMarker[] {
  const lineCounts = entries.map((entry) =>
    Math.max(1, getDiffTotalLines(entry.fileDiff, diffStyle)),
  );
  const totalLines = lineCounts.reduce((sum, lineCount) => sum + lineCount, 0);
  if (totalLines <= 0) return [];

  let lineOffset = 0;
  const markers: DiffScrollbarMarker[] = [];

  entries.forEach((entry, entryIndex) => {
    const fileLineCount = lineCounts[entryIndex] ?? 1;
    const fileMarkers = buildDiffScrollbarMarkers(entry.fileDiff, diffStyle);

    for (const marker of fileMarkers) {
      const markerLineTop = lineOffset + (marker.top / 100) * fileLineCount;
      const markerLineHeight = (marker.height / 100) * fileLineCount;
      markers.push({
        ...marker,
        key: `${entry.id}:${marker.key}`,
        top: clampPercent((markerLineTop / totalLines) * 100),
        height: clampPercent((Math.max(1, markerLineHeight) / totalLines) * 100),
      });
    }

    lineOffset += fileLineCount;
  });

  return markers;
}

export function DiffScrollbarMarkers({
  markers,
  viewportRef,
}: {
  markers: DiffScrollbarMarker[];
  viewportRef: RefObject<HTMLElement | null>;
}) {
  const scrollToPercent = useCallback(
    (percent: number) => {
      const viewportElement = viewportRef.current;
      const scrollElement = viewportElement?.matches(".diff-viewport-scroll")
        ? viewportElement
        : viewportElement?.querySelector<HTMLElement>(".diff-viewport-scroll");
      if (!scrollElement) return;

      const maxScrollTop = scrollElement.scrollHeight - scrollElement.clientHeight;
      scrollElement.scrollTop = maxScrollTop * (clampPercent(percent) / 100);
    },
    [viewportRef],
  );

  const handleTrackPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      if (rect.height <= 0) return;

      event.preventDefault();
      const percent = ((event.clientY - rect.top) / rect.height) * 100;
      scrollToPercent(percent);
    },
    [scrollToPercent],
  );

  if (markers.length === 0) return null;

  return (
    <div
      aria-label="Diff change markers"
      role="scrollbar"
      aria-orientation="vertical"
      className="absolute bottom-2 right-6 top-2 z-20 w-2 cursor-pointer bg-background/45 shadow-[0_0_0_1px_hsl(var(--border)/0.55)_inset] transition-[width,background-color] hover:w-3 hover:bg-background/70"
      onPointerDown={handleTrackPointerDown}
    >
      {markers.map((marker) => (
        <button
          key={marker.key}
          type="button"
          aria-label={marker.type === "addition" ? "Scroll to addition" : "Scroll to deletion"}
          className={`absolute left-0 w-full transition-[scale,opacity] cursor-pointer ${
            marker.type === "addition" ? "bg-emerald-500/40" : "bg-red-500/40"
          }`}
          style={{
            top: `${marker.top}%`,
            height: `max(3px, ${marker.height}%)`,
          }}
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            scrollToPercent(marker.top);
          }}
        />
      ))}
    </div>
  );
}
