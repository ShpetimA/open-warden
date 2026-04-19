import {
  createElement,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTheme } from "next-themes";
import { WorkerPoolContext, renderDiffChildren, templateRender } from "@pierre/diffs/react";
import {
  DIFFS_TAG_NAME,
  FileDiff as ImperativeFileDiff,
  areOptionsEqual,
  type DiffLineAnnotation,
  type FileDiffMetadata,
  type FileDiffOptions,
  type RenderRange,
} from "@pierre/diffs";
import { FileWarning } from "lucide-react";

import { useAppSelector } from "@/app/hooks";
import type { MentionConfig } from "@/components/markdown/MarkdownEditor";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { useFirstCommentTip } from "@/features/comments/useFirstCommentTip";
import { CommentComposer } from "@/features/diff-view/components/CommentComposer";
import {
  getDiffTheme,
  getDiffThemeCacheSalt,
  getDiffThemeType,
} from "@/features/diff-view/diffRenderConfig";
import { useParsedDiff } from "@/features/diff-view/hooks/useParsedDiff";
import { MAX_DIFF_LINE_LENGTH } from "@/features/diff-view/services/diffRenderLimits";
import { PullRequestInlineAnchorAnnotation } from "@/features/pull-requests/components/PullRequestInlineAnchorAnnotation";
import type {
  CommentContext,
  DiffAnnotationItem,
  DiffFile,
  SelectionRange,
} from "@/features/source-control/types";

const WINDOWED_DIFF_CSS = `
:host {
  min-width: 0;
  max-width: 100%;
}

pre[data-diff-type='single'] {
  overflow: hidden;
  min-width: 0;
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
`;

type WindowedAnchor = {
  side: "deletions" | "additions";
  startLine: number;
  endLine: number;
  contextLines?: number;
};

type PullRequestWindowedDiffProps = {
  oldFile: DiffFile | null;
  newFile: DiffFile | null;
  activePath: string;
  commentContext: CommentContext;
  annotationItems: DiffLineAnnotation<DiffAnnotationItem>[];
  commentMentions?: MentionConfig;
  windowedAnchor: WindowedAnchor;
};

function hunkContainsAnchor(hunk: FileDiffMetadata["hunks"][number], anchor: WindowedAnchor) {
  if (anchor.side === "additions") {
    const endLine = hunk.additionStart + Math.max(hunk.additionCount - 1, 0);
    return anchor.endLine >= hunk.additionStart && anchor.startLine <= endLine;
  }

  const endLine = hunk.deletionStart + Math.max(hunk.deletionCount - 1, 0);
  return anchor.endLine >= hunk.deletionStart && anchor.startLine <= endLine;
}

function findHunkRenderRowForLine(
  hunk: FileDiffMetadata["hunks"][number],
  side: "deletions" | "additions",
  lineNumber: number,
  diffStyle: "split" | "unified",
) {
  let renderRow = diffStyle === "unified" ? hunk.unifiedLineStart : hunk.splitLineStart;
  let deletionLine = hunk.deletionStart;
  let additionLine = hunk.additionStart;

  for (const block of hunk.hunkContent) {
    if (block.type === "context") {
      const contextOffset =
        side === "deletions" ? lineNumber - deletionLine : lineNumber - additionLine;
      if (contextOffset >= 0 && contextOffset < block.lines) {
        return renderRow + contextOffset;
      }

      renderRow += block.lines;
      deletionLine += block.lines;
      additionLine += block.lines;
      continue;
    }

    if (diffStyle === "unified") {
      const deletionOffset = lineNumber - deletionLine;
      if (side === "deletions" && deletionOffset >= 0 && deletionOffset < block.deletions) {
        return renderRow + deletionOffset;
      }
      renderRow += block.deletions;
      deletionLine += block.deletions;

      const additionOffset = lineNumber - additionLine;
      if (side === "additions" && additionOffset >= 0 && additionOffset < block.additions) {
        return renderRow + additionOffset;
      }
      renderRow += block.additions;
      additionLine += block.additions;
      continue;
    }

    const deletionOffset = lineNumber - deletionLine;
    if (side === "deletions" && deletionOffset >= 0 && deletionOffset < block.deletions) {
      return renderRow + deletionOffset;
    }

    const additionOffset = lineNumber - additionLine;
    if (side === "additions" && additionOffset >= 0 && additionOffset < block.additions) {
      return renderRow + additionOffset;
    }

    renderRow += Math.max(block.deletions, block.additions);
    deletionLine += block.deletions;
    additionLine += block.additions;
  }

  return null;
}

function buildWindowedRenderRange(
  fileDiff: FileDiffMetadata | null,
  diffStyle: "split" | "unified",
  windowedAnchor: WindowedAnchor,
): RenderRange | undefined {
  if (!fileDiff) {
    return undefined;
  }

  const targetHunk = fileDiff.hunks.find((hunk) => hunkContainsAnchor(hunk, windowedAnchor));
  if (!targetHunk) {
    return undefined;
  }

  const contextLines = windowedAnchor.contextLines ?? 4;
  const hunkStart =
    diffStyle === "unified" ? targetHunk.unifiedLineStart : targetHunk.splitLineStart;
  const hunkTotalLines =
    diffStyle === "unified" ? targetHunk.unifiedLineCount : targetHunk.splitLineCount;
  const hunkEnd = hunkStart + hunkTotalLines;
  const anchorStartRow =
    findHunkRenderRowForLine(
      targetHunk,
      windowedAnchor.side,
      windowedAnchor.startLine,
      diffStyle,
    ) ?? hunkStart;
  const anchorEndRow =
    findHunkRenderRowForLine(targetHunk, windowedAnchor.side, windowedAnchor.endLine, diffStyle) ??
    anchorStartRow;
  const startingLine = Math.max(hunkStart, anchorStartRow - contextLines);
  const totalLines = Math.max(1, Math.min(hunkEnd, anchorEndRow + contextLines + 1) - startingLine);

  return {
    startingLine,
    totalLines,
    bufferBefore: 0,
    bufferAfter: 0,
  };
}

function WindowedFileDiff({
  fileDiff,
  renderRange,
  options,
  lineAnnotations,
  selectedLines,
  renderAnnotation,
}: {
  fileDiff: FileDiffMetadata;
  renderRange: RenderRange;
  options: FileDiffOptions<DiffAnnotationItem>;
  lineAnnotations: DiffLineAnnotation<DiffAnnotationItem>[];
  selectedLines: SelectionRange | null;
  renderAnnotation: (annotation: { metadata?: DiffAnnotationItem }) => React.ReactNode;
}) {
  const poolManager = useContext(WorkerPoolContext);
  const instanceRef = useRef<ImperativeFileDiff<DiffAnnotationItem> | null>(null);
  const getHoveredLine = useCallback(() => instanceRef.current?.getHoveredLine(), []);
  const diffsTagName = DIFFS_TAG_NAME as string;

  const ref = useCallback(
    (node: HTMLElement | null) => {
      if (node) {
        instanceRef.current = new ImperativeFileDiff(options, poolManager ?? undefined, true);
        instanceRef.current.hydrate({
          fileDiff,
          fileContainer: node,
          lineAnnotations,
        });
        return;
      }

      instanceRef.current?.cleanUp();
      instanceRef.current = null;
    },
    [fileDiff, lineAnnotations, options, poolManager],
  );

  useLayoutEffect(() => {
    const instance = instanceRef.current;
    if (!instance) {
      return;
    }

    const forceRender = !areOptionsEqual(instance.options, options);
    instance.setOptions(options);
    instance.render({
      forceRender,
      fileDiff,
      lineAnnotations,
      renderRange,
    });
    instance.setSelectedLines(selectedLines);
  }, [fileDiff, lineAnnotations, options, renderRange, selectedLines]);

  return createElement(
    diffsTagName,
    { className: "block min-w-0 max-w-full", ref },
    templateRender(
      renderDiffChildren({
        fileDiff,
        renderAnnotation,
        renderCustomHeader: undefined,
        renderHeaderPrefix: undefined,
        renderHeaderMetadata: undefined,
        renderGutterUtility: undefined,
        renderHoverUtility: undefined,
        getHoveredLine,
        lineAnnotations,
      }),
      undefined,
    ),
  );
}

export function PullRequestWindowedDiff({
  oldFile,
  newFile,
  activePath,
  commentContext,
  annotationItems,
  commentMentions,
  windowedAnchor,
}: PullRequestWindowedDiffProps) {
  const { resolvedTheme } = useTheme();
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo);
  const diffStyle = useAppSelector((state) => state.sourceControl.diffStyle);
  const repoCommentCount = useAppSelector((state) => {
    if (!activeRepo) return 0;
    return state.comments.filter((comment) => comment.repoPath === activeRepo).length;
  });
  const [selectedRange, setSelectedRange] = useState<SelectionRange | null>(null);
  const { showFirstCommentTip } = useFirstCommentTip();
  const diffThemeType = getDiffThemeType(resolvedTheme);
  const diffThemeCacheSalt = getDiffThemeCacheSalt(diffThemeType);
  const diffTheme = useMemo(() => getDiffTheme(), []);
  const { currentFileDiff, diffRenderGate, isParsingDiff } = useParsedDiff({
    activePath,
    oldFile,
    newFile,
    cacheSalt: diffThemeCacheSalt,
  });
  const renderRange = buildWindowedRenderRange(currentFileDiff, diffStyle, windowedAnchor);

  const renderAnnotation = useCallback(
    (annotation: { metadata?: DiffAnnotationItem }) => {
      const data = annotation.metadata;
      if (!data) {
        return null;
      }

      if (data.type === "composer") {
        return (
          <CommentComposer
            visible
            activePath={activePath}
            selectedRange={selectedRange}
            commentContext={commentContext}
            onClose={() => setSelectedRange(null)}
            onBeforeSubmit={repoCommentCount === 0 ? showFirstCommentTip : undefined}
            mentions={commentMentions}
          />
        );
      }

      if (data.type !== "pull-request-anchor") {
        return null;
      }

      return (
        <PullRequestInlineAnchorAnnotation
          providerId={data.providerId}
          repoPath={data.repoPath}
          pullRequestNumber={data.pullRequestNumber}
          anchor={data.anchor}
          compareBaseRef={data.compareBaseRef}
          compareHeadRef={data.compareHeadRef}
          mentions={commentMentions}
        />
      );
    },
    [
      activePath,
      commentContext,
      commentMentions,
      repoCommentCount,
      selectedRange,
      showFirstCommentTip,
    ],
  );

  const diffOptions = useMemo<FileDiffOptions<DiffAnnotationItem>>(
    () => ({
      diffStyle,
      theme: diffTheme,
      themeType: diffThemeType,
      unsafeCSS: WINDOWED_DIFF_CSS,
      disableFileHeader: true,
      disableLineNumbers: false,
      maxLineDiffLength: MAX_DIFF_LINE_LENGTH,
      expandUnchanged: false,
      hunkSeparators: "line-info-basic",
      enableLineSelection: true,
      enableGutterUtility: true,
      onLineSelected: setSelectedRange,
      onLineSelectionEnd: setSelectedRange,
    }),
    [diffStyle, diffTheme, diffThemeType],
  );

  const lineAnnotations = selectedRange
    ? [
        ...annotationItems,
        {
          lineNumber: selectedRange.end,
          metadata: {
            type: "composer",
            side: selectedRange.side ?? "deletions",
            endSide: selectedRange.endSide,
            startLine: selectedRange.start,
            endLine: selectedRange.end,
          },
          side: selectedRange.side ?? "deletions",
        } satisfies DiffLineAnnotation<DiffAnnotationItem>,
      ]
    : annotationItems;

  if (!currentFileDiff && diffRenderGate === "unrenderable") {
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

  if (isParsingDiff || !currentFileDiff || !renderRange) {
    return <div className="text-muted-foreground px-3 py-2 text-xs">Loading snippet...</div>;
  }

  return (
    <div className="min-h-0 overflow-visible">
      <WindowedFileDiff
        fileDiff={currentFileDiff}
        renderRange={renderRange}
        options={diffOptions}
        lineAnnotations={lineAnnotations}
        selectedLines={selectedRange}
        renderAnnotation={renderAnnotation}
      />
      {diffRenderGate === "large" ? (
        <div className="text-muted-foreground px-3 pb-2 text-[11px]">
          Showing clipped snippet from a large diff.
        </div>
      ) : null}
    </div>
  );
}
