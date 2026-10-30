import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";

import { VIRTUAL_NAVIGATION_EVENT, virtualNavigationSchema } from "@/lib/keyboard-navigation";
import type { HistoryCommit } from "../types";
import { COMMIT_ROW_HEIGHT } from "@/components/ui/commit-row";

export function VirtualCommitRows({
  commits,
  scrollElement,
  renderRow,
  initialIndex = 0,
}: {
  initialIndex?: number;
  commits: readonly HistoryCommit[];
  scrollElement: HTMLDivElement | null;
  renderRow: (commit: HistoryCommit, index: number) => ReactNode;
}) {
  const pendingFocus = useRef<number | null>(null);
  const revealedIndex = useRef(-1);
  const virtualizer = useVirtualizer({
    count: commits.length,
    getScrollElement: () => scrollElement,
    estimateSize: () => COMMIT_ROW_HEIGHT,
    getItemKey: (index) => commits[index]?.commitId ?? index,
    overscan: 8,
  });
  const rows = virtualizer.getVirtualItems();
  const viewportHeight = virtualizer.scrollRect?.height ?? 0;

  useLayoutEffect(() => {
    if (!viewportHeight || initialIndex < 0 || revealedIndex.current === initialIndex) return;
    revealedIndex.current = initialIndex;
    virtualizer.scrollToIndex(initialIndex, { align: "auto" });
  }, [initialIndex, viewportHeight, virtualizer]);

  useEffect(() => {
    const element = scrollElement;
    if (!element) return;
    function navigate(event: Event) {
      if (!(event instanceof CustomEvent)) return;
      const request = virtualNavigationSchema.safeParse(event.detail);
      if (!request.success || request.data.index >= commits.length) return;
      pendingFocus.current = request.data.focus ? request.data.index : null;
      virtualizer.scrollToIndex(request.data.index, { align: "auto" });
    }
    element.addEventListener(VIRTUAL_NAVIGATION_EVENT, navigate);
    return () => element.removeEventListener(VIRTUAL_NAVIGATION_EVENT, navigate);
  }, [commits.length, scrollElement, virtualizer]);

  useLayoutEffect(() => {
    const index = pendingFocus.current;
    if (index === null) return;
    const target = scrollElement?.querySelector<HTMLElement>(`[data-nav-index="${index}"]`);
    if (target) {
      target.focus({ preventScroll: true });
      pendingFocus.current = null;
    }
  }, [rows, scrollElement]);

  return (
    <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
      {rows.map((row) => {
        const commit = commits[row.index];
        if (!commit) return null;
        return (
          <div
            key={commit.commitId}
            data-index={row.index}
            className="absolute left-0 top-0 w-full"
            style={{ transform: `translateY(${row.start}px)` }}
          >
            {renderRow(commit, row.index)}
          </div>
        );
      })}
    </div>
  );
}
