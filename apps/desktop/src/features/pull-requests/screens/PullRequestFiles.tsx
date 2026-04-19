import { skipToken } from "@reduxjs/toolkit/query";
import { FileCode2, LoaderCircle } from "lucide-react";
import { useEffect } from "react";
import { useParams } from "react-router";

import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { ResizableSidebarLayout } from "@/components/layout/ResizableSidebarLayout";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { DiffWorkspace } from "@/features/diff-view/DiffWorkspace";
import {
  useGetPullRequestConversationQuery,
  useGetPullRequestFilesQuery,
  usePreparePullRequestCompareRefsQuery,
  useResolveHostedRepoQuery,
} from "@/features/hosted-repos/api";
import ReviewCommentsCopyToolbar from "@/features/pull-requests/components/ReviewCopyBar";
import { usePullRequestMentionCandidates } from "@/features/pull-requests/hooks/usePullRequestMentionCandidates";
import { usePullRequestReviewAnchors } from "@/features/pull-requests/hooks/usePullRequestReviewAnchors";
import FilesSidebar from "@/features/pull-requests/screens/PullRequestFileList";
import { setPullRequestPreviewActiveFilePath } from "@/features/pull-requests/pullRequestsSlice";
import { buildPullRequestAnchorAnnotations } from "@/features/pull-requests/utils/reviewAnchors";
import { useGetBranchFileVersionsQuery } from "@/features/source-control/api";
import { useThrottledDiffSelection } from "@/features/source-control/hooks/useThrottledDiffSelection";
import { errorMessageFrom } from "@/features/source-control/shared-utils/errorMessage";
import type {
  GitProviderId,
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
    selectFromResult: ({ data }) => ({
      hostedRepo: data ?? null,
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
          <div className="grid h-full min-h-0">
            <FilesDiffViewer
              providerId={providerId}
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
  providerId,
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
  providerId?: string;
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
  const selectedPath = useAppSelector((state) => state.pullRequests.previewActiveFilePath);
  const previewFileJumpTarget = useAppSelector((state) => state.pullRequests.previewFileJumpTarget);
  const { anchorsByFile } = usePullRequestReviewAnchors({
    repoPath,
    compareBaseRef,
    compareHeadRef,
    files,
    reviewThreads,
  });
  const commentMentions = usePullRequestMentionCandidates(conversation);
  const selectedFile = files.find((file) => file.path === selectedPath) ?? null;
  const previewSelection = useThrottledDiffSelection(
    selectedFile
      ? { path: selectedFile.path, previousPath: selectedFile.previousPath ?? undefined }
      : null,
  );
  const previewPath = previewSelection?.path ?? selectedFile?.path ?? "";
  const previewFile = files.find((file) => file.path === previewPath) ?? selectedFile;
  const hasCompareRefs = Boolean(compareBaseRef && compareHeadRef);

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

  const anchorAnnotations = previewFile
    ? buildPullRequestAnchorAnnotations({
        anchors: anchorsByFile[previewFile.path] ?? [],
        repoPath,
        pullRequestNumber,
        compareBaseRef,
        compareHeadRef,
        providerId: providerId as GitProviderId | undefined,
      })
    : [];
  const focusedLineNumber =
    previewFileJumpTarget && previewFileJumpTarget.path === previewPath
      ? previewFileJumpTarget.lineNumber
      : null;
  const focusedLineIndex =
    previewFileJumpTarget && previewFileJumpTarget.path === previewPath
      ? previewFileJumpTarget.lineIndex
      : null;
  const focusedLineKey =
    previewFileJumpTarget && previewFileJumpTarget.path === previewPath
      ? previewFileJumpTarget.focusKey
      : null;

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

  return (
    <div className="grid h-full min-h-0 min-w-0">
      <div className="flex h-full min-h-0 min-w-0 flex-col">
        <ReviewCommentsCopyToolbar
          repoPath={repoPath}
          pullRequestNumber={pullRequestNumber}
          compareBaseRef={compareBaseRef}
          compareHeadRef={compareHeadRef}
          activePath={previewFile?.path ?? selectedFile.path}
          activePreviousPath={previewFile?.previousPath ?? selectedFile.previousPath ?? undefined}
        />
        <DiffWorkspace
          oldFile={selectedOldFile}
          newFile={selectedNewFile}
          activePath={previewFile?.path ?? selectedFile.path}
          commentContext={{ kind: "review", baseRef: compareBaseRef, headRef: compareHeadRef }}
          canComment
          includeCurrentFileComments={false}
          fileViewerRevision={compareHeadRef}
          lspJumpContextKind="pull-request"
          focusedLineNumber={focusedLineNumber}
          focusedLineIndex={focusedLineIndex}
          focusedLineKey={focusedLineKey}
          annotationItems={anchorAnnotations}
          commentMentions={commentMentions}
        />
      </div>
    </div>
  );
}
