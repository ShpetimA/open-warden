import { skipToken } from "@reduxjs/toolkit/query";
import type { DiffLineAnnotation } from "@pierre/diffs";
import { useEffect } from "react";

import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { ResizableSidebarLayout } from "@/components/layout/ResizableSidebarLayout";
import { DiffWorkspace } from "@/features/diff-view/DiffWorkspace";
import { useGetPullRequestConversationQuery } from "@/features/hosted-repos/api";
import { LspStatusNotice } from "@/features/lsp/components/LspStatusNotice";
import { useCurrentLspDocument } from "@/features/lsp/hooks/useCurrentLspDocument";
import { useDiffDiagnostics } from "@/features/lsp/hooks/useDiffDiagnostics";
import {
  useGetBranchFilesQuery,
  useGetBranchFileVersionsQuery,
} from "@/features/source-control/api";
import { GeneralFileViewer } from "@/features/source-control/components/GeneralFileViewer";
import { useThrottledDiffSelection } from "@/features/source-control/hooks/useThrottledDiffSelection";
import { errorMessageFrom } from "@/features/source-control/shared-utils/errorMessage";
import type { DiffAnnotationItem, FileItem } from "@/features/source-control/types";
import { setPullRequestFilesViewMode } from "@/features/pull-requests/pullRequestsSlice";
import { PullRequestFilesSidebar } from "@/features/pull-requests/components/PullRequestFilesSidebar";
import type { PullRequestReviewThread } from "@/platform/desktop";

import { InactivePullRequestReviewPlaceholder, usePullRequestReviewSession } from "./PullRequestReviewShared";

const EMPTY_BRANCH_FILES: FileItem[] = [];

function buildReviewThreadAnnotations(
  repoPath: string,
  pullRequestNumber: number,
  activePath: string,
  reviewThreads: PullRequestReviewThread[],
): DiffLineAnnotation<DiffAnnotationItem>[] {
  return reviewThreads
    .filter((thread) => thread.path === activePath)
    .flatMap((thread) => {
      const lineNumber = thread.line ?? thread.startLine;
      if (!lineNumber) {
        return [];
      }

      return [
        {
          lineNumber,
          side: thread.diffSide === "LEFT" ? "deletions" : "additions",
          metadata: {
            type: "pull-request-thread",
            thread,
            repoPath,
            pullRequestNumber,
          },
        } satisfies DiffLineAnnotation<DiffAnnotationItem>,
      ];
    });
}

type PullRequestDiffPaneProps = {
  activeRepo: string;
  reviewBaseRef: string;
  reviewHeadRef: string;
  readyForDiff: boolean;
  branchFiles: FileItem[];
  focusedLineNumber: number | null;
  focusedLineIndex: string | null;
  focusedLineKey: number | null;
  annotationItems: DiffLineAnnotation<DiffAnnotationItem>[];
};

function PullRequestDiffPane({
  activeRepo,
  reviewBaseRef,
  reviewHeadRef,
  readyForDiff,
  branchFiles,
  focusedLineNumber,
  focusedLineIndex,
  focusedLineKey,
  annotationItems,
}: PullRequestDiffPaneProps) {
  const reviewActivePath = useAppSelector((state) => state.sourceControl.reviewActivePath);
  const selectedReviewFile = branchFiles.find((file) => file.path === reviewActivePath);
  const previewSelection = useThrottledDiffSelection(
    reviewActivePath
      ? {
          path: reviewActivePath,
          previousPath: selectedReviewFile?.previousPath ?? undefined,
        }
      : null,
  );
  const branchFileVersionsQuery = useGetBranchFileVersionsQuery(
    readyForDiff && previewSelection
      ? {
          repoPath: activeRepo,
          baseRef: reviewBaseRef,
          headRef: reviewHeadRef,
          relPath: previewSelection.path,
          previousPath: previewSelection.previousPath,
        }
      : skipToken,
  );

  const reviewVersions = branchFileVersionsQuery.currentData ?? branchFileVersionsQuery.data;
  const oldFile = reviewVersions?.oldFile ?? null;
  const newFile = reviewVersions?.newFile ?? null;
  const loadingPatch = !reviewVersions && branchFileVersionsQuery.isLoading;
  const errorMessage = reviewVersions ? "" : errorMessageFrom(branchFileVersionsQuery.error, "");
  const previewPath = previewSelection?.path ?? "";
  const lspText = !loadingPatch && newFile ? newFile.contents : null;
  const lspHoverDocument =
    activeRepo && previewPath && lspText !== null
      ? { repoPath: activeRepo, relPath: previewPath }
      : undefined;
  const lspDiagnostics = useDiffDiagnostics(activeRepo, previewPath);

  useCurrentLspDocument(activeRepo, previewPath, lspText);

  return (
    <section className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1">
        {errorMessage ? (
          <div className="text-destructive p-3 text-sm">{errorMessage}</div>
        ) : loadingPatch ? (
          <div className="text-muted-foreground p-3 text-sm">Loading diff...</div>
        ) : !reviewActivePath ? (
          <div className="text-muted-foreground p-3 text-sm">Select a file to view diff.</div>
        ) : !oldFile && !newFile ? (
          <div className="text-muted-foreground p-3 text-sm">No diff content.</div>
        ) : (
          <div className="flex h-full min-h-0 min-w-0 flex-col">
            <LspStatusNotice repoPath={activeRepo} relPath={previewPath} active />
            <DiffWorkspace
              oldFile={oldFile}
              newFile={newFile}
              activePath={previewPath}
              commentContext={{ kind: "review", baseRef: reviewBaseRef, headRef: reviewHeadRef }}
              canComment
              lspDiagnostics={lspDiagnostics}
              fileViewerRevision={reviewHeadRef}
              lspHoverDocument={lspHoverDocument}
              lspJumpContextKind="pull-request"
              focusedLineNumber={focusedLineNumber}
              focusedLineIndex={focusedLineIndex}
              focusedLineKey={focusedLineKey}
              annotationItems={annotationItems}
            />
          </div>
        )}
      </div>
    </section>
  );
}

export function PullRequestReviewFilesScreen() {
  const dispatch = useAppDispatch();
  const reviewActivePath = useAppSelector((state) => state.sourceControl.reviewActivePath);
  const filesViewMode = useAppSelector((state) => state.pullRequests.filesViewMode);
  const fileJumpTarget = useAppSelector((state) => state.pullRequests.fileJumpTarget);
  const fileViewerTarget = useAppSelector((state) => state.sourceControl.fileViewerTarget);

  const { activeRepo, resolvedReview } = usePullRequestReviewSession();

  const currentCompareBaseRef = resolvedReview?.compareBaseRef ?? "";
  const currentCompareHeadRef = resolvedReview?.compareHeadRef ?? "";
  const readyForDiff = Boolean(
    resolvedReview && activeRepo && currentCompareBaseRef && currentCompareHeadRef,
  );

  const { branchFiles, hasBranchFilesData, isLoadingBranchFiles } = useGetBranchFilesQuery(
    readyForDiff
      ? { repoPath: activeRepo, baseRef: currentCompareBaseRef, headRef: currentCompareHeadRef }
      : skipToken,
    {
      selectFromResult: ({ data, isLoading }) => ({
        branchFiles: data ?? EMPTY_BRANCH_FILES,
        hasBranchFilesData: Boolean(data),
        isLoadingBranchFiles: isLoading,
      }),
    },
  );

  const { reviewThreads } = useGetPullRequestConversationQuery(
    resolvedReview
      ? {
          repoPath: resolvedReview.repoPath,
          pullRequestNumber: resolvedReview.pullRequestNumber,
        }
      : skipToken,
    {
      selectFromResult: ({ data }) => ({
        reviewThreads: data?.reviewThreads ?? [],
      }),
      pollingInterval: 10000,
      refetchOnFocus: true,
      refetchOnReconnect: true,
    },
  );

  const threadAnnotations = resolvedReview
    ? buildReviewThreadAnnotations(
        resolvedReview.repoPath,
        resolvedReview.pullRequestNumber,
        reviewActivePath,
        reviewThreads,
      )
    : [];

  const focusedLineNumber =
    fileJumpTarget && fileJumpTarget.path === reviewActivePath ? fileJumpTarget.lineNumber : null;
  const focusedLineIndex =
    fileJumpTarget && fileJumpTarget.path === reviewActivePath ? fileJumpTarget.lineIndex : null;
  const focusedLineKey =
    fileJumpTarget && fileJumpTarget.path === reviewActivePath ? fileJumpTarget.focusKey : null;

  const showingPullRequestFileViewer =
    fileViewerTarget?.returnToDiff?.kind === "pull-request" &&
    (fileViewerTarget.returnToDiff.repoPath === activeRepo ||
      fileViewerTarget.returnToDiff.repoPath === resolvedReview?.repoPath);

  useEffect(() => {
    if (
      fileViewerTarget?.returnToDiff?.kind === "pull-request" &&
      fileViewerTarget.returnToDiff.repoPath === activeRepo &&
      filesViewMode !== "files"
    ) {
      dispatch(setPullRequestFilesViewMode("files"));
    }
  }, [activeRepo, dispatch, fileViewerTarget, filesViewMode]);

  if (!resolvedReview) {
    return <InactivePullRequestReviewPlaceholder />;
  }

  return (
    <ResizableSidebarLayout
      panelId="primary"
      sidebarDefaultSize={24}
      sidebarMinSize={16}
      sidebarMaxSize={40}
      sidebar={
        <PullRequestFilesSidebar
          activeRepo={activeRepo}
          review={resolvedReview}
          readyForDiff={readyForDiff}
          branchFiles={branchFiles}
          hasBranchFilesData={hasBranchFilesData}
          isLoadingBranchFiles={isLoadingBranchFiles}
        />
      }
      content={
        showingPullRequestFileViewer ? (
          <GeneralFileViewer />
        ) : (
          <PullRequestDiffPane
            activeRepo={activeRepo}
            reviewBaseRef={currentCompareBaseRef}
            reviewHeadRef={currentCompareHeadRef}
            readyForDiff={readyForDiff}
            branchFiles={branchFiles}
            focusedLineNumber={focusedLineNumber}
            focusedLineIndex={focusedLineIndex}
            focusedLineKey={focusedLineKey}
            annotationItems={threadAnnotations}
          />
        )
      }
    />
  );
}
