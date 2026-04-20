import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from "react";
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
import type {
  DiffAnnotationItem,
  DiffFile,
  SelectionRange,
} from "@/features/source-control/types";
import {
  getDiffTheme,
  getDiffThemeCacheSalt,
  getDiffThemeType,
} from "@/features/diff-view/diffRenderConfig";
import { useParsedDiff } from "@/features/diff-view/hooks/useParsedDiff";
import { MAX_DIFF_LINE_LENGTH } from "@/features/diff-view/services/diffRenderLimits";
import { useDiffLineFocus, DIFF_LINE_FOCUS_CSS } from "@/features/source-control/diffLineFocus";
import { type DiffLineAnnotation, type FileDiffOptions } from "@pierre/diffs";

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

export const DiffViewer = forwardRef<DiffViewerHandle, DiffViewerProps>(
  function DiffViewer(
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
    const activeDiffIdentity = `${oldFile?.name}-${newFile?.name}-${expandUnchanged ? "expanded" : "collapsed"}`;
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
        hunkSeparators: "line-info-basic",
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
        {currentFileDiff ? (
          <Virtualizer
            config={{
              overscrollSize: 600,
              intersectionObserverMargin: 1200,
            }}
            className="relative h-full min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden"
          >
            <PierreFileDiff
              className="block min-w-0 max-w-full"
              fileDiff={currentFileDiff}
              selectedLines={selectedLines}
              lineAnnotations={lineAnnotations}
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
        {children}
      </div>
    );
  },
);
