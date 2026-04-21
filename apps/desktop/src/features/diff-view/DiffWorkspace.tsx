import { useCallback, useMemo, useRef } from "react";

import { useAppSelector } from "@/app/hooks";
import type { MentionConfig } from "@/components/markdown/MarkdownEditor";
import { DiagnosticTokenPopover } from "@/features/diff-view/components/DiagnosticTokenPopover";
import { DiffHeaderMetadataControls } from "@/features/diff-view/components/DiffHeaderMetadataControls";
import { PullRequestInlineAnchorAnnotation } from "@/features/pull-requests/components/PullRequestInlineAnchorAnnotation";
import { PullRequestInlineReviewThread } from "@/features/pull-requests/components/PullRequestInlineReviewThread";
import {
  DiffLspHoverPopover,
  type LspHoverDocument,
  useDiffLspHover,
} from "@/features/diff-view/useDiffLspHover";
import { LspSymbolPeekContainer } from "@/features/lsp/components/LspSymbolPeek";
import { useLspTokenNavigation } from "@/features/lsp/useLspTokenNavigation";
import type {
  CommentContext,
  DiffAnnotationItem,
  DiffFile,
  DiffReturnTarget,
  LspDiagnostic,
} from "@/features/source-control/types";
import { DiffViewer, type DiffViewerHandle } from "@/features/diff-view/components/DiffViewer";
import { useDiffCommentAnnotations } from "@/features/diff-view/hooks/useDiffCommentAnnotations";
import { useDiffDiagnostics } from "@/features/diff-view/hooks/useDiffDiagnostics";
import { useDiffAnnotationRenderer } from "@/features/diff-view/hooks/useDiffAnnotationRenderer";
import { type DiffLineAnnotation, type FileDiffOptions } from "@pierre/diffs";

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
  includeCurrentFileComments?: boolean;
  disableFileHeader?: boolean;
  hideHeaderMetadataControls?: boolean;
};

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
  includeCurrentFileComments = true,
  disableFileHeader = false,
  hideHeaderMetadataControls = false,
}: Props) {
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo);
  const activeBucket = useAppSelector((state) => state.sourceControl.activeBucket);
  const jumpContext = lspJumpContextKind ?? commentContext.kind;
  const viewerRef = useRef<DiffViewerHandle | null>(null);

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

  const lspResetKey = `${oldFile?.name ?? ""}-${newFile?.name ?? ""}`;
  const {
    hoverState,
    onTokenClick: onHoverTokenClick,
    popoverRef,
  } = useDiffLspHover({
    document: lspHoverDocument,
    resetKey: lspResetKey,
  });

  const { onTokenClick: onNavigationTokenClick } = useLspTokenNavigation(lspHoverDocument, {
    getReturnToDiffTarget,
  });

  const diagnostics = useDiffDiagnostics(lspDiagnostics);

  const comments = useDiffCommentAnnotations({
    activePath,
    commentContext,
    canComment,
    includeCurrentFileComments,
    commentMentions,
  });

  const handleTokenClick = useCallback<
    NonNullable<FileDiffOptions<DiffAnnotationItem>["onTokenClick"]>
  >(
    (props, event) => {
      if (onHoverTokenClick(props, event)) {
        return;
      }

      onNavigationTokenClick(props, event);
    },
    [onHoverTokenClick, onNavigationTokenClick],
  );

  const renderAnnotation = useDiffAnnotationRenderer({
    composer: comments.renderCommentAnnotation,
    "pull-request-anchor": (data) => (
      <PullRequestInlineAnchorAnnotation
        providerId={data.providerId}
        repoPath={data.repoPath}
        pullRequestNumber={data.pullRequestNumber}
        anchor={data.anchor}
        compareBaseRef={data.compareBaseRef}
        compareHeadRef={data.compareHeadRef}
        mentions={commentMentions}
      />
    ),
    "pull-request-thread": (data) => (
      <PullRequestInlineReviewThread
        repoPath={data.repoPath}
        pullRequestNumber={data.pullRequestNumber}
        thread={data.thread}
        mentions={commentMentions}
      />
    ),
    annotation: comments.renderCommentAnnotation,
  });

  const mergedAnnotations = useMemo(
    () => [...comments.annotations, ...annotationItems],
    [comments.annotations, annotationItems],
  );

  const options = useMemo<Partial<FileDiffOptions<DiffAnnotationItem>>>(
    () => ({
      disableFileHeader,
      enableLineSelection: canComment,
      enableGutterUtility: canComment,
      onTokenClick: handleTokenClick,
      onTokenEnter: diagnostics.onTokenEnter,
      onTokenLeave: diagnostics.onTokenLeave,
      onLineSelected: canComment ? comments.onLineSelected : undefined,
      onLineSelectionEnd: canComment ? comments.onLineSelectionEnd : undefined,
      onPostRender: diagnostics.onPostRender,
    }),
    [
      canComment,
      comments.onLineSelected,
      comments.onLineSelectionEnd,
      diagnostics.onPostRender,
      diagnostics.onTokenEnter,
      diagnostics.onTokenLeave,
      disableFileHeader,
      handleTokenClick,
    ],
  );

  const renderHeaderMetadata = useCallback(
    (controls: { expandUnchanged: boolean; onToggleExpandUnchanged: () => void }) => {
      if (hideHeaderMetadataControls) {
        return undefined;
      }

      return (
        <DiffHeaderMetadataControls
          activePath={activePath}
          canComment={canComment}
          commentContext={commentContext}
          expandUnchanged={controls.expandUnchanged}
          fileViewerRevision={fileViewerRevision}
          onToggleExpandUnchanged={controls.onToggleExpandUnchanged}
        />
      );
    },
    [activePath, canComment, commentContext, fileViewerRevision, hideHeaderMetadataControls],
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <DiagnosticTokenPopover
        open={diagnostics.popoverState.open}
        anchorRect={diagnostics.popoverState.anchorRect}
        diagnostics={diagnostics.popoverState.diagnostics}
        {...diagnostics.popoverHandlers}
      />
      <DiffLspHoverPopover hoverState={hoverState} popoverRef={popoverRef} />
      <DiffViewer
        ref={viewerRef}
        oldFile={oldFile}
        newFile={newFile}
        activePath={activePath}
        options={options}
        lineAnnotations={mergedAnnotations}
        renderAnnotation={renderAnnotation}
        renderHeaderMetadata={renderHeaderMetadata}
        selectedLines={comments.selectedRange}
        focusedLineNumber={focusedLineNumber}
        focusedLineIndex={focusedLineIndex}
        focusedLineKey={focusedLineKey}
      >
        <LspSymbolPeekContainer
          document={lspHoverDocument}
          containerRef={{
            get current() {
              return viewerRef.current?.getViewportElement() ?? null;
            },
          }}
        />
      </DiffViewer>
    </div>
  );
}
