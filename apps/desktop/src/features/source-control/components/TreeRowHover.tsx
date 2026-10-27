import { useEffect, useRef, useState, type ReactNode } from "react";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";

type HoveredRow = { element: HTMLElement; path: string; label: string };

const OPEN_DELAY_MS = 700;
const CLOSE_DELAY_MS = 150;
const SKIP_DELAY_MS = 300;

function isInsideCard(path: EventTarget[]) {
  return path.some(
    (element) => element instanceof HTMLElement && element.dataset.slot === "popover-content",
  );
}

function rowFromPath(path: EventTarget[], directoriesOnly: boolean): HoveredRow | null {
  for (const element of path) {
    if (!(element instanceof HTMLElement) || element.dataset.type !== "item") continue;
    if (directoriesOnly && !element.hasAttribute("aria-expanded")) return null;

    const itemPath = element.dataset.itemPath;
    const label = element.getAttribute("aria-label");
    if (itemPath && label) return { element, path: itemPath, label };
  }
  return null;
}

export function TreeRowHover({
  children,
  renderContent,
  directoriesOnly = false,
}: {
  children: ReactNode;
  renderContent?: (path: string, label: string) => ReactNode;
  directoriesOnly?: boolean;
}) {
  const [hovered, setHovered] = useState<HoveredRow | null>(null);
  const pendingPath = useRef("");
  const timer = useRef<number | undefined>(undefined);
  const skipDelay = useRef(false);
  const resetDelayTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      close(true);
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      window.clearTimeout(timer.current);
      window.clearTimeout(resetDelayTimer.current);
    };
  }, []);

  function close(resetDelay = false) {
    window.clearTimeout(timer.current);
    pendingPath.current = "";
    setHovered(null);

    if (resetDelay) {
      window.clearTimeout(resetDelayTimer.current);
      resetDelayTimer.current = undefined;
      skipDelay.current = false;
    } else if (skipDelay.current && resetDelayTimer.current === undefined) {
      resetDelayTimer.current = window.setTimeout(() => {
        skipDelay.current = false;
        resetDelayTimer.current = undefined;
      }, SKIP_DELAY_MS);
    }
  }

  function scheduleClose() {
    window.clearTimeout(timer.current);
    if (!hovered) {
      close();
      return;
    }
    timer.current = window.setTimeout(() => close(), CLOSE_DELAY_MS);
  }

  function scheduleOpen(row: HoveredRow) {
    if (pendingPath.current === row.path) {
      if (hovered) window.clearTimeout(timer.current);
      return;
    }

    window.clearTimeout(timer.current);
    pendingPath.current = row.path;

    function open() {
      window.clearTimeout(resetDelayTimer.current);
      resetDelayTimer.current = undefined;
      skipDelay.current = true;
      setHovered(row);
    }

    if (skipDelay.current) {
      open();
    } else {
      setHovered(null);
      timer.current = window.setTimeout(open, OPEN_DELAY_MS);
    }
  }

  return (
    <div
      className="contents"
      onPointerMoveCapture={(event) => {
        const path = event.nativeEvent.composedPath();
        if (isInsideCard(path)) return;
        if (event.buttons || event.pointerType === "touch") {
          close(true);
          return;
        }

        const row = rowFromPath(path, directoriesOnly);
        if (!row) {
          close();
          return;
        }
        scheduleOpen(row);
      }}
      onPointerLeave={scheduleClose}
      onPointerDownCapture={(event) => {
        if (!isInsideCard(event.nativeEvent.composedPath())) close(true);
      }}
      onWheelCapture={(event) => {
        if (!isInsideCard(event.nativeEvent.composedPath())) close(true);
      }}
    >
      {children}
      {hovered ? (
        <Popover
          open
          onOpenChange={(open) => {
            if (!open) close();
          }}
        >
          <PopoverAnchor virtualRef={{ current: hovered.element }} />
          <PopoverContent
            role="tooltip"
            side="right"
            align="start"
            sideOffset={8}
            collisionPadding={8}
            className="w-max max-w-[min(28rem,calc(100vw-24px))] rounded-md p-3 text-xs"
            onOpenAutoFocus={(event) => event.preventDefault()}
            onCloseAutoFocus={(event) => event.preventDefault()}
            onPointerEnter={() => window.clearTimeout(timer.current)}
            onPointerLeave={scheduleClose}
          >
            {renderContent?.(hovered.path, hovered.label) ?? (
              <p className="whitespace-pre-wrap break-all">{hovered.path.replace(/\/$/, "")}</p>
            )}
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );
}
