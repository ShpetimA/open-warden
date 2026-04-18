import { useCallback, useMemo, useRef, useState } from "react";
import { FileDiff as PierreFileDiff, Virtualizer } from "@pierre/diffs/react";
import { FileWarning } from "lucide-react";
import { useTheme } from "next-themes";
import { shallowEqual } from "react-redux";

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
import type { MentionConfig } from "@/components/markdown/MarkdownEditor";
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
import { LspSymbolPeekContainer } from "@/features/lsp/components/LspSymbolPeek";
import { useLspTokenNavigation } from "@/features/lsp/useLspTokenNavigation";
import { DIFF_LINE_FOCUS_CSS, useDiffLineFocus } from "@/features/source-control/diffLineFocus";
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
  commentMentions?: MentionConfig;
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

const EMPTY_FILE_COMMENTS: CommentItem[] = [];
const EMPTY_FILE_ANNOTATIONS: ReturnType<typeof toLineAnnotations> = [];

function useCurrentFileComments(
  activeRepo: string,
  activePath: string,
  commentContext: CommentContext,
  canComment: boolean,
): FileCommentsResult {
  const comments = useAppSelector(
    (state): CommentItem[] => {
      if (!canComment || !activeRepo || !activePath) {
        return EMPTY_FILE_COMMENTS;
      }

      return fileComments(state.comments, activeRepo, activePath, commentContext);
    },
    shallowEqual,
  );

  const annotations = useMemo(() => {
    if (comments.length === 0) {
      return EMPTY_FILE_ANNOTATIONS;
    }

    return toLineAnnotations(comments);
  }, [comments]);

  return { comments, annotations };
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
  commentMentions,
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
  const getReturnToDiffTarget = useCallback(
    (source: { lineNumber: number; lineIndex: string | null }) =>
      buildReturnToDiffTarget(
        jumpContext,
        source,
        activeRepo,
        activePath,
        commentContext,
        activeBucket,
      ),
    [activeBucket, activePath, activeRepo, commentContext, jumpContext],
  );
  const {
    hoverState,
    onTokenClick: onHoverTokenClick,
    popoverRef,
  } = useDiffLspHover({
    document: lspHoverDocument,
    resetKey: activeDiffIdentity,
  });
  const { onTokenClick: onNavigationTokenClick } = useLspTokenNavigation(lspHoverDocument, {
    getReturnToDiffTarget,
  });

  const diffTheme = useMemo(() => getDiffTheme(), []);
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

  const applySelectionRange = useCallback((range: SelectionRange | null) => {
    setSelectedRange(range);
  }, []);

  const onLineSelectionEnd = useCallback((range: SelectionRange | null) => {
    setSelectedRange(range);
  }, []);

  const onCloseCommentComposer = useCallback(() => {
    setSelectedRange(null);
  }, []);

  const renderAnnotation = useCallback(
    (annotation: { metadata?: DiffAnnotationItem }) => {
      const data = annotation.metadata;
      if (!data) return null;

      if (data.type === "composer") {
        return (
          <CommentComposer
            visible
            activePath={activePath}
            selectedRange={selectedRange}
            commentContext={commentContext}
            onClose={onCloseCommentComposer}
            onBeforeSubmit={repoCommentCount === 0 ? showFirstCommentTip : undefined}
            mentions={commentMentions}
          />
        );
      }

      if (data.type === "pull-request-thread") {
        return (
          <PullRequestInlineReviewThread
            repoPath={data.repoPath}
            pullRequestNumber={data.pullRequestNumber}
            thread={data.thread}
            mentions={commentMentions}
          />
        );
      }

      if (data.type === "diagnostic") {
        return null;
      }

      return <CommentAnnotation comment={data} />;
    },
    [
      activePath,
      commentContext,
      commentMentions,
      onCloseCommentComposer,
      repoCommentCount,
      selectedRange,
      showFirstCommentTip,
    ],
  );

  const diagnosticsByLine = useMemo(() => buildDiagnosticsByLine(lspDiagnostics), [lspDiagnostics]);
  const diagnosticPopover = useDiagnosticTokenPopover(diagnosticsByLine);

  const handleTokenClick = useCallback<NonNullable<FileDiffOptions<DiffAnnotationItem>["onTokenClick"]>>(
    (props, event) => {
      if (onHoverTokenClick(props, event)) {
        return;
      }

      onNavigationTokenClick(props, event);
    },
    [onHoverTokenClick, onNavigationTokenClick],
  );

  const handlePostRender = useCallback(
    (rootNode: HTMLElement) => applyDiagnosticTokenDecorations(rootNode, diagnosticsByLine),
    [diagnosticsByLine],
  );

  const handleToggleExpandUnchanged = useCallback(() => {
    setExpandUnchanged((current) => !current);
  }, []);

  const renderHeaderMetadata = useCallback(
    () => (
      <DiffHeaderMetadataControls
        activePath={activePath}
        canComment={canComment}
        commentContext={commentContext}
        expandUnchanged={expandUnchanged}
        fileViewerRevision={fileViewerRevision}
        onToggleExpandUnchanged={handleToggleExpandUnchanged}
      />
    ),
    [
      activePath,
      canComment,
      commentContext,
      expandUnchanged,
      fileViewerRevision,
      handleToggleExpandUnchanged,
    ],
  );

  const diffOptions = useMemo<FileDiffOptions<DiffAnnotationItem>>(
    () => ({
      diffStyle,
      theme: diffTheme,
      themeType: diffThemeType,
      unsafeCSS: STICKY_HEADER_CSS,
      disableLineNumbers: false,
      maxLineDiffLength: MAX_DIFF_LINE_LENGTH,
      expandUnchanged,
      expansionLineCount: 20,
      hunkSeparators: "line-info-basic",
      enableLineSelection: canComment,
      onTokenClick: handleTokenClick,
      onTokenEnter: diagnosticPopover.onTokenEnter,
      onTokenLeave: diagnosticPopover.onTokenLeave,
      onLineSelected: canComment ? applySelectionRange : undefined,
      onLineSelectionEnd: canComment ? onLineSelectionEnd : undefined,
      onPostRender: handlePostRender,
    }),
    [
      applySelectionRange,
      canComment,
      diagnosticPopover.onTokenEnter,
      diagnosticPopover.onTokenLeave,
      diffStyle,
      diffTheme,
      diffThemeType,
      expandUnchanged,
      handlePostRender,
      handleTokenClick,
      onLineSelectionEnd,
    ],
  );

  const baseAnnotations = useMemo(
    () => [...currentAnnotations, ...annotationItems],
    [annotationItems, currentAnnotations],
  );
  const annotationsWithComposer = useMemo<DiffLineAnnotation<DiffAnnotationItem>[]>(() => {
    if (!selectedRange) {
      return baseAnnotations;
    }

    return [
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
    ];
  }, [baseAnnotations, selectedRange]);

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
      <DiffLspHoverPopover hoverState={hoverState} popoverRef={popoverRef} />
      <div
        ref={viewportRef}
        key={activeDiffIdentity}
        className="relative min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden"
      >
        {currentFileDiff ? (
          <Virtualizer className="relative min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
            <PierreFileDiff
              className="block min-w-0 max-w-full"
              fileDiff={currentFileDiff}
              selectedLines={selectedRange}
              lineAnnotations={annotationsWithComposer}
              renderAnnotation={renderAnnotation}
              renderHeaderMetadata={renderHeaderMetadata}
              options={diffOptions}
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
        <LspSymbolPeekContainer document={lspHoverDocument} containerRef={viewportRef} />
      </div>
    </div>
  );
}
