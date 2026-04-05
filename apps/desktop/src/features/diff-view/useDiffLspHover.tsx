import { useEffect, useRef, useState, type MutableRefObject } from "react";
import type { DiffTokenEventBaseProps } from "@pierre/diffs";

import { cn } from "@/lib/utils";
import { desktop } from "@/platform/desktop";

export type LspHoverDocument = {
  repoPath: string;
  relPath: string;
};

type HoverAnchorRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

type DiffLspHoverState = {
  open: boolean;
  loading: boolean;
  text: string;
  anchorRect: HoverAnchorRect | null;
};

type UseDiffLspHoverOptions = {
  document?: LspHoverDocument;
  resetKey: string;
};

const CLOSED_HOVER_STATE: DiffLspHoverState = {
  open: false,
  loading: false,
  text: "",
  anchorRect: null,
};

const HOVER_CARD_WIDTH = 380;
const HOVER_CARD_MAX_HEIGHT = 400;
const VIEWPORT_PADDING = 8;
const HOVER_CARD_GAP = 6;

function readAnchorRect(tokenElement: HTMLElement): HoverAnchorRect {
  const rect = tokenElement.getBoundingClientRect();
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

function readAnchorRectFromClick(
  tokenElement: HTMLElement,
  event: MouseEvent,
): HoverAnchorRect {
  const clientX =
    typeof event.clientX === "number" && Number.isFinite(event.clientX)
      ? event.clientX
      : null;
  const clientY =
    typeof event.clientY === "number" && Number.isFinite(event.clientY)
      ? event.clientY
      : null;

  if (clientX === null || clientY === null) {
    return readAnchorRect(tokenElement);
  }

  const target = event.target;
  const targetElement =
    target instanceof HTMLElement
      ? target
      : target instanceof Text
        ? target.parentElement
        : null;
  const targetRect = targetElement?.getBoundingClientRect();
  return {
    top: targetRect?.top ?? clientY,
    left: clientX,
    width: Math.max(targetRect?.width ?? 1, 1),
    height: Math.max(targetRect?.height ?? 16, 1),
  };
}

export function toLspHoverPosition({
  lineNumber,
  lineCharStart,
}: Pick<DiffTokenEventBaseProps, "lineNumber" | "lineCharStart">) {
  return {
    line: lineNumber,
    character: lineCharStart,
  };
}

function isHoverInfoClick(event: MouseEvent) {
  return (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey;
}

export function useDiffLspHover({
  document,
  resetKey,
}: UseDiffLspHoverOptions) {
  const [hoverState, setHoverState] = useState<DiffLspHoverState>(CLOSED_HOVER_STATE);
  const hoverRequestIdRef = useRef(0);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const activeTokenRef = useRef<HTMLElement | null>(null);

  const closeHover = () => {
    hoverRequestIdRef.current += 1;
    setHoverState(CLOSED_HOVER_STATE);
    activeTokenRef.current = null;
  };

  useEffect(() => {
    hoverRequestIdRef.current += 1;
    setHoverState(CLOSED_HOVER_STATE);
    activeTokenRef.current = null;
  }, [document?.relPath, document?.repoPath, resetKey]);

  useEffect(() => {
    return () => {
      hoverRequestIdRef.current += 1;
    };
  }, []);

  useEffect(() => {
    if (!hoverState.open) {
      return;
    }

    const dismissHover = () => {
      hoverRequestIdRef.current += 1;
      setHoverState(CLOSED_HOVER_STATE);
      activeTokenRef.current = null;
    };

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        dismissHover();
        return;
      }

      if (popoverRef.current?.contains(target) || activeTokenRef.current?.contains(target)) {
        return;
      }

      dismissHover();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        dismissHover();
      }
    };

    const onViewportChange = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && popoverRef.current?.contains(target)) {
        return;
      }

      dismissHover();
    };

    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onViewportChange, true);
    window.addEventListener("resize", onViewportChange);

    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onViewportChange, true);
      window.removeEventListener("resize", onViewportChange);
    };
  }, [hoverState.open]);

  const onTokenClick = (props: DiffTokenEventBaseProps, event: MouseEvent) => {
    if (!document || props.side !== "additions") {
      return false;
    }

    if (!isHoverInfoClick(event)) {
      return false;
    }

    event.preventDefault();
    event.stopPropagation();

    activeTokenRef.current = props.tokenElement;
    const nextRequestId = hoverRequestIdRef.current + 1;
    hoverRequestIdRef.current = nextRequestId;
    const hoverPosition = toLspHoverPosition(props);
    const anchorRect = readAnchorRectFromClick(props.tokenElement, event);

    setHoverState({
      open: true,
      loading: true,
      text: "Loading LSP info...",
      anchorRect,
    });

    void desktop
      .getLspHover({
        ...document,
        ...hoverPosition,
      })
      .then((result) => {
        if (hoverRequestIdRef.current !== nextRequestId || !result?.text) {
          if (hoverRequestIdRef.current === nextRequestId) {
            closeHover();
          }
          return;
        }

        setHoverState({
          open: true,
          loading: false,
          text: result.text,
          anchorRect,
        });
      })
      .catch(() => {
        if (hoverRequestIdRef.current !== nextRequestId) {
          return;
        }

        closeHover();
      });

    return true;
  };

  return {
    hoverState,
    onTokenClick,
    popoverRef,
    closeHover,
  };
}

type DiffLspHoverPopoverProps = {
  hoverState: DiffLspHoverState;
  popoverRef: MutableRefObject<HTMLDivElement | null>;
};

/**
 * Parses LSP hover text into structured sections.
 * First paragraph is typically the type signature (code), rest is description.
 */
function parseHoverContent(text: string): { signature: string | null; description: string | null } {
  const trimmed = text.trim();
  const paragraphs = trimmed.split(/\n\n+/);

  if (paragraphs.length === 0) {
    return { signature: null, description: null };
  }

  if (paragraphs.length === 1) {
    // Single block - check if it looks like code or description
    const first = paragraphs[0].trim();
    const looksLikeCode =
      first.startsWith("(") ||
      first.includes(":") ||
      first.includes("=>") ||
      first.includes("function") ||
      first.includes("const ") ||
      first.includes("let ") ||
      first.includes("type ") ||
      first.includes("interface ") ||
      first.includes("class ");
    return looksLikeCode ? { signature: first, description: null } : { signature: null, description: first };
  }

  // Multiple paragraphs - first is signature, rest is description
  const signature = paragraphs[0].trim();
  const description = paragraphs.slice(1).join("\n\n").trim();

  return {
    signature: signature || null,
    description: description || null,
  };
}

export function DiffLspHoverPopover({
  hoverState,
  popoverRef,
}: DiffLspHoverPopoverProps) {
  if (!hoverState.open || !hoverState.anchorRect) {
    return null;
  }

  const viewportWidth = typeof window === "undefined" ? 1024 : window.innerWidth;
  const viewportHeight = typeof window === "undefined" ? 768 : window.innerHeight;
  const belowTop = hoverState.anchorRect.top + hoverState.anchorRect.height + HOVER_CARD_GAP;
  const belowSpace = Math.max(viewportHeight - belowTop - VIEWPORT_PADDING, 0);
  const aboveSpace = Math.max(hoverState.anchorRect.top - VIEWPORT_PADDING - HOVER_CARD_GAP, 0);
  const placeAbove = belowSpace < 180 && aboveSpace > belowSpace;
  const availableHeight = placeAbove ? aboveSpace : belowSpace;
  const safeViewportHeight = Math.max(viewportHeight - VIEWPORT_PADDING * 2, 120);
  const maxHeight = Math.min(HOVER_CARD_MAX_HEIGHT, Math.max(availableHeight, 120), safeViewportHeight);
  const preferredTop = placeAbove
    ? hoverState.anchorRect.top - HOVER_CARD_GAP - maxHeight
    : belowTop;
  const top = Math.min(
    Math.max(preferredTop, VIEWPORT_PADDING),
    Math.max(viewportHeight - maxHeight - VIEWPORT_PADDING, VIEWPORT_PADDING),
  );
  const left = Math.min(
    Math.max(hoverState.anchorRect.left, VIEWPORT_PADDING),
    Math.max(viewportWidth - HOVER_CARD_WIDTH - VIEWPORT_PADDING, VIEWPORT_PADDING),
  );

  const { signature, description } = hoverState.loading
    ? { signature: null, description: null }
    : parseHoverContent(hoverState.text);

  return (
    <div
      ref={popoverRef}
      className={cn(
        "bg-popover text-popover-foreground fixed z-50 overflow-hidden rounded-md border shadow-md",
        "animate-in fade-in-0 zoom-in-95",
      )}
      style={{
        top,
        left,
        width: HOVER_CARD_WIDTH,
        maxWidth: `calc(100vw - ${VIEWPORT_PADDING * 2}px)`,
        maxHeight,
      }}
    >
      <div className="max-h-full overflow-auto p-3">
        {hoverState.loading ? (
          <div className="text-xs text-muted-foreground">Loading...</div>
        ) : (
          <div className="flex flex-col gap-2 select-text">
            {signature && (
              <div className="bg-muted/50 max-h-56 overflow-auto rounded px-2 py-1.5">
                <code className="text-xs font-mono whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-relaxed">
                  {signature}
                </code>
              </div>
            )}
            {description && (
              <div className="text-xs text-muted-foreground whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-relaxed">
                {description}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
