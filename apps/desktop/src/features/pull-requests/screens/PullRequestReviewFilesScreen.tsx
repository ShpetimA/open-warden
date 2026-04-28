import { skipToken } from "@reduxjs/toolkit/query";
import { useEffect } from "react";

import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { ResizableSidebarLayout } from "@/components/layout/ResizableSidebarLayout";
import { DiffWorkspace } from "@/features/diff-view/DiffWorkspace";
import { useGetPullRequestConversationQuery } from "@/features/hosted-repos/api";
import { LspStatusNotice } from "@/features/lsp/components/LspStatusNotice";
import { useCurrentLspDocument } from "@/features/lsp/hooks/useCurrentLspDocument";
import { useDiffDiagnostics } from "@/features/lsp/hooks/useDiffDiagnostics";
import ReviewCommentsCopyToolbar from "@/features/pull-requests/components/ReviewCopyBar";
import { PullRequestFilesSidebar } from "@/features/pull-requests/components/PullRequestFilesSidebar";
import { usePullRequestMentionCandidates } from "@/features/pull-requests/hooks/usePullRequestMentionCandidates";
import { usePullRequestReviewAnchors } from "@/features/pull-requests/hooks/usePullRequestReviewAnchors";
import {
  clearPullRequestFileJumpTarget,
  setPullRequestFilesViewMode,
} from "@/features/pull-requests/pullRequestsSlice";
import { buildPullRequestAnchorAnnotations } from "@/features/pull-requests/utils/reviewAnchors";
import {
  useGetBranchFilesQuery,
  useGetBranchFileVersionsQuery,
} from "@/features/source-control/api";
import { GeneralFileViewer } from "@/features/source-control/components/GeneralFileViewer";
import { useThrottledDiffSelection } from "@/features/source-control/hooks/useThrottledDiffSelection";
import { errorMessageFrom } from "@/features/source-control/shared-utils/errorMessage";
import type { FileItem } from "@/features/source-control/types";
import type { GitProviderId, PullRequestConversation } from "@/platform/desktop";

import {
  InactivePullRequestReviewPlaceholder,
  usePullRequestReviewSession,
} from "./PullRequestReviewShared";

const EMPTY_BRANCH_FILES: FileItem[] = [];

type PullRequestDiffPaneProps = {
  activeRepo: string;
  reviewRepoPath: string;
  reviewProviderId?: GitProviderId;
  pullRequestNumber: number;
  reviewBaseRef: string;
  reviewHeadRef: string;
  readyForDiff: boolean;
  branchFiles: FileItem[];
  conversation: PullRequestConversation | null;
  focusedLineNumber: number | null;
  focusedLineIndex: string | null;
  focusedLineKey: number | null;
};

function PullRequestDiffPane({
  activeRepo,
  reviewRepoPath,
  reviewProviderId,
  pullRequestNumber,
  reviewBaseRef,
  reviewHeadRef,
  readyForDiff,
  branchFiles,
  conversation,
  focusedLineNumber,
  focusedLineIndex,
  focusedLineKey,
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
  const previewPath = previewSelection?.path ?? reviewActivePath;
  const commentMentions = usePullRequestMentionCandidates(conversation);
  const { anchorsByFile } = usePullRequestReviewAnchors({
    repoPath: reviewRepoPath,
    compareBaseRef: reviewBaseRef,
    compareHeadRef: reviewHeadRef,
    files: branchFiles,
    reviewThreads: conversation?.reviewThreads ?? [],
  });
  const annotationItems = previewPath
    ? buildPullRequestAnchorAnnotations({
        anchors: anchorsByFile[previewPath] ?? [],
        repoPath: reviewRepoPath,
        pullRequestNumber,
        compareBaseRef: reviewBaseRef,
        compareHeadRef: reviewHeadRef,
        providerId: reviewProviderId,
      })
    : [];

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
  const lspText = !loadingPatch && newFile ? newFile.contents : null;
  const lspHoverDocument =
    activeRepo && previewPath && lspText !== null
      ? { repoPath: activeRepo, relPath: previewPath }
      : undefined;
  const lspDiagnostics = useDiffDiagnostics(activeRepo, previewPath ?? "");

  useCurrentLspDocument(activeRepo, previewPath ?? "", lspText);

  const hasContent = oldFile || newFile;

  return (
    <section className="flex h-full min-h-0 flex-col">
      <ReviewCommentsCopyToolbar
        repoPath={reviewRepoPath}
        pullRequestNumber={pullRequestNumber}
        compareBaseRef={reviewBaseRef}
        compareHeadRef={reviewHeadRef}
        activePath={previewPath ?? ""}
        activePreviousPath={previewSelection?.previousPath}
      />
      <div className="grid min-h-0 flex-1">
        {!reviewActivePath ? (
          <div className="text-muted-foreground p-3 text-sm">Select a file to view diff.</div>
        ) : (
          <div className="relative flex h-full min-h-0 min-w-0 flex-col" key="pr-diff-viewer">
            <LspStatusNotice repoPath={activeRepo} relPath={previewPath ?? ""} active />
            <DiffWorkspace
              oldFile={oldFile}
              newFile={newFile}
              activePath={previewPath ?? ""}
              commentContext={{ kind: "review", baseRef: reviewBaseRef, headRef: reviewHeadRef }}
              canComment
              includeCurrentFileComments={false}
              lspDiagnostics={lspDiagnostics}
              fileViewerRevision={reviewHeadRef}
              lspHoverDocument={lspHoverDocument}
              lspJumpContextKind="pull-request"
              focusedLineNumber={focusedLineNumber}
              focusedLineIndex={focusedLineIndex}
              focusedLineKey={focusedLineKey}
              annotationItems={annotationItems}
              commentMentions={commentMentions}
            />
            {errorMessage ? (
              <div className="absolute inset-0 z-10 flex items-start justify-start bg-background/80 p-3">
                <div className="text-destructive text-sm">{errorMessage}</div>
              </div>
            ) : loadingPatch ? (
              <div className="absolute inset-0 z-10 flex items-start justify-start bg-background/80 p-3">
                <div className="text-muted-foreground text-sm">Loading diff...</div>
              </div>
            ) : !hasContent ? (
              <div className="absolute inset-0 z-10 flex items-start justify-start bg-background/80 p-3">
                <div className="text-muted-foreground text-sm">No diff content.</div>
              </div>
            ) : null}
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

  const { conversation, reviewThreads } = useGetPullRequestConversationQuery(
    resolvedReview
      ? {
          repoPath: resolvedReview.repoPath,
          pullRequestNumber: resolvedReview.pullRequestNumber,
        }
      : skipToken,
    {
      selectFromResult: ({ data }) => ({
        conversation: data ?? null,
        reviewThreads: data?.reviewThreads ?? [],
      }),
      pollingInterval: 10000,
      refetchOnFocus: true,
      refetchOnReconnect: true,
    },
  );

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

  useEffect(() => {
    if (!fileJumpTarget || fileJumpTarget.path !== reviewActivePath) {
      return;
    }

    dispatch(clearPullRequestFileJumpTarget());
  }, [dispatch, fileJumpTarget, reviewActivePath]);

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
          reviewThreads={reviewThreads}
        />
      }
      content={
        showingPullRequestFileViewer ? (
          <GeneralFileViewer />
        ) : (
          <PullRequestDiffPane
            activeRepo={activeRepo}
            reviewRepoPath={resolvedReview.repoPath}
            reviewProviderId={resolvedReview.providerId}
            pullRequestNumber={resolvedReview.pullRequestNumber}
            reviewBaseRef={currentCompareBaseRef}
            reviewHeadRef={currentCompareHeadRef}
            readyForDiff={readyForDiff}
            branchFiles={branchFiles}
            conversation={conversation}
            focusedLineNumber={focusedLineNumber}
            focusedLineIndex={focusedLineIndex}
            focusedLineKey={focusedLineKey}
          />
        )
      }
    />
  );
}
