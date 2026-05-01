import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { FileDiff as PierreFileDiff, Virtualizer } from "@pierre/diffs/react";
import { FileWarning } from "lucide-react";
import { useTheme } from "next-themes";

import { useAppSelector } from "@/app/hooks";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import type { DiffAnnotationItem, DiffFile, SelectionRange } from "@/features/source-control/types";
import type {
  DiffHunkActionAnnotation,
  DiffHunkActionPayload,
  DiffHunkOperation,
} from "@/features/source-control/hunkOperations";
import {
  getDiffTheme,
  getDiffThemeCacheSalt,
  getDiffThemeType,
} from "@/features/diff-view/diffRenderConfig";
import { useParsedDiff } from "@/features/diff-view/hooks/useParsedDiff";
import { MAX_DIFF_LINE_LENGTH } from "@/features/diff-view/services/diffRenderLimits";
import { useDiffLineFocus, DIFF_LINE_FOCUS_CSS } from "@/features/source-control/diffLineFocus";
import {
  type DiffLineAnnotation,
  type FileDiffMetadata,
  type FileDiffOptions,
} from "@pierre/diffs";

export type DiffViewerHandle = {
  getViewportElement: () => HTMLDivElement | null;
};

export type DiffViewerProps = {
  oldFile: DiffFile | null;
  newFile: DiffFile | null;
  activePath: string;
  options?: Partial<FileDiffOptions<DiffAnnotationItem>>;
  lineAnnotations?: DiffLineAnnotation<DiffAnnotationItem>[];
  renderAnnotation?: (annotation: { metadata?: DiffAnnotationItem }) => React.ReactNode;
  renderHeaderMetadata?: (controls: {
    expandUnchanged: boolean;
    onToggleExpandUnchanged: () => void;
  }) => React.ReactNode;
  selectedLines?: SelectionRange | null;
  focusedLineNumber?: number | null;
  focusedLineIndex?: string | null;
  focusedLineKey?: number | string | null;
  hunkOperations?: DiffHunkOperation[];
  onHunkAction?: (operation: DiffHunkOperation, payload: DiffHunkActionPayload) => void;
  children?: React.ReactNode;
};

const STICKY_HEADER_CSS = `
:host {
  min-width: 0;
  max-width: 100%;
}

[data-diffs-header] {
  position: sticky;
  top: 0;
  z-index: 10;
  background-color: var(--diffs-bg);
  border-bottom: 1px solid color-mix(in lab, var(--diffs-bg) 90%, var(--diffs-fg));
  min-width: 0;
  overflow: hidden;
}

pre[data-diff-type='single'] {
  overflow: hidden;
  min-width: 0;
}

[data-lsp-diagnostic-token] {
  text-decoration-line: underline;
  text-decoration-style: wavy;
  text-decoration-thickness: 2px;
  text-underline-offset: 2px;
}

[data-lsp-diagnostic-token='error'] {
  text-decoration-color: rgb(220 38 38 / 0.95);
}

[data-lsp-diagnostic-token='warning'] {
  text-decoration-color: rgb(217 119 6 / 0.95);
}

[data-lsp-diagnostic-token='information'] {
  text-decoration-color: rgb(2 132 199 / 0.95);
}

[data-lsp-diagnostic-token='hint'] {
  text-decoration-color: rgb(5 150 105 / 0.95);
}

[data-interactive-line-numbers] [data-column-number] {
  padding-left: 2.7ch;
}

[data-gutter-utility-slot] {
  left: 0;
  right: auto;
  justify-content: flex-start;
}

[data-utility-button] {
  background-color: transparent;
  color: var(--diffs-fg);
  width: 0.8lh;
  height: 0.8lh;
  margin-right: 0;
  margin-left: 0.70ch;
  border-radius: 999px;
}

[data-hunk-operation-button] {
  display: inline-flex;
  align-items: center;
  height: 20px;
  margin-left: auto;
  padding: 0 8px;
  border-radius: 999px;
  border: 1px solid color-mix(in lab, var(--diffs-bg) 82%, var(--diffs-fg));
  background: color-mix(in lab, var(--diffs-bg) 92%, var(--diffs-fg));
  color: var(--diffs-fg);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
  opacity: 0.82;
}

[data-hunk-operation-button]:hover {
  opacity: 1;
  background: color-mix(in lab, var(--diffs-bg) 86%, var(--diffs-fg));
}
${DIFF_LINE_FOCUS_CSS}
`;

function renderUnrenderableDiffWarning() {
  return (
    <Empty className="border-0 rounded-none h-full gap-4">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FileWarning />
        </EmptyMedia>
        <EmptyTitle>Diff too large</EmptyTitle>
        <EmptyDescription>The diff is too large to be displayed.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

export const DiffViewer = forwardRef<DiffViewerHandle, DiffViewerProps>(function DiffViewer(
  {
    oldFile,
    newFile,
    activePath,
    options = {},
    lineAnnotations = [],
    renderAnnotation,
    renderHeaderMetadata,
    selectedLines,
    focusedLineNumber = null,
    focusedLineIndex = null,
    focusedLineKey = null,
    hunkOperations = [],
    onHunkAction,
    children,
  },
  ref,
) {
  const { resolvedTheme } = useTheme();
  const diffStyle = useAppSelector((state) => state.sourceControl.diffStyle);
  const diffThemeType = getDiffThemeType(resolvedTheme);
  const diffTheme = useMemo(() => getDiffTheme(), []);
  const diffThemeCacheSalt = getDiffThemeCacheSalt(diffThemeType);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  useImperativeHandle(ref, () => ({
    getViewportElement: () => viewportRef.current,
  }));

  const [expandUnchanged, setExpandUnchanged] = useState(false);
  const activeDiffIdentity = `${activePath}:${diffFileIdentity(oldFile)}:${diffFileIdentity(newFile)}:${expandUnchanged ? "expanded" : "collapsed"}`;
  const [forceShowLargeDiffIdentity, setForceShowLargeDiffIdentity] = useState<string | null>(null);
  const forceShowLargeDiff = forceShowLargeDiffIdentity === activeDiffIdentity;

  const onToggleExpandUnchanged = useCallback(() => {
    setExpandUnchanged((prev) => !prev);
  }, []);

  const { currentFileDiff, diffRenderGate, isParsingDiff } = useParsedDiff({
    activePath,
    oldFile,
    newFile,
    cacheSalt: diffThemeCacheSalt,
    allowLargeDiff: forceShowLargeDiff,
  });

  useDiffLineFocus({
    containerRef: viewportRef,
    lineNumber: currentFileDiff ? focusedLineNumber : null,
    lineIndex: currentFileDiff ? focusedLineIndex : null,
    focusKey: focusedLineKey,
    enabled: Boolean(currentFileDiff),
  });

  const mergedOptions = useMemo<FileDiffOptions<DiffAnnotationItem>>(
    () => ({
      diffStyle,
      theme: diffTheme,
      themeType: diffThemeType,
      unsafeCSS: STICKY_HEADER_CSS,
      maxLineDiffLength: MAX_DIFF_LINE_LENGTH,
      expansionLineCount: 20,
      expandUnchanged,
      ...options,
    }),
    [diffStyle, diffTheme, diffThemeType, expandUnchanged, options],
  );

  const headerMetadataNode = useMemo(() => {
    if (!renderHeaderMetadata) return undefined;
    return renderHeaderMetadata({
      expandUnchanged,
      onToggleExpandUnchanged,
    });
  }, [expandUnchanged, onToggleExpandUnchanged, renderHeaderMetadata]);

  const scrollbarMarkers = useMemo(
    () => (currentFileDiff ? buildDiffScrollbarMarkers(currentFileDiff, diffStyle) : []),
    [currentFileDiff, diffStyle],
  );

  const hunkActionAnnotations = useMemo<DiffLineAnnotation<DiffAnnotationItem>[]>(() => {
    if (!currentFileDiff || hunkOperations.length === 0 || !onHunkAction) return [];

    return currentFileDiff.hunks.map((hunk, hunkIndex) => {
      let additionOffset = 0;
      let deletionOffset = 0;

      for (const content of hunk.hunkContent) {
        if (content.type === "context") {
          additionOffset += content.lines;
          deletionOffset += content.lines;
          continue;
        }

        const side = content.additions > 0 ? "additions" : "deletions";
        const firstChangedLine =
          side === "additions"
            ? hunk.additionStart + additionOffset
            : hunk.deletionStart + deletionOffset;
        const hunkStartLine = side === "additions" ? hunk.additionStart : hunk.deletionStart;
        const lineNumber =
          firstChangedLine > hunkStartLine ? firstChangedLine - 1 : firstChangedLine;
        const metadata: DiffHunkActionAnnotation = {
          type: "hunk-action",
          operations: hunkOperations,
          fileDiff: currentFileDiff,
          hunkIndex,
          onAction: onHunkAction,
        };

        return { side, lineNumber, metadata };
      }

      const metadata: DiffHunkActionAnnotation = {
        type: "hunk-action",
        operations: hunkOperations,
        fileDiff: currentFileDiff,
        hunkIndex,
        onAction: onHunkAction,
      };
      return { side: "additions", lineNumber: hunk.additionStart, metadata };
    });
  }, [currentFileDiff, hunkOperations, onHunkAction]);

  const mergedLineAnnotations = useMemo(
    () => [...hunkActionAnnotations, ...lineAnnotations],
    [hunkActionAnnotations, lineAnnotations],
  );

  const renderLargeDiffWarning = () => {
    return (
      <Empty className="border-0 rounded-none h-full gap-4">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileWarning />
          </EmptyMedia>
          <EmptyTitle>Diff too large</EmptyTitle>
          <EmptyDescription>
            The diff is too large to be displayed by default. You can show it anyway, but
            performance may be negatively impacted.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button onClick={() => setForceShowLargeDiffIdentity(activeDiffIdentity)}>
            Show diff
          </Button>
        </EmptyContent>
      </Empty>
    );
  };

  return (
    <div
      ref={viewportRef}
      key={activeDiffIdentity}
      className="relative min-h-0 min-w-0 flex-1 overflow-hidden"
    >
      <style>{DIFF_SCROLLBAR_CSS}</style>
      {currentFileDiff ? (
        <Virtualizer
          config={{
            overscrollSize: 600,
            intersectionObserverMargin: 1200,
          }}
          className="diff-viewport-scroll relative h-full min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden pr-3"
        >
          <PierreFileDiff
            className="block min-w-0 max-w-full"
            fileDiff={currentFileDiff}
            selectedLines={selectedLines}
            lineAnnotations={mergedLineAnnotations}
            renderAnnotation={renderAnnotation}
            renderHeaderMetadata={headerMetadataNode ? () => headerMetadataNode : undefined}
            options={mergedOptions}
          />
        </Virtualizer>
      ) : diffRenderGate === "unrenderable" ? (
        renderUnrenderableDiffWarning()
      ) : diffRenderGate === "large" && !forceShowLargeDiff ? (
        renderLargeDiffWarning()
      ) : isParsingDiff ? (
        <div className="text-muted-foreground p-3 text-xs">Parsing diff...</div>
      ) : (
        <div className="text-muted-foreground p-3 text-xs">No diff content.</div>
      )}
      <DiffScrollbarMarkers markers={scrollbarMarkers} viewportRef={viewportRef} />
      {children}
    </div>
  );
});

const DIFF_SCROLLBAR_CSS = `
.diff-viewport-scroll {
  scrollbar-width: thin;
  scrollbar-color: hsl(var(--muted-foreground) / 0.32) transparent;
  scrollbar-gutter: stable;
}

.diff-viewport-scroll::-webkit-scrollbar {
  width: 12px;
}

.diff-viewport-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.diff-viewport-scroll::-webkit-scrollbar-thumb {
  background-color: hsl(var(--muted-foreground) / 0.24);
  border: 4px solid transparent;
  border-radius: 0px;
  background-clip: padding-box;
}

.diff-viewport-scroll::-webkit-scrollbar-thumb:hover {
  background-color: hsl(var(--muted-foreground) / 0.38);
}
`;

type DiffScrollbarMarker = {
  key: string;
  type: "addition" | "deletion";
  top: number;
  height: number;
};

function clampPercent(value: number) {
  return Math.min(100, Math.max(0, value));
}

function hashDiffContents(value: string) {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(36);
}

function diffFileIdentity(file: DiffFile | null) {
  if (!file) return "missing";
  return `${file.name}:${file.contents.length}:${hashDiffContents(file.contents)}`;
}

function getDiffTotalLines(fileDiff: FileDiffMetadata, diffStyle: "unified" | "split") {
  return diffStyle === "split" ? fileDiff.splitLineCount : fileDiff.unifiedLineCount;
}

function buildDiffScrollbarMarkers(
  fileDiff: FileDiffMetadata,
  diffStyle: "unified" | "split",
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

function DiffScrollbarMarkers({
  markers,
  viewportRef,
}: {
  markers: DiffScrollbarMarker[];
  viewportRef: RefObject<HTMLDivElement | null>;
}) {
  const scrollToPercent = useCallback(
    (percent: number) => {
      const scrollElement =
        viewportRef.current?.querySelector<HTMLElement>(".diff-viewport-scroll");
      if (!scrollElement) return;

      const maxScrollTop = scrollElement.scrollHeight - scrollElement.clientHeight;
      scrollElement.scrollTop = maxScrollTop * (clampPercent(percent) / 100);
    },
    [viewportRef],
  );

  const handleTrackPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
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
      className="absolute bottom-2 right-1.5 top-2 z-20 w-2 cursor-pointer bg-background/45 shadow-[0_0_0_1px_hsl(var(--border)/0.55)_inset] transition-[width,background-color] hover:w-4 hover:bg-background/70"
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
