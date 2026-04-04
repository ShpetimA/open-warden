import { useEffect, useRef, type RefObject } from "react";

type UseDiffLineFocusOptions = {
  containerRef: RefObject<HTMLElement | null>;
  lineNumber: number | null;
  lineIndex?: string | null;
  focusKey?: number | string | null;
  enabled?: boolean;
};

const MAX_FOCUS_ATTEMPTS = 24;
const FOCUS_PULSE_DURATION_MS = 1800;

export const DIFF_LINE_FOCUS_CSS = `
[data-line][data-app-line-focus='true'] {
  position: relative;
  background: color-mix(in srgb, #f4c95d 18%, var(--diffs-bg));
  box-shadow:
    inset 3px 0 0 color-mix(in srgb, #f4c95d 72%, var(--diffs-fg)),
    inset 0 0 0 1px color-mix(in srgb, #f4c95d 24%, transparent);
  animation: app-line-focus-pulse 1.7s ease-out;
}

@keyframes app-line-focus-pulse {
  0% {
    background: color-mix(in srgb, #f4c95d 36%, var(--diffs-bg));
  }

  100% {
    background: color-mix(in srgb, #f4c95d 18%, var(--diffs-bg));
  }
}
`;

function queryShadowLine(host: HTMLElement, lineNumber: number, lineIndex?: string | null) {
  if (lineIndex) {
    const indexedLine = host.shadowRoot?.querySelector<HTMLElement>(
      `[data-line][data-line-index="${lineIndex}"]`,
    );
    if (indexedLine) {
      return indexedLine;
    }
  }

  return host.shadowRoot?.querySelector<HTMLElement>(`[data-line="${lineNumber}"]`) ?? null;
}

function findDiffHost(
  container: HTMLElement,
  lineNumber: number,
  lineIndex?: string | null,
): HTMLElement | null {
  const directLine = queryShadowLine(container, lineNumber, lineIndex);
  if (directLine) {
    return container;
  }

  for (const element of container.querySelectorAll<HTMLElement>("*")) {
    if (queryShadowLine(element, lineNumber, lineIndex)) {
      return element;
    }
  }

  return null;
}

export function findRenderedDiffLine(
  container: HTMLElement,
  lineNumber: number,
  lineIndex?: string | null,
) {
  const host = findDiffHost(container, lineNumber, lineIndex);
  return host ? queryShadowLine(host, lineNumber, lineIndex) : null;
}

export function getRenderedLineOffset(
  container: HTMLElement,
  lineNumber: number,
  lineIndex?: string | null,
) {
  const line = findRenderedDiffLine(container, lineNumber, lineIndex);
  if (!line) {
    return null;
  }

  const containerRect = container.getBoundingClientRect();
  const lineRect = line.getBoundingClientRect();
  return {
    line,
    top: lineRect.top - containerRect.top + container.scrollTop,
    bottom: lineRect.bottom - containerRect.top + container.scrollTop,
    height: lineRect.height,
  };
}

export function useDiffLineFocus({
  containerRef,
  lineNumber,
  lineIndex = null,
  focusKey = null,
  enabled = true,
}: UseDiffLineFocusOptions) {
  const focusedLineRef = useRef<HTMLElement | null>(null);
  const focusedLineTimerRef = useRef<number | null>(null);
  const focusFrameRef = useRef<number | null>(null);

  function clearFocusedLine() {
    if (focusFrameRef.current !== null) {
      cancelAnimationFrame(focusFrameRef.current);
      focusFrameRef.current = null;
    }

    if (focusedLineTimerRef.current !== null) {
      window.clearTimeout(focusedLineTimerRef.current);
      focusedLineTimerRef.current = null;
    }

    if (focusedLineRef.current) {
      focusedLineRef.current.removeAttribute("data-app-line-focus");
      focusedLineRef.current = null;
    }
  }

  useEffect(() => {
    return () => {
      clearFocusedLine();
    };
  }, []);

  useEffect(() => {
    if (!enabled || !lineNumber) {
      clearFocusedLine();
      return;
    }

    let attemptCount = 0;
    let cancelled = false;

    clearFocusedLine();

    const focusLine = () => {
      if (cancelled) {
        return;
      }

      const container = containerRef.current;
      if (!container) {
        return;
      }

      const lineNode = findRenderedDiffLine(container, lineNumber, lineIndex);
      if (!lineNode) {
        if (attemptCount < MAX_FOCUS_ATTEMPTS) {
          attemptCount += 1;
          focusFrameRef.current = requestAnimationFrame(focusLine);
        }
        return;
      }

      lineNode.scrollIntoView({
        block: "center",
        inline: "nearest",
      });

      if (focusKey === null || focusKey === undefined) {
        return;
      }

      lineNode.setAttribute("data-app-line-focus", "true");
      focusedLineRef.current = lineNode;
      focusedLineTimerRef.current = window.setTimeout(() => {
        if (focusedLineRef.current === lineNode) {
          lineNode.removeAttribute("data-app-line-focus");
          focusedLineRef.current = null;
        }
        focusedLineTimerRef.current = null;
      }, FOCUS_PULSE_DURATION_MS);
    };

    focusFrameRef.current = requestAnimationFrame(focusLine);

    return () => {
      cancelled = true;
      if (focusFrameRef.current !== null) {
        cancelAnimationFrame(focusFrameRef.current);
        focusFrameRef.current = null;
      }
    };
  }, [containerRef, enabled, focusKey, lineIndex, lineNumber]);
}
