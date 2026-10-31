import { useLayoutEffect, useRef, useState } from "react";
import type { TimelineEntry } from "./types";

type ReadingAnchor = { element: HTMLElement; offset: number };

export function useTimelineScrollAnchor(revision: readonly TimelineEntry[]) {
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const anchor = useRef<ReadingAnchor | null>(null);

  useLayoutEffect(() => {
    const scroller = root?.closest<HTMLElement>("[data-workspace-scroll]");
    if (!root || !scroller) return;

    function capture() {
      if (!root || !scroller) return;
      const viewport = scroller.getBoundingClientRect();
      const focused = document.activeElement?.closest<HTMLElement>("[data-timeline-anchor]");
      const visible = Array.from(root.querySelectorAll<HTMLElement>("[data-timeline-anchor]"));
      const focusedBounds = focused?.getBoundingClientRect();
      const focusedVisible =
        focusedBounds && focusedBounds.bottom > viewport.top && focusedBounds.top < viewport.bottom;
      const element =
        focused && root.contains(focused) && focusedVisible
          ? focused
          : visible.find((item) => {
              const bounds = item.getBoundingClientRect();
              return bounds.bottom > viewport.top && bounds.top < viewport.bottom;
            });
      anchor.current = element
        ? { element, offset: element.getBoundingClientRect().top - viewport.top }
        : null;
    }

    function restore() {
      if (!root || !scroller) return;
      const saved = anchor.current;
      if (saved && root?.contains(saved.element)) {
        const currentOffset =
          saved.element.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
        scroller.scrollTop += currentOffset - saved.offset;
      }
      capture();
    }

    restore();
    const observer = new ResizeObserver(restore);
    observer.observe(root);
    scroller.addEventListener("scroll", capture, { passive: true });
    root.addEventListener("focusin", capture);
    return () => {
      observer.disconnect();
      scroller.removeEventListener("scroll", capture);
      root.removeEventListener("focusin", capture);
    };
  }, [root, revision]);

  return setRoot;
}
