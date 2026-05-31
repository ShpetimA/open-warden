import { skipToken } from "@reduxjs/toolkit/query";
import { useEffect } from "react";

import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { ResizableSidebarLayout } from "@/components/layout/ResizableSidebarLayout";
import { useGetPullRequestConversationQuery } from "@/features/hosted-repos/api";
import { PullRequestCodeViewDiffPane } from "@/features/pull-requests/components/PullRequestCodeViewDiffPane";
import ReviewCommentsCopyToolbar from "@/features/pull-requests/components/ReviewCopyBar";
import { PullRequestFilesSidebar } from "@/features/pull-requests/components/PullRequestFilesSidebar";
import {
  clearPullRequestFileJumpTarget,
  setPullRequestFilesViewMode,
} from "@/features/pull-requests/pullRequestsSlice";
import { useGetBranchFilesQuery } from "@/features/source-control/api";
import { GeneralFileViewer } from "@/features/source-control/components/GeneralFileViewer";
import { setReviewActivePath } from "@/features/source-control/sourceControlSlice";
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
  const dispatch = useAppDispatch();
  const reviewActivePath = useAppSelector((state) => state.sourceControl.reviewActivePath);
  const selectedReviewFile = branchFiles.find((file) => file.path === reviewActivePath);

  return (
    <section className="flex h-full min-h-0 flex-col">
      <ReviewCommentsCopyToolbar
        repoPath={reviewRepoPath}
        pullRequestNumber={pullRequestNumber}
        compareBaseRef={reviewBaseRef}
        compareHeadRef={reviewHeadRef}
        activePath={reviewActivePath}
        activePreviousPath={selectedReviewFile?.previousPath ?? undefined}
      />
      <div className="grid min-h-0 flex-1">
        <PullRequestCodeViewDiffPane
          activeRepo={activeRepo}
          reviewRepoPath={reviewRepoPath}
          reviewProviderId={reviewProviderId}
          pullRequestNumber={pullRequestNumber}
          reviewBaseRef={reviewBaseRef}
          reviewHeadRef={reviewHeadRef}
          readyForDiff={readyForDiff}
          branchFiles={branchFiles}
          activePath={reviewActivePath}
          onSelectPath={(path) => dispatch(setReviewActivePath(path))}
          conversation={conversation}
          focusedLineNumber={focusedLineNumber}
          focusedLineIndex={focusedLineIndex}
          focusedLineKey={focusedLineKey}
        />
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
