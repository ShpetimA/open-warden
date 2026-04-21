import { useCallback, useRef, useState } from "react";
import type { DiffTokenEventBaseProps } from "@pierre/diffs";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import type { LspDiagnostic } from "@/features/source-control/types";

type AnchorRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

type Props = {
  open: boolean;
  anchorRect: AnchorRect | null;
  diagnostics: LspDiagnostic[];
  onClose: () => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
};

const DIAGNOSTIC_SEVERITY_PRIORITY: Record<LspDiagnostic["severity"], number> = {
  error: 4,
  warning: 3,
  information: 2,
  hint: 1,
};

function tokenCanRenderDiagnostic(token: HTMLElement): boolean {
  const lineElement = token.closest<HTMLElement>("[data-line]");
  if (!lineElement) {
    return false;
  }

  const lineType = lineElement.getAttribute("data-line-type");
  if (lineType === "change-deletion") {
    return false;
  }

  if (token.closest("[data-additions]")) {
    return true;
  }

  if (token.closest("[data-deletions]")) {
    return false;
  }

  return true;
}

function getTokenLineNumber(token: HTMLElement): number | null {
  const lineElement = token.closest<HTMLElement>("[data-line]");
  if (!lineElement) {
    return null;
  }

  const value = Number.parseInt(lineElement.getAttribute("data-line") ?? "", 10);
  return Number.isFinite(value) ? value : null;
}

function getTokenCharRange(token: HTMLElement): { start: number; end: number } | null {
  const startValue = Number.parseInt(token.getAttribute("data-char") ?? "", 10);
  if (!Number.isFinite(startValue)) {
    return null;
  }

  const tokenText = token.textContent ?? "";
  const start = startValue + 1;
  const end = start + tokenText.length;
  return { start, end };
}

function tokenOverlapsDiagnostic(
  lineNumber: number,
  tokenStart: number,
  tokenEnd: number,
  diagnostic: LspDiagnostic,
): boolean {
  if (lineNumber < diagnostic.startLine || lineNumber > diagnostic.endLine) {
    return false;
  }

  const rangeStart = lineNumber === diagnostic.startLine ? diagnostic.startCharacter : 1;
  const rangeEndRaw =
    lineNumber === diagnostic.endLine ? diagnostic.endCharacter : Number.MAX_SAFE_INTEGER;
  const rangeEnd = Math.max(rangeEndRaw, rangeStart + 1);
  return tokenStart < rangeEnd && tokenEnd > rangeStart;
}

function findDiagnosticsForToken(
  token: HTMLElement,
  diagnosticsByLine: Map<number, LspDiagnostic[]>,
): LspDiagnostic[] {
  if (!tokenCanRenderDiagnostic(token)) {
    return [];
  }

  const lineNumber = getTokenLineNumber(token);
  if (!lineNumber) {
    return [];
  }

  const diagnostics = diagnosticsByLine.get(lineNumber);
  if (!diagnostics || diagnostics.length === 0) {
    return [];
  }

  const charRange = getTokenCharRange(token);
  if (!charRange) {
    return [];
  }

  const matches = diagnostics.filter((diagnostic) =>
    tokenOverlapsDiagnostic(lineNumber, charRange.start, charRange.end, diagnostic),
  );
  return matches.toSorted(
    (left, right) =>
      DIAGNOSTIC_SEVERITY_PRIORITY[right.severity] - DIAGNOSTIC_SEVERITY_PRIORITY[left.severity],
  );
}

function readAnchorRect(tokenElement: HTMLElement): AnchorRect {
  const rect = tokenElement.getBoundingClientRect();
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

export function useDiagnosticTokenPopover(diagnosticsByLine: Map<number, LspDiagnostic[]>) {
  const diagnosticCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDiagnosticPopoverHoveredRef = useRef(false);
  const [state, setState] = useState<{
    open: boolean;
    diagnostics: LspDiagnostic[];
    anchorRect: AnchorRect | null;
  }>({
    open: false,
    diagnostics: [],
    anchorRect: null,
  });

  const closePopover = useCallback(() => {
    if (diagnosticCloseTimerRef.current) {
      clearTimeout(diagnosticCloseTimerRef.current);
      diagnosticCloseTimerRef.current = null;
    }

    setState({
      open: false,
      diagnostics: [],
      anchorRect: null,
    });
  }, []);

  const onTokenEnter = useCallback(
    (props: DiffTokenEventBaseProps) => {
      if (diagnosticCloseTimerRef.current) {
        clearTimeout(diagnosticCloseTimerRef.current);
        diagnosticCloseTimerRef.current = null;
      }

      const diagnostics = findDiagnosticsForToken(props.tokenElement, diagnosticsByLine);
      if (diagnostics.length === 0) {
        closePopover();
        return;
      }

      setState({
        open: true,
        diagnostics,
        anchorRect: readAnchorRect(props.tokenElement),
      });
    },
    [closePopover, diagnosticsByLine],
  );

  const onTokenLeave = useCallback(() => {
    if (diagnosticCloseTimerRef.current) {
      clearTimeout(diagnosticCloseTimerRef.current);
    }

    diagnosticCloseTimerRef.current = setTimeout(() => {
      if (!isDiagnosticPopoverHoveredRef.current) {
        closePopover();
      }
    }, 120);
  }, [closePopover]);

  const onPopoverEnter = useCallback(() => {
    isDiagnosticPopoverHoveredRef.current = true;
    if (diagnosticCloseTimerRef.current) {
      clearTimeout(diagnosticCloseTimerRef.current);
      diagnosticCloseTimerRef.current = null;
    }
  }, []);

  const onPopoverLeave = useCallback(() => {
    isDiagnosticPopoverHoveredRef.current = false;
    closePopover();
  }, [closePopover]);

  return {
    state,
    onTokenEnter,
    onTokenLeave,
    onPopoverEnter,
    onPopoverLeave,
    closePopover,
  };
}

function diagnosticSeverityBadgeClasses(severity: LspDiagnostic["severity"]) {
  switch (severity) {
    case "warning":
      return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
    case "information":
      return "bg-sky-500/15 text-sky-700 dark:text-sky-300";
    case "hint":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "error":
    default:
      return "bg-red-500/15 text-red-700 dark:text-red-300";
  }
}

export function DiagnosticTokenPopover({
  open,
  anchorRect,
  diagnostics,
  onClose,
  onPointerEnter,
  onPointerLeave,
}: Props) {
  if (!anchorRect || diagnostics.length === 0) {
    return null;
  }

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
      }}
    >
      <PopoverAnchor asChild>
        <div
          aria-hidden
          className="pointer-events-none fixed"
          style={{
            top: anchorRect.top,
            left: anchorRect.left,
            width: Math.max(anchorRect.width, 1),
            height: Math.max(anchorRect.height, 1),
          }}
        />
      </PopoverAnchor>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={6}
        collisionPadding={8}
        className="w-[360px] max-h-[320px] overflow-hidden p-0"
        style={{ maxWidth: "calc(100vw - 16px)" }}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div className="max-h-full overflow-auto p-3">
          <div className="flex flex-col gap-2">
            {diagnostics.map((diagnostic) => {
              const metadata = [diagnostic.source, diagnostic.code].filter(Boolean).join(" ");
              return (
                <div
                  key={`${diagnostic.message}:${diagnostic.severity}:${diagnostic.startLine}:${diagnostic.startCharacter}:${diagnostic.endLine}:${diagnostic.endCharacter}:${diagnostic.source ?? ""}:${diagnostic.code ?? ""}`}
                  className="bg-muted/40 rounded border p-2"
                >
                  <div className="mb-1 flex items-center gap-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${diagnosticSeverityBadgeClasses(diagnostic.severity)}`}
                    >
                      {diagnostic.severity}
                    </span>
                    {metadata ? (
                      <span className="text-muted-foreground text-[10px]">{metadata}</span>
                    ) : null}
                  </div>
                  <div className="text-xs leading-relaxed">{diagnostic.message}</div>
                </div>
              );
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
