import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import type { DiffTokenEventBaseProps } from "@pierre/diffs";

import { parseMarkdown } from "@/features/markdown/parser";
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
  content: string;
  anchorRect: HoverAnchorRect | null;
};

type UseDiffLspHoverOptions = {
  document?: LspHoverDocument;
  resetKey: string;
};

const CLOSED_HOVER_STATE: DiffLspHoverState = {
  open: false,
  loading: false,
  content: "",
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

function readAnchorRectFromClick(tokenElement: HTMLElement, event: MouseEvent): HoverAnchorRect {
  const clientX =
    typeof event.clientX === "number" && Number.isFinite(event.clientX) ? event.clientX : null;
  const clientY =
    typeof event.clientY === "number" && Number.isFinite(event.clientY) ? event.clientY : null;

  if (clientX === null || clientY === null) {
    return readAnchorRect(tokenElement);
  }

  const target = event.target;
  const targetElement =
    target instanceof HTMLElement ? target : target instanceof Text ? target.parentElement : null;
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

export function useDiffLspHover({ document, resetKey }: UseDiffLspHoverOptions) {
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
      content: "Loading LSP info...",
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
          content: result.text,
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

export function DiffLspHoverPopover({ hoverState, popoverRef }: DiffLspHoverPopoverProps) {
  if (!hoverState.open || !hoverState.anchorRect) {
    return null;
  }

  const viewportWidth = typeof window === "undefined" ? 1024 : window.innerWidth;
  const viewportHeight = typeof window === "undefined" ? 768 : window.innerHeight;
  const belowTop = hoverState.anchorRect.top + hoverState.anchorRect.height + HOVER_CARD_GAP;
  const aboveAnchorTop = hoverState.anchorRect.top - HOVER_CARD_GAP;
  const belowSpace = Math.max(viewportHeight - belowTop - VIEWPORT_PADDING, 0);
  const aboveSpace = Math.max(hoverState.anchorRect.top - VIEWPORT_PADDING - HOVER_CARD_GAP, 0);
  const placeAbove = belowSpace < 180 && aboveSpace >= 120;
  const availableHeight = placeAbove ? aboveSpace : belowSpace;
  const safeViewportHeight = Math.max(viewportHeight - VIEWPORT_PADDING * 2, 120);
  const maxHeight = Math.min(
    HOVER_CARD_MAX_HEIGHT,
    Math.max(availableHeight, 120),
    safeViewportHeight,
  );
  const top = placeAbove
    ? Math.min(
        Math.max(aboveAnchorTop, VIEWPORT_PADDING),
        Math.max(viewportHeight - VIEWPORT_PADDING, VIEWPORT_PADDING),
      )
    : Math.min(
        Math.max(belowTop, VIEWPORT_PADDING),
        Math.max(viewportHeight - VIEWPORT_PADDING, VIEWPORT_PADDING),
      );
  const left = Math.min(
    Math.max(hoverState.anchorRect.left, VIEWPORT_PADDING),
    Math.max(viewportWidth - HOVER_CARD_WIDTH - VIEWPORT_PADDING, VIEWPORT_PADDING),
  );

  const renderedMarkdown = useMemo(() => {
    if (hoverState.loading || !hoverState.content.trim()) {
      return "";
    }

    return parseMarkdown(hoverState.content);
  }, [hoverState.content, hoverState.loading]);

  return (
    <div
      ref={popoverRef}
      className={cn(
        "bg-popover text-popover-foreground fixed z-50 overflow-hidden rounded-xs border shadow-md",
        "animate-in fade-in-0 zoom-in-95",
      )}
      style={{
        top,
        left,
        width: HOVER_CARD_WIDTH,
        maxWidth: `calc(100vw - ${VIEWPORT_PADDING * 2}px)`,
        maxHeight,
        transform: placeAbove ? "translateY(-100%)" : undefined,
      }}
    >
      <div className="max-h-full overflow-auto p-2">
        {hoverState.loading ? (
          <div className="text-xs text-muted-foreground">Loading...</div>
        ) : (
          <div
            className="markdown-preview text-xs leading-relaxed text-muted-foreground select-text [&_a]:text-primary [&_a]:underline [&_code]:rounded [&_code]:bg-muted/50 [&_code]:px-1 [&_code]:py-0.5 [&_pre]:overflow-auto [&_pre]:rounded [&_pre]:bg-muted/50 [&_pre]:px-2 [&_pre]:py-1.5 [&_pre_code]:bg-transparent [&_pre_code]:p-0"
            dangerouslySetInnerHTML={{ __html: renderedMarkdown }}
          />
        )}
      </div>
    </div>
  );
}
