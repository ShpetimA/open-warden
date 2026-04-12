import { useRef, useState } from "react";
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
import { fileComments, toLineAnnotations } from "@/features/comments/actions";
import { compactComments } from "@/features/comments/selectors";
import { useFirstCommentTip } from "@/features/comments/useFirstCommentTip";
import type {
  CommentContext,
  CommentItem,
  DiffAnnotationItem,
  DiffFile,
  DiffReturnTarget,
  LspDiagnostic,
  SelectionRange,
} from "@/features/source-control/types";
import { CommentAnnotation } from "@/features/diff-view/components/CommentAnnotation";
import { CommentComposer } from "@/features/diff-view/components/CommentComposer";
import {
  DiagnosticTokenPopover,
  useDiagnosticTokenPopover,
} from "@/features/diff-view/components/DiagnosticTokenPopover";
import { DiffHeaderMetadataControls } from "@/features/diff-view/components/DiffHeaderMetadataControls";
import { PullRequestInlineReviewThread } from "@/features/pull-requests/components/PullRequestInlineReviewThread";
import {
  getDiffTheme,
  getDiffThemeCacheSalt,
  getDiffThemeType,
} from "@/features/diff-view/diffRenderConfig";
import { useParsedDiff } from "@/features/diff-view/hooks/useParsedDiff";
import { MAX_DIFF_LINE_LENGTH } from "@/features/diff-view/services/diffRenderLimits";
import {
  applyDiagnosticTokenDecorations,
  buildDiagnosticsByLine,
} from "@/features/diff-view/util/lsp_token";
import {
  DiffLspHoverPopover,
  type LspHoverDocument,
  useDiffLspHover,
} from "@/features/diff-view/useDiffLspHover";
import { LspSymbolPeek } from "@/features/lsp/components/LspSymbolPeek";
import { useLspTokenNavigation } from "@/features/lsp/useLspTokenNavigation";
import {
  DIFF_LINE_FOCUS_CSS,
  useDiffLineFocus,
} from "@/features/source-control/diffLineFocus";
import { formatRange } from "@/features/source-control/utils";
import type { DiffLineAnnotation, FileDiffOptions } from "@pierre/diffs";

type Props = {
  oldFile: DiffFile | null;
  newFile: DiffFile | null;
  activePath: string;
  commentContext: CommentContext;
  canComment: boolean;
  lspDiagnostics?: LspDiagnostic[];
  fileViewerRevision?: string | null;
  lspHoverDocument?: LspHoverDocument;
  lspJumpContextKind?: "changes" | "review" | "pull-request";
  focusedLineNumber?: number | null;
  focusedLineIndex?: string | null;
  focusedLineKey?: number | string | null;
  annotationItems?: DiffLineAnnotation<DiffAnnotationItem>[];
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
${DIFF_LINE_FOCUS_CSS}
`;

function getDiffIdentity(
  activePath: string,
  oldFile: DiffFile | null,
  newFile: DiffFile | null,
): string {
  return [
    activePath,
    oldFile?.name ?? "",
    oldFile?.contents.length ?? 0,
    newFile?.name ?? "",
    newFile?.contents.length ?? 0,
  ].join(":");
}

type FileCommentsResult = {
  comments: CommentItem[];
  annotations: ReturnType<typeof toLineAnnotations>;
};

function useCurrentFileComments(
  activeRepo: string,
  activePath: string,
  commentContext: CommentContext,
  canComment: boolean,
): FileCommentsResult {
  return useAppSelector((state): FileCommentsResult => {
    if (!canComment) return { comments: [], annotations: [] };
    const allComments = compactComments(state.comments);
    const filtered = fileComments(allComments, activeRepo, activePath, commentContext);
    return { comments: filtered, annotations: toLineAnnotations(filtered) };
  });
}

function buildReturnToDiffTarget(
  jumpContextKind: "changes" | "review" | "pull-request",
  source: { lineNumber: number; lineIndex: string | null },
  activeRepo: string,
  activePath: string,
  commentContext: CommentContext,
  activeBucket: "staged" | "unstaged" | "untracked",
): DiffReturnTarget | null {
  if (!activeRepo || !activePath || source.lineNumber <= 0) {
    return null;
  }

  if (jumpContextKind === "pull-request") {
    return {
      kind: "pull-request",
      repoPath: activeRepo,
      path: activePath,
      lineNumber: source.lineNumber,
      lineIndex: source.lineIndex,
    };
  }

  if (jumpContextKind === "changes") {
    return {
      kind: "changes",
      repoPath: activeRepo,
      path: activePath,
      bucket: activeBucket,
      lineNumber: source.lineNumber,
      lineIndex: source.lineIndex,
    };
  }

  if (commentContext.kind !== "review") {
    return null;
  }

  return {
    kind: "review",
    repoPath: activeRepo,
    path: activePath,
    baseRef: commentContext.baseRef,
    headRef: commentContext.headRef,
    lineNumber: source.lineNumber,
    lineIndex: source.lineIndex,
  };
}

export function DiffWorkspace({
  oldFile,
  newFile,
  activePath,
  commentContext,
  canComment,
  lspDiagnostics = [],
  fileViewerRevision,
  lspHoverDocument,
  lspJumpContextKind,
  focusedLineNumber = null,
  focusedLineIndex = null,
  focusedLineKey = null,
  annotationItems = [],
}: Props) {
  const { resolvedTheme } = useTheme();
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo);
  const activeBucket = useAppSelector((state) => state.sourceControl.activeBucket);
  const diffStyle = useAppSelector((state) => state.sourceControl.diffStyle);
  const jumpContext = lspJumpContextKind ?? commentContext.kind;
  const diffThemeType = getDiffThemeType(resolvedTheme);
  const activeDiffIdentity = getDiffIdentity(activePath, oldFile, newFile);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  const [selectedRange, setSelectedRange] = useState<SelectionRange | null>(null);
  const [expandUnchanged, setExpandUnchanged] = useState(false);
  const [forceShowLargeDiffIdentity, setForceShowLargeDiffIdentity] = useState<string | null>(null);
  const forceShowLargeDiff = forceShowLargeDiffIdentity === activeDiffIdentity;
  const { hoverState, onTokenClick: onHoverTokenClick, popoverRef } = useDiffLspHover({
    document: lspHoverDocument,
    resetKey: activeDiffIdentity,
  });
  const { onTokenClick: onNavigationTokenClick } = useLspTokenNavigation(lspHoverDocument, {
    getReturnToDiffTarget: (source) =>
      buildReturnToDiffTarget(
        jumpContext,
        source,
        activeRepo,
        activePath,
        commentContext,
        activeBucket,
      ),
  });

  const diffTheme = getDiffTheme();
  const { annotations: currentAnnotations } = useCurrentFileComments(
    activeRepo,
    activePath,
    commentContext,
    canComment,
  );
  const repoCommentCount = useAppSelector((state) => {
    if (!canComment || !activeRepo) return 0;
    return state.comments.filter((c) => c.repoPath === activeRepo).length;
  });
  const { showFirstCommentTip } = useFirstCommentTip();
  const diffThemeCacheSalt = getDiffThemeCacheSalt(diffThemeType);
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

  const applySelectionRange = (range: SelectionRange | null) => {
    setSelectedRange(range);
  };

  const onLineSelectionEnd = (range: SelectionRange | null) => {
    setSelectedRange(range);
  };

  const renderAnnotation = (annotation: { metadata?: DiffAnnotationItem }) => {
    const data = annotation.metadata;
    if (!data) return null;

    if (data.type === "composer") {
      return (
        <CommentComposer
          visible
          label={selectedRangeLabel}
          activePath={activePath}
          selectedRange={selectedRange}
          commentContext={commentContext}
          onClose={onCloseCommentComposer}
          onBeforeSubmit={repoCommentCount === 0 ? showFirstCommentTip : undefined}
        />
      );
    }

    if (data.type === "pull-request-thread") {
      return (
        <PullRequestInlineReviewThread
          repoPath={data.repoPath}
          pullRequestNumber={data.pullRequestNumber}
          thread={data.thread}
        />
      );
    }

    if (data.type === "diagnostic") {
      return null;
    }

    return <CommentAnnotation comment={data} />;
  };

  const diagnosticsByLine = buildDiagnosticsByLine(lspDiagnostics);
  const diagnosticPopover = useDiagnosticTokenPopover(diagnosticsByLine);

  const diffOptions: FileDiffOptions<DiffAnnotationItem> = {
    diffStyle,
    theme: diffTheme,
    themeType: diffThemeType,
    unsafeCSS: STICKY_HEADER_CSS,
    disableLineNumbers: false,
    maxLineDiffLength: MAX_DIFF_LINE_LENGTH,
    expandUnchanged,
    expansionLineCount: 20,
    hunkSeparators: "line-info-basic" as const,
    enableLineSelection: canComment,
    onTokenClick: (props, event) => {
      if (onHoverTokenClick(props, event)) {
        return;
      }

      onNavigationTokenClick(props, event);
    },
    onTokenEnter: diagnosticPopover.onTokenEnter,
    onTokenLeave: diagnosticPopover.onTokenLeave,
    onLineSelected: canComment ? applySelectionRange : undefined,
    onLineSelectionEnd: canComment ? onLineSelectionEnd : undefined,
    onPostRender: (rootNode) => applyDiagnosticTokenDecorations(rootNode, diagnosticsByLine),
  };

  const onCloseCommentComposer = () => {
    setSelectedRange(null);
  };

  const selectedRangeLabel = selectedRange
    ? formatRange(selectedRange.start, selectedRange.end)
    : "";
  const baseAnnotations = [...currentAnnotations, ...annotationItems];
  const annotationsWithComposer: DiffLineAnnotation<DiffAnnotationItem>[] = selectedRange
    ? [
        ...baseAnnotations,
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
        },
      ]
    : baseAnnotations;
  const diffViewportKey = `${oldFile?.name}-${newFile?.name}-${expandUnchanged ? "expanded" : "collapsed"}`;

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

  const renderUnrenderableDiffWarning = () => {
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
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <DiagnosticTokenPopover
        open={diagnosticPopover.state.open}
        anchorRect={diagnosticPopover.state.anchorRect}
        diagnostics={diagnosticPopover.state.diagnostics}
        onClose={diagnosticPopover.closePopover}
        onPointerEnter={diagnosticPopover.onPopoverEnter}
        onPointerLeave={diagnosticPopover.onPopoverLeave}
      />
      <DiffLspHoverPopover
        hoverState={hoverState}
        popoverRef={popoverRef}
      />
      <Virtualizer className="relative min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
        <div
          ref={viewportRef}
          key={diffViewportKey}
          className="relative min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden"
        >
          {currentFileDiff ? (
            <PierreFileDiff
              className="block min-w-0 max-w-full"
              fileDiff={currentFileDiff}
              selectedLines={selectedRange}
              lineAnnotations={annotationsWithComposer}
              renderAnnotation={renderAnnotation}
              renderHeaderMetadata={() => (
                <DiffHeaderMetadataControls
                  activePath={activePath}
                  canComment={canComment}
                  commentContext={commentContext}
                  expandUnchanged={expandUnchanged}
                  fileViewerRevision={fileViewerRevision}
                  onToggleExpandUnchanged={() => {
                    setExpandUnchanged((current) => !current);
                  }}
                />
              )}
              options={diffOptions}
            />
          ) : diffRenderGate === "unrenderable" ? (
            renderUnrenderableDiffWarning()
          ) : diffRenderGate === "large" && !forceShowLargeDiff ? (
            renderLargeDiffWarning()
          ) : isParsingDiff ? (
            <div className="text-muted-foreground p-3 text-xs">Parsing diff...</div>
          ) : (
            <div className="text-muted-foreground p-3 text-xs">No diff content.</div>
          )}
          <LspSymbolPeek document={lspHoverDocument} containerRef={viewportRef} />
        </div>
      </Virtualizer>
    </div>
  );
}
