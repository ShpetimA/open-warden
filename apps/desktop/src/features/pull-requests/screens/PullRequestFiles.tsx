import { PullRequestRevisionNotice } from "../refresh/PullRequestRevisionNotice";
import { useRetainPullRequestCommitRefresh } from "../refresh/PullRequestRefreshProvider";
import { ErrorState } from "@/components/ui/error-state";
import { skipToken } from "@reduxjs/toolkit/query";
import { FileCode2, LoaderCircle, Square, SquareCheckBig } from "lucide-react";
import { useEffect, useState } from "react";
import { useParams } from "react-router";

import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { Button } from "@/components/ui/button";
import { ListLoadingState } from "@/components/ui/list-loading-state";
import { Kbd } from "@/components/ui/kbd";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DiffWorkspace } from "@/features/diff-view/DiffWorkspace";
import {
  useGetPullRequestConversationQuery,
  useResolveHostedRepoQuery,
} from "@/features/hosted-repos/api";
import ReviewCommentsCopyToolbar from "@/features/pull-requests/components/ReviewCopyBar";
import { PullRequestCommitFileGroups } from "@/features/pull-requests/components/PullRequestCommitFileGroups";
import {
  PullRequestChangesSidebar,
  type PullRequestChangesView,
} from "@/features/pull-requests/components/PullRequestChangesSidebar";
import { usePullRequestComparison } from "@/features/pull-requests/hooks/usePullRequestComparison";
import { usePullRequestMentionCandidates } from "@/features/pull-requests/hooks/usePullRequestMentionCandidates";
import { usePullRequestReviewAnchors } from "@/features/pull-requests/hooks/usePullRequestReviewAnchors";
import { usePullRequestViewedFiles } from "@/features/pull-requests/hooks/usePullRequestViewedFiles";
import FilesSidebar from "@/features/pull-requests/screens/PullRequestFileList";
import { setPullRequestPreviewActiveFilePath } from "@/features/pull-requests/pullRequestsSlice";
import { buildPullRequestAnchorAnnotations } from "@/features/pull-requests/utils/reviewAnchors";
import {
  useGetBranchFilesQuery,
  useGetBranchFileVersionsQuery,
} from "@/features/source-control/api";
import { useThrottledDiffSelection } from "@/features/source-control/hooks/useThrottledDiffSelection";
import type { ReviewFileView } from "@/features/source-control/components/reviewFileGrouping";
import { errorMessageFrom } from "@/features/source-control/shared-utils/errorMessage";
import type {
  GitProviderId,
  FileItem,
  PullRequestChangedFile,
  PullRequestConversation,
  PullRequestReviewThread,
} from "@/platform/desktop";

function toChangedFile(file: FileItem): PullRequestChangedFile {
  return {
    ...file,
    // Local git comparisons provide the complete file set, but not GitHub's
    // per-file line totals. Those totals are only presentation metadata.
    additions: 0,
    deletions: 0,
    status:
      file.status === "untracked" || file.status === "type-changed" || file.status === "unmerged"
        ? "modified"
        : file.status,
  };
}

export const PullRequestFiles = () => {
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo);
  const { providerId, owner, repo, pullRequestNumber } = useParams();

  return (
    <PullRequestChanges
      key={`${activeRepo}:${providerId}:${owner}:${repo}:${pullRequestNumber}`}
      activeRepo={activeRepo}
      providerId={providerId}
      owner={owner}
      repo={repo}
      pullRequestNumber={pullRequestNumber}
    />
  );
};

function PullRequestChanges({
  activeRepo,
  providerId,
  owner,
  repo,
  pullRequestNumber,
}: {
  activeRepo: string;
  providerId: string | undefined;
  owner: string | undefined;
  repo: string | undefined;
  pullRequestNumber: string | undefined;
}) {
  const dispatch = useAppDispatch();
  const [view, setView] = useState<PullRequestChangesView>("files");
  const [selectedCommitId, setSelectedCommitId] = useState("");
  const [grouping, setGrouping] = useState<ReviewFileView | "commits">("review");
  const groupedByCommit = view === "files" && grouping === "commits";
  const reviewingCommit = view === "commits" || groupedByCommit;

  const parsedPullRequestNumber = Number.parseInt(pullRequestNumber ?? "", 10);
  const hasValidRoute = Boolean(
    providerId &&
    owner &&
    repo &&
    Number.isFinite(parsedPullRequestNumber) &&
    parsedPullRequestNumber > 0,
  );

  const {
    hostedRepo,
    hostedRepoError,
    hostedRepoFailure,
    resolvingHostedRepo,
    refetch: retryHostedRepo,
  } = useResolveHostedRepoQuery(activeRepo, {
    skip: !activeRepo,
    selectFromResult: ({ currentData, error, isFetching }) => ({
      hostedRepo: currentData ?? null,
      hostedRepoError: currentData ? "" : errorMessageFrom(error, ""),
      hostedRepoFailure: error,
      resolvingHostedRepo: isFetching && !currentData,
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

  const { conversation, reviewThreads } = useGetPullRequestConversationQuery(filesQueryArg, {
    selectFromResult: ({ currentData: data }) => ({
      conversation: data ?? null,
      reviewThreads: data?.reviewThreads ?? [],
    }),
  });
  const comparison = usePullRequestComparison(filesQueryArg, {
    commits: reviewingCommit,
    groups: groupedByCommit,
  });
  const commits = comparison.commits ?? [];
  const selectedCommit = reviewingCommit
    ? (commits.find((commit) => commit.commitId === selectedCommitId) ?? commits[0] ?? null)
    : null;
  const selectedGroup = comparison.groups?.find(
    (group) => group.commit.commitId === selectedCommit?.commitId,
  );
  useRetainPullRequestCommitRefresh(
    filesQueryArg === skipToken ? null : filesQueryArg,
    reviewingCommit && !groupedByCommit ? selectedCommit?.commitId : undefined,
  );
  const compareBaseRef = selectedCommit
    ? `${selectedCommit.commitId}^`
    : (comparison.refs?.compareBaseRef ?? "");
  const compareHeadRef = selectedCommit?.commitId ?? comparison.refs?.compareHeadRef ?? "";
  const commitFilesQuery = useGetBranchFilesQuery(
    selectedCommit && activeRepo && !groupedByCommit
      ? { repoPath: activeRepo, baseRef: compareBaseRef, headRef: compareHeadRef }
      : skipToken,
  );
  const commitsError = comparison.error;
  const commitsLoading =
    reviewingCommit && !commitsError && (!comparison.refs || !comparison.commits);
  const comparisonFiles = groupedByCommit
    ? selectedGroup?.files
    : reviewingCommit
      ? commitFilesQuery.currentData
      : comparison.files;
  const files = (comparisonFiles ?? []).map(toChangedFile);
  const filesError =
    hostedRepoError ||
    comparison.error ||
    (reviewingCommit ? commitsError || errorMessageFrom(commitFilesQuery.error, "") : "");
  const filesLoading =
    resolvingHostedRepo ||
    (reviewingCommit
      ? commitsLoading || Boolean(selectedCommit && !comparisonFiles && !filesError)
      : comparison.loading);
  function retryFiles() {
    if (hostedRepoError) {
      void retryHostedRepo();
      return;
    }
    if (comparison.error || !comparison.refs) {
      comparison.retry();
      return;
    }
    if (selectedCommit) {
      void commitFilesQuery.refetch();
      return;
    }
    comparison.retry();
  }
  const filesFailure = hostedRepoFailure ?? comparison.failure ?? commitFilesQuery.error;
  const viewedState = usePullRequestViewedFiles({
    repoPath: activeRepo ?? "",
    pullRequestNumber: parsedPullRequestNumber,
    headSha: conversation?.detail.headSha ?? "",
  });

  return (
    <>
      <PullRequestPreviewActiveFileSync files={files} />
      <PullRequestRevisionNotice stale={comparison.stale} hasContent={Boolean(comparison.refs)} />
      <PullRequestChangesSidebar
        view={view}
        onViewChange={setView}
        commits={commits}
        selectedCommit={selectedCommit}
        onCommitSelect={(commit) => setSelectedCommitId(commit.commitId)}
        commitsLoading={commitsLoading && !filesError}
        commitsError={filesFailure}
        onRetryCommits={retryFiles}
        filesPane={
          groupedByCommit ? (
            <PullRequestCommitFileGroups
              groups={comparison.groups ?? []}
              selectedCommit={selectedCommit}
              loading={filesLoading}
              error={filesError}
              onRetry={retryFiles}
              onGroupingChange={setGrouping}
              onSelect={(commit, file) => {
                setSelectedCommitId(commit.commitId);
                dispatch(setPullRequestPreviewActiveFilePath(file.path));
              }}
            />
          ) : (
            <FilesSidebar
              files={files}
              repoPath={activeRepo ?? ""}
              pullRequestNumber={parsedPullRequestNumber}
              compareBaseRef={compareBaseRef}
              compareHeadRef={compareHeadRef}
              filesError={filesError}
              failure={filesFailure}
              onRetry={retryFiles}
              isLoading={filesLoading}
              viewedState={!reviewingCommit && !comparison.stale ? viewedState : null}
              keyboardNavigationEnabled={view === "files"}
              fileView={grouping === "commits" ? "review" : grouping}
              onFileViewChange={setGrouping}
              onGroupByCommit={view === "files" ? () => setGrouping("commits") : undefined}
              commitTitle={selectedCommit?.summary}
              commitId={selectedCommit?.commitId}
            />
          )
        }
      >
        <div className="grid h-full min-h-0">
          <FilesDiffViewer
            providerId={providerId}
            repoPath={activeRepo ?? ""}
            pullRequestNumber={parsedPullRequestNumber}
            compareBaseRef={compareBaseRef}
            compareHeadRef={compareHeadRef}
            filesError={filesError}
            onRetryFiles={retryFiles}
            filesLoading={filesLoading}
            files={files}
            canComment={!comparison.stale}
            conversation={comparison.conversation ?? conversation}
            reviewThreads={!reviewingCommit && !comparison.stale ? reviewThreads : []}
            viewedState={!reviewingCommit && !comparison.stale ? viewedState : null}
          />
        </div>
      </PullRequestChangesSidebar>
    </>
  );
}

function PullRequestPreviewActiveFileSync({ files }: { files: PullRequestChangedFile[] }) {
  const dispatch = useAppDispatch();
  const activeFilePath = useAppSelector((state) => state.pullRequests.previewActiveFilePath);

  useEffect(() => {
    if (files.length === 0 && activeFilePath) {
      dispatch(setPullRequestPreviewActiveFilePath(""));
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
  filesError,
  onRetryFiles,
  filesLoading,
  files,
  canComment,
  conversation,
  reviewThreads,
  viewedState,
}: {
  providerId?: string;
  repoPath: string;
  pullRequestNumber: number;
  compareBaseRef: string;
  compareHeadRef: string;
  filesError: string;
  onRetryFiles: () => void;
  filesLoading: boolean;
  files: PullRequestChangedFile[];
  canComment: boolean;
  conversation: PullRequestConversation | null;
  reviewThreads: PullRequestReviewThread[];
  viewedState: ReturnType<typeof usePullRequestViewedFiles> | null;
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

  const branchFileVersions = branchFileVersionsQuery.currentData ?? null;
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

  if (filesLoading && files.length === 0) {
    return <ListLoadingState label="Loading changed files…" />;
  }
  if (filesError && files.length === 0) {
    return (
      <ErrorState
        title="Couldn’t load this PR comparison"
        error={undefined}
        message={filesError}
        recovery={{ label: "Retry", onAction: onRetryFiles }}
      />
    );
  }

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
      <ErrorState
        title="Couldn’t load this diff"
        error={branchFileVersionsQuery.error}
        busy={branchFileVersionsQuery.isFetching}
        recovery={{
          label: "Retry",
          onAction: () => {
            void branchFileVersionsQuery.refetch();
          },
        }}
      />
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
        {viewedState ? (
          <ReviewCommentsCopyToolbar
            repoPath={repoPath}
            pullRequestNumber={pullRequestNumber}
            compareBaseRef={compareBaseRef}
            compareHeadRef={compareHeadRef}
            activePath={previewFile?.path ?? selectedFile.path}
            activePreviousPath={previewFile?.previousPath ?? selectedFile.previousPath ?? undefined}
          />
        ) : null}
        <DiffWorkspace
          modeChange={branchFileVersions?.modeChange}
          oldFile={selectedOldFile}
          newFile={selectedNewFile}
          activePath={previewFile?.path ?? selectedFile.path}
          headerAction={
            viewedState ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      size="icon-xs"
                      variant={
                        viewedState.viewedPaths.has(previewFile?.path ?? selectedFile.path)
                          ? "secondary"
                          : "ghost"
                      }
                      disabled={!viewedState.viewedFiles || viewedState.changingViewed}
                      aria-label={
                        viewedState.viewedPaths.has(previewFile?.path ?? selectedFile.path)
                          ? "Mark file unviewed"
                          : "Mark file viewed"
                      }
                      onClick={() =>
                        void viewedState.toggleViewed(previewFile?.path ?? selectedFile.path)
                      }
                    >
                      {viewedState.viewedPaths.has(previewFile?.path ?? selectedFile.path) ? (
                        <SquareCheckBig />
                      ) : (
                        <Square />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="flex items-center gap-2">
                    {viewedState.viewedPaths.has(previewFile?.path ?? selectedFile.path)
                      ? "Mark file unviewed"
                      : "Mark file viewed"}
                    <Kbd>V</Kbd>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : null
          }
          commentContext={{ kind: "review", baseRef: compareBaseRef, headRef: compareHeadRef }}
          canComment={canComment && Boolean(viewedState)}
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
