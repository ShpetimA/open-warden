import { skipToken } from "@reduxjs/toolkit/query";
import { FileCode2, LoaderCircle } from "lucide-react";
import { useEffect } from "react";
import { useParams } from "react-router";
import { toast } from "sonner";

import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { ResizableSidebarLayout } from "@/components/layout/ResizableSidebarLayout";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { removeCommentsByIds } from "@/features/comments/commentsSlice";
import { DiffWorkspace } from "@/features/diff-view/DiffWorkspace";
import {
  useGetPullRequestConversationQuery,
  useGetPullRequestFilesQuery,
  usePreparePullRequestCompareRefsQuery,
  useResolveHostedRepoQuery,
  useSubmitPullRequestReviewCommentsMutation,
} from "@/features/hosted-repos/api";
import ReviewCommentsCopyToolbar from "@/features/pull-requests/components/ReviewCopyBar";
import { usePullRequestMentionCandidates } from "@/features/pull-requests/hooks/usePullRequestMentionCandidates";
import FilesSidebar from "@/features/pull-requests/screens/PullRequestFileList";
import { setPullRequestPreviewActiveFilePath } from "@/features/pull-requests/pullRequestsSlice";
import { buildSubmitPullRequestReviewCommentsInput } from "@/features/pull-requests/utils/pendingReviewComments";
import { buildPullRequestReviewCommentsPayload } from "@/features/pull-requests/utils/reviewCommentsPayload";
import { buildPullRequestThreadAnnotations } from "@/features/pull-requests/utils/reviewThreadAnnotations";
import { useGetBranchFileVersionsQuery } from "@/features/source-control/api";
import { useThrottledDiffSelection } from "@/features/source-control/hooks/useThrottledDiffSelection";
import { errorMessageFrom } from "@/features/source-control/shared-utils/errorMessage";
import type { CommentItem } from "@/features/source-control/types";
import type {
  PullRequestChangedFile,
  PullRequestConversation,
  PullRequestReviewThread,
} from "@/platform/desktop";

export const PullRequestFiles = () => {
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo);
  const { providerId, owner, repo, pullRequestNumber } = useParams();

  const parsedPullRequestNumber = Number.parseInt(pullRequestNumber ?? "", 10);
  const hasValidRoute = Boolean(
    providerId &&
    owner &&
    repo &&
    Number.isFinite(parsedPullRequestNumber) &&
    parsedPullRequestNumber > 0,
  );

  const { hostedRepo } = useResolveHostedRepoQuery(activeRepo, {
    skip: !activeRepo,
    selectFromResult: ({ data, isLoading, isFetching }) => ({
      hostedRepo: data ?? null,
      resolvingHostedRepo: isLoading || isFetching,
    }),
  });

  const routeMatchesActiveRepo = Boolean(
    hostedRepo &&
    providerId &&
    owner &&
    repo &&
    hostedRepo.providerId === providerId &&
    hostedRepo.owner === owner &&
    hostedRepo.repo === repo,
  );

  const filesQueryArg =
    activeRepo && hasValidRoute && routeMatchesActiveRepo
      ? { repoPath: activeRepo, pullRequestNumber: parsedPullRequestNumber }
      : skipToken;

  const { compareRefs, compareRefsError, isLoadingCompareRefs } =
    usePreparePullRequestCompareRefsQuery(filesQueryArg, {
      selectFromResult: ({ data, error, isLoading, isFetching }) => ({
        compareRefs: data ?? null,
        compareRefsError: data ? "" : errorMessageFrom(error, ""),
        isLoadingCompareRefs: isLoading || isFetching,
      }),
    });

  const { files, filesError, isLoadingFiles } = useGetPullRequestFilesQuery(filesQueryArg, {
    selectFromResult: ({ data, error, isLoading, isFetching }) => ({
      files: data ?? [],
      filesError: data ? "" : errorMessageFrom(error, ""),
      isLoadingFiles: isLoading || isFetching,
    }),
  });

  const { conversation, reviewThreads } = useGetPullRequestConversationQuery(filesQueryArg, {
    selectFromResult: ({ data }) => ({
      conversation: data ?? null,
      reviewThreads: data?.reviewThreads ?? [],
    }),
    pollingInterval: 10000,
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });

  return (
    <>
      <PullRequestPreviewActiveFileSync files={files} />
      <ResizableSidebarLayout
        sidebarDefaultSize={24}
        sidebarMinSize={16}
        sidebarMaxSize={36}
        sidebar={
          <FilesSidebar
            files={files}
            repoPath={activeRepo ?? ""}
            pullRequestNumber={parsedPullRequestNumber}
            compareBaseRef={compareRefs?.compareBaseRef ?? ""}
            compareHeadRef={compareRefs?.compareHeadRef ?? ""}
            filesError={filesError}
            isLoading={isLoadingFiles}
          />
        }
        content={
          <div className="h-full min-h-0">
            <FilesDiffViewer
              repoPath={activeRepo ?? ""}
              pullRequestNumber={parsedPullRequestNumber}
              compareBaseRef={compareRefs?.compareBaseRef ?? ""}
              compareHeadRef={compareRefs?.compareHeadRef ?? ""}
              compareRefsError={compareRefsError}
              isLoadingCompareRefs={isLoadingCompareRefs}
              files={files}
              conversation={conversation}
              reviewThreads={reviewThreads}
            />
          </div>
        }
      />
    </>
  );
};

function PullRequestPreviewActiveFileSync({ files }: { files: PullRequestChangedFile[] }) {
  const dispatch = useAppDispatch();
  const activeFilePath = useAppSelector((state) => state.pullRequests.previewActiveFilePath);

  useEffect(() => {
    const hasMatchingActiveFile = Boolean(
      activeFilePath && files.some((file) => file.path === activeFilePath),
    );

    if (files.length === 0) {
      if (activeFilePath) {
        dispatch(setPullRequestPreviewActiveFilePath(""));
      }
      return;
    }

    if (!hasMatchingActiveFile) {
      dispatch(setPullRequestPreviewActiveFilePath(files[0].path));
    }
  }, [activeFilePath, dispatch, files]);

  return null;
}

function FilesDiffViewer({
  repoPath,
  pullRequestNumber,
  compareBaseRef,
  compareHeadRef,
  compareRefsError,
  isLoadingCompareRefs,
  files,
  conversation,
  reviewThreads,
}: {
  repoPath: string;
  pullRequestNumber: number;
  compareBaseRef: string;
  compareHeadRef: string;
  compareRefsError: string;
  isLoadingCompareRefs: boolean;
  files: PullRequestChangedFile[];
  conversation: PullRequestConversation | null;
  reviewThreads: PullRequestReviewThread[];
}) {
  const dispatch = useAppDispatch();
  const selectedPath = useAppSelector((state) => state.pullRequests.previewActiveFilePath);
  const comments = useAppSelector((state) => state.comments);
  const pendingReviewComments =
    !repoPath || !compareBaseRef || !compareHeadRef
      ? ([] as CommentItem[])
      : comments.filter(
          (comment) =>
            comment.repoPath === repoPath &&
            (comment.contextKind ?? "changes") === "review" &&
            comment.baseRef === compareBaseRef &&
            comment.headRef === compareHeadRef,
        );
  const [submitPullRequestReviewComments, { isLoading: isSubmittingReviewComments }] =
    useSubmitPullRequestReviewCommentsMutation();
  const commentMentions = usePullRequestMentionCandidates(conversation);
  const selectedFile = files.find((file) => file.path === selectedPath) ?? null;
  const previewPath = useThrottledDiffSelection(selectedFile?.path ?? null);
  const previewFile = files.find((file) => file.path === previewPath) ?? selectedFile;
  const allReviewCommentsPayload = buildPullRequestReviewCommentsPayload({ reviewThreads });
  const hasCompareRefs = Boolean(compareBaseRef && compareHeadRef);
  const reviewCommentContext =
    hasCompareRefs && compareBaseRef && compareHeadRef
      ? { kind: "review" as const, baseRef: compareBaseRef, headRef: compareHeadRef }
      : null;
  const filePendingReviewComments = previewFile
    ? pendingReviewComments.filter((comment) => comment.filePath === previewFile.path)
    : [];
  const pendingReviewCommentCount = pendingReviewComments.length;

  const branchFileVersionsQuery = useGetBranchFileVersionsQuery(
    previewPath && hasCompareRefs && previewFile
      ? {
          repoPath,
          baseRef: compareBaseRef,
          headRef: compareHeadRef,
          relPath: previewPath,
          previousPath: previewFile.previousPath ?? undefined,
        }
      : skipToken,
  );

  const branchFileVersions =
    branchFileVersionsQuery.currentData ?? branchFileVersionsQuery.data ?? null;
  const selectedOldFile = branchFileVersions?.oldFile ?? null;
  const selectedNewFile = branchFileVersions?.newFile ?? null;
  const branchFileVersionsError = branchFileVersions
    ? ""
    : errorMessageFrom(branchFileVersionsQuery.error, "");
  const isLoadingBranchFileVersions =
    Boolean(previewPath && hasCompareRefs && !branchFileVersions) &&
    (branchFileVersionsQuery.isUninitialized ||
      branchFileVersionsQuery.isLoading ||
      branchFileVersionsQuery.isFetching);

  const threadAnnotations = previewFile
    ? buildPullRequestThreadAnnotations({
        repoPath,
        pullRequestNumber,
        path: previewFile.path,
        previousPath: previewFile.previousPath,
        reviewThreads,
      })
    : [];
  const fileReviewCommentsPayload = previewFile
    ? buildPullRequestReviewCommentsPayload({
        reviewThreads,
        path: previewFile.path,
        previousPath: previewFile.previousPath,
      })
    : "";

  if (files.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <Empty className="border-0 bg-transparent">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileCode2 className="h-5 w-5" />
            </EmptyMedia>
            <EmptyTitle>No changed files</EmptyTitle>
            <EmptyDescription>
              This pull request does not expose changed files yet.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  if (!selectedFile) {
    return (
      <div className="flex h-full items-center justify-center">
        <Empty className="border-0 bg-transparent">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileCode2 className="h-5 w-5" />
            </EmptyMedia>
            <EmptyTitle>Select a file</EmptyTitle>
            <EmptyDescription>Choose a file from the sidebar to view its diff.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  if (!hasCompareRefs && isLoadingCompareRefs) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoaderCircle className="text-muted-foreground h-5 w-5 animate-spin" />
        <span className="text-muted-foreground ml-2 text-sm">Preparing compare refs...</span>
      </div>
    );
  }

  if (!hasCompareRefs && compareRefsError) {
    return (
      <div className="text-destructive rounded-2xl border border-red-500/20 bg-red-500/8 px-4 py-3 text-sm">
        {compareRefsError}
      </div>
    );
  }

  if (isLoadingBranchFileVersions) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoaderCircle className="text-muted-foreground h-5 w-5 animate-spin" />
        <span className="text-muted-foreground ml-2 text-sm">Loading diff...</span>
      </div>
    );
  }

  if (branchFileVersionsError) {
    return (
      <div className="text-destructive rounded-2xl border border-red-500/20 bg-red-500/8 px-4 py-3 text-sm">
        {branchFileVersionsError}
      </div>
    );
  }

  if (!selectedOldFile && !selectedNewFile) {
    return (
      <div className="flex h-full items-center justify-center">
        <Empty className="border-0 bg-transparent">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileCode2 className="h-5 w-5" />
            </EmptyMedia>
            <EmptyTitle>Diff unavailable</EmptyTitle>
            <EmptyDescription>
              This file may be binary or the prepared refs did not return file contents.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  const submitAllComments = async () => {
    if (!repoPath || pullRequestNumber <= 0 || pendingReviewComments.length === 0) {
      return;
    }

    try {
      const result = await submitPullRequestReviewComments(
        buildSubmitPullRequestReviewCommentsInput({
          repoPath,
          pullRequestNumber,
          comments: pendingReviewComments,
        }),
      ).unwrap();

      if (result.submittedDraftIds.length > 0) {
        dispatch(removeCommentsByIds(result.submittedDraftIds));
      }

      if (result.failedMessage) {
        if (result.submittedDraftIds.length > 0) {
          toast.error(
            `Submitted ${result.submittedDraftIds.length} comment${result.submittedDraftIds.length === 1 ? "" : "s"}, then stopped: ${result.failedMessage}`,
          );
        } else {
          toast.error(result.failedMessage);
        }
        return;
      }

      toast.success(
        `Submitted ${result.submittedDraftIds.length} pending comment${result.submittedDraftIds.length === 1 ? "" : "s"}`,
      );
    } catch (error) {
      toast.error(errorMessageFrom(error, "Failed to submit review comments"));
    }
  };

  return (
    <div className="grid h-full min-h-0 min-w-0">
      <div className="flex h-full min-h-0 min-w-0 flex-col">
        <ReviewCommentsCopyToolbar
          filePayload={fileReviewCommentsPayload}
          allPayload={allReviewCommentsPayload}
          filePendingCommentCount={filePendingReviewComments.length}
          totalPendingCommentCount={pendingReviewCommentCount}
          canSubmitComments={Boolean(reviewCommentContext) && pendingReviewCommentCount > 0}
          isSubmittingComments={isSubmittingReviewComments}
          onSubmitAllComments={
            pendingReviewCommentCount > 0
              ? () => {
                  void submitAllComments();
                }
              : undefined
          }
        />
        <DiffWorkspace
          oldFile={selectedOldFile}
          newFile={selectedNewFile}
          activePath={previewFile?.path ?? selectedFile.path}
          commentContext={
            reviewCommentContext ?? {
              kind: "review",
              baseRef: compareBaseRef,
              headRef: compareHeadRef,
            }
          }
          canComment={Boolean(reviewCommentContext)}
          fileViewerRevision={compareHeadRef}
          lspJumpContextKind="pull-request"
          annotationItems={threadAnnotations}
          commentMentions={commentMentions}
        />
      </div>
    </div>
  );
}
