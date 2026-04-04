import { useEffect, useRef, useState, type MutableRefObject } from "react";
import type { DiffTokenEventBaseProps } from "@pierre/diffs";

import { ScrollArea } from "@/components/ui/scroll-area";
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
  delayMs?: number;
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
const HOVER_BRIDGE_HEIGHT = 8; // Invisible bridge between token and popover

function readAnchorRect(tokenElement: HTMLElement): HoverAnchorRect {
  const rect = tokenElement.getBoundingClientRect();
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

function clearTimer(timerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>) {
  if (timerRef.current === null) {
    return;
  }

  clearTimeout(timerRef.current);
  timerRef.current = null;
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

export function useDiffLspHover({
  document,
  resetKey,
  delayMs = 150,
}: UseDiffLspHoverOptions) {
  const [hoverState, setHoverState] = useState<DiffLspHoverState>(CLOSED_HOVER_STATE);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverRequestIdRef = useRef(0);
  const [hoveredTokenProps, setHoveredTokenProps] = useState<DiffTokenEventBaseProps | null>(null);
  const isPopoverHoveredRef = useRef(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const closeHover = () => {
    clearTimer(hoverTimerRef);
    clearTimer(closeTimerRef);
    hoverRequestIdRef.current += 1;
    setHoverState(CLOSED_HOVER_STATE);
    isPopoverHoveredRef.current = false;
  };

  const scheduleClose = () => {
    clearTimer(closeTimerRef);
    closeTimerRef.current = setTimeout(() => {
      if (!isPopoverHoveredRef.current) {
        closeHover();
      }
    }, 100);
  };

  useEffect(() => {
    closeHover();
  }, [document?.relPath, document?.repoPath, resetKey]);

  useEffect(() => {
    return () => {
      clearTimer(hoverTimerRef);
      clearTimer(closeTimerRef);
      hoverRequestIdRef.current += 1;
    };
  }, []);

  const onTokenEnter = (props: DiffTokenEventBaseProps, _event: PointerEvent) => {
    setHoveredTokenProps(props);
    clearTimer(closeTimerRef);

    if (!document || props.side !== "additions") {
      closeHover();
      return;
    }

    clearTimer(hoverTimerRef);

    const nextRequestId = hoverRequestIdRef.current + 1;
    hoverRequestIdRef.current = nextRequestId;
    const anchorRect = readAnchorRect(props.tokenElement);
    const hoverPosition = toLspHoverPosition(props);

    setHoverState({
      open: false,
      loading: false,
      text: "",
      anchorRect,
    });

    hoverTimerRef.current = setTimeout(() => {
      setHoverState({
        open: true,
        loading: true,
        text: "Loading LSP info...",
        anchorRect: readAnchorRect(props.tokenElement),
      });

      void desktop
        .getLspHover({
          ...document,
          ...hoverPosition,
        })
        .then((result) => {
          if (hoverRequestIdRef.current !== nextRequestId || !result?.text) {
            if (hoverRequestIdRef.current === nextRequestId) {
              setHoverState(CLOSED_HOVER_STATE);
            }
            return;
          }

          setHoverState({
            open: true,
            loading: false,
            text: result.text,
            anchorRect: readAnchorRect(props.tokenElement),
          });
        })
        .catch(() => {
          if (hoverRequestIdRef.current !== nextRequestId) {
            return;
          }

          setHoverState(CLOSED_HOVER_STATE);
        });
    }, delayMs);
  };

  const onTokenLeave = (_props: DiffTokenEventBaseProps, _event: PointerEvent) => {
    scheduleClose();
  };

  const onPopoverEnter = () => {
    isPopoverHoveredRef.current = true;
    clearTimer(closeTimerRef);
  };

  const onPopoverLeave = () => {
    isPopoverHoveredRef.current = false;
    closeHover();
  };

  return {
    hoveredTokenProps,
    hoverState,
    onTokenEnter,
    onTokenLeave,
    onPopoverEnter,
    onPopoverLeave,
    closeHover,
  };
}

type DiffLspHoverPopoverProps = {
  hoverState: DiffLspHoverState;
  onPopoverEnter: () => void;
  onPopoverLeave: () => void;
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
  onPopoverEnter,
  onPopoverLeave,
}: DiffLspHoverPopoverProps) {
  if (!hoverState.open || !hoverState.anchorRect) {
    return null;
  }

  const viewportWidth = typeof window === "undefined" ? 1024 : window.innerWidth;
  // Position popover below the token with a small gap
  const top = hoverState.anchorRect.top + hoverState.anchorRect.height;
  const left = Math.min(
    Math.max(hoverState.anchorRect.left, VIEWPORT_PADDING),
    Math.max(viewportWidth - HOVER_CARD_WIDTH - VIEWPORT_PADDING, VIEWPORT_PADDING),
  );

  const { signature, description } = hoverState.loading
    ? { signature: null, description: null }
    : parseHoverContent(hoverState.text);

  return (
    <div
      onPointerEnter={onPopoverEnter}
      onPointerLeave={onPopoverLeave}
      className={cn(
        "bg-popover text-popover-foreground fixed z-50 rounded-md border shadow-md",
        "animate-in fade-in-0 zoom-in-95",
      )}
      style={{
        top,
        left,
        width: HOVER_CARD_WIDTH,
        maxWidth: `calc(100vw - ${VIEWPORT_PADDING * 2}px)`,
      }}
    >
      {/* Invisible bridge to prevent hover gap issues */}
      <div
        className="absolute left-0 right-0 pointer-events-auto"
        style={{
          top: -HOVER_BRIDGE_HEIGHT,
          height: HOVER_BRIDGE_HEIGHT,
        }}
      />
      <ScrollArea
        className="p-3"
        style={{ maxHeight: HOVER_CARD_MAX_HEIGHT }}
      >
        {hoverState.loading ? (
          <div className="text-xs text-muted-foreground">Loading...</div>
        ) : (
          <div className="flex flex-col gap-2 select-text">
            {signature && (
              <div className="bg-muted/50 rounded px-2 py-1.5 overflow-x-auto">
                <code className="text-xs font-mono whitespace-pre-wrap break-all leading-relaxed">
                  {signature}
                </code>
              </div>
            )}
            {description && (
              <div className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                {description}
              </div>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
