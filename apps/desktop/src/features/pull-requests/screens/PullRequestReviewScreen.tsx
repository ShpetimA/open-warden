import { skipToken } from "@reduxjs/toolkit/query";
import { type ComponentType, useEffect } from "react";
import { useParams } from "react-router";
import { GitPullRequest, MessagesSquare, ShieldCheck } from "lucide-react";

import { useAppDispatch, useAppSelector } from "@/app/hooks";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { DiffWorkspace } from "@/features/diff-view/DiffWorkspace";
import { LspStatusNotice } from "@/features/lsp/components/LspStatusNotice";
import { useCurrentLspDocument } from "@/features/lsp/hooks/useCurrentLspDocument";
import { useDiffDiagnostics } from "@/features/lsp/hooks/useDiffDiagnostics";
import {
  useGetPullRequestConversationQuery,
  useResolvePullRequestWorkspaceQuery,
} from "@/features/hosted-repos/api";
import { PullRequestConversationTab } from "@/features/pull-requests/components/PullRequestConversationTab";
import {
  useGetBranchFilesQuery,
  useGetBranchFileVersionsQuery,
} from "@/features/source-control/api";
import { GeneralFileViewer } from "@/features/source-control/components/GeneralFileViewer";
import { usePrefetchReviewDiffs } from "@/features/source-control/hooks/usePrefetchNearbyDiffs";
import { useThrottledDiffSelection } from "@/features/source-control/hooks/useThrottledDiffSelection";
import {
  clearReviewSelection,
  setReviewActivePath,
  setReviewBaseRef,
  setReviewHeadRef,
} from "@/features/source-control/sourceControlSlice";
import { errorMessageFrom } from "@/features/source-control/shared-utils/errorMessage";
import type { DiffAnnotationItem, FileItem } from "@/features/source-control/types";
import {
  setActiveConversationThreadId,
  setPullRequestFilesViewMode,
  setPullRequestFileJumpTarget,
  setPullRequestReviewTab,
  setCurrentPullRequestReview,
} from "@/features/pull-requests/pullRequestsSlice";
import type { PreparedPullRequestWorkspace, PullRequestReviewThread } from "@/platform/desktop";
import type { DiffLineAnnotation } from "@pierre/diffs";

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
  usePrefetchReviewDiffs(branchFiles, activeRepo, reviewBaseRef, reviewHeadRef, reviewActivePath);

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

  const reviewVersions = branchFileVersionsQuery.data;
  const oldFile = reviewVersions?.oldFile ?? null;
  const newFile = reviewVersions?.newFile ?? null;
  const loadingPatch = branchFileVersionsQuery.isLoading;
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
          <>
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
          </>
        )}
      </div>
    </section>
  );
}

function PullRequestPlaceholder({
  icon,
  title,
  description,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  const Icon = icon;

  return (
    <div className="flex h-full items-center justify-center px-6">
      <Empty className="max-w-[420px] border-0 bg-transparent">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Icon className="h-5 w-5" />
          </EmptyMedia>
          <EmptyTitle>{title}</EmptyTitle>
          <EmptyDescription>{description}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}

function createReviewSessionFromWorkspace(workspace: PreparedPullRequestWorkspace) {
  return {
    providerId: workspace.providerId,
    owner: workspace.owner,
    repo: workspace.repo,
    pullRequestNumber: workspace.pullRequestNumber,
    title: workspace.title,
    baseRef: workspace.baseRef,
    headRef: workspace.headRef,
    compareBaseRef: workspace.compareBaseRef,
    compareHeadRef: workspace.compareHeadRef,
    repoPath: workspace.repoPath,
    worktreePath: workspace.worktreePath,
  };
}

function reviewSessionMatchesWorkspace(
  review: ReturnType<typeof createReviewSessionFromWorkspace> | null,
  workspace: PreparedPullRequestWorkspace,
) {
  if (!review) return false;

  return (
    review.providerId === workspace.providerId &&
    review.owner === workspace.owner &&
    review.repo === workspace.repo &&
    review.pullRequestNumber === workspace.pullRequestNumber &&
    review.title === workspace.title &&
    review.baseRef === workspace.baseRef &&
    review.headRef === workspace.headRef &&
    review.compareBaseRef === workspace.compareBaseRef &&
    review.compareHeadRef === workspace.compareHeadRef &&
    review.repoPath === workspace.repoPath &&
    review.worktreePath === workspace.worktreePath
  );
}

export function PullRequestReviewScreen() {
  const { providerId, owner, repo, pullRequestNumber } = useParams();
  const dispatch = useAppDispatch();
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo);
  const reviewActivePath = useAppSelector((state) => state.sourceControl.reviewActivePath);
  const activeReviewTab = useAppSelector((state) => state.pullRequests.activeReviewTab);
  const activeConversationThreadId = useAppSelector(
    (state) => state.pullRequests.activeConversationThreadId,
  );
  const filesViewMode = useAppSelector((state) => state.pullRequests.filesViewMode);
  const fileJumpTarget = useAppSelector((state) => state.pullRequests.fileJumpTarget);
  const currentReview = useAppSelector((state) => state.pullRequests.currentReview);
  const fileViewerTarget = useAppSelector((state) => state.sourceControl.fileViewerTarget);

  const { data: pullRequestWorkspace } = useResolvePullRequestWorkspaceQuery(activeRepo || "", {
    skip: !activeRepo,
    selectFromResult: ({ data }) => ({ data }),
  });

  const hasRouteParams = Boolean(providerId && owner && repo && pullRequestNumber);
  const matchesCurrentReview =
    hasRouteParams &&
    currentReview !== null &&
    currentReview.providerId === providerId &&
    currentReview.owner === owner &&
    currentReview.repo === repo &&
    String(currentReview.pullRequestNumber) === pullRequestNumber;
  const workspaceReview =
    pullRequestWorkspace &&
    (!hasRouteParams ||
      (pullRequestWorkspace.providerId === providerId &&
        pullRequestWorkspace.owner === owner &&
        pullRequestWorkspace.repo === repo &&
        String(pullRequestWorkspace.pullRequestNumber) === pullRequestNumber))
      ? createReviewSessionFromWorkspace(pullRequestWorkspace)
      : null;
  const resolvedReview = matchesCurrentReview ? currentReview : workspaceReview ?? currentReview;

  const currentCompareBaseRef = resolvedReview?.compareBaseRef ?? "";
  const currentCompareHeadRef = resolvedReview?.compareHeadRef ?? "";
  const readyForDiff = Boolean(
    resolvedReview && activeRepo && currentCompareBaseRef && currentCompareHeadRef,
  );
  const { branchFiles, hasBranchFilesData } = useGetBranchFilesQuery(
    readyForDiff
      ? { repoPath: activeRepo, baseRef: currentCompareBaseRef, headRef: currentCompareHeadRef }
      : skipToken,
    {
      selectFromResult: ({ data }) => ({
        branchFiles: data ?? EMPTY_BRANCH_FILES,
        hasBranchFilesData: Boolean(data),
      }),
    },
  );
  const {
    conversation,
    conversationError,
    loadingConversation,
  } = useGetPullRequestConversationQuery(
    resolvedReview
      ? {
          repoPath: resolvedReview.repoPath,
          pullRequestNumber: resolvedReview.pullRequestNumber,
        }
      : skipToken,
    {
      selectFromResult: ({ data, error, isLoading }) => ({
        conversation: data ?? null,
        conversationError: data ? "" : errorMessageFrom(error, ""),
        loadingConversation: isLoading,
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
        conversation?.reviewThreads ?? [],
      )
    : [];
  const focusedLineNumber =
    fileJumpTarget && fileJumpTarget.path === reviewActivePath ? fileJumpTarget.lineNumber : null;
  const focusedLineIndex =
    fileJumpTarget && fileJumpTarget.path === reviewActivePath ? fileJumpTarget.lineIndex : null;
  const focusedLineKey =
    fileJumpTarget && fileJumpTarget.path === reviewActivePath ? fileJumpTarget.focusKey : null;
  const showingPullRequestFileViewer =
    activeReviewTab === "files" &&
    filesViewMode === "files" &&
    fileViewerTarget?.returnToDiff?.kind === "pull-request" &&
    fileViewerTarget.returnToDiff.repoPath === activeRepo;

  useEffect(() => {
    if (hasRouteParams && !matchesCurrentReview) {
      dispatch(clearReviewSelection());
    }
  }, [dispatch, hasRouteParams, matchesCurrentReview]);

  useEffect(() => {
    if (!pullRequestWorkspace) {
      return;
    }

    const workspaceMatchesRoute =
      !hasRouteParams ||
      (pullRequestWorkspace.providerId === providerId &&
        pullRequestWorkspace.owner === owner &&
        pullRequestWorkspace.repo === repo &&
        String(pullRequestWorkspace.pullRequestNumber) === pullRequestNumber);
    if (!workspaceMatchesRoute) {
      return;
    }

    const nextReview = createReviewSessionFromWorkspace(pullRequestWorkspace);
    if (!reviewSessionMatchesWorkspace(currentReview, pullRequestWorkspace)) {
      dispatch(setCurrentPullRequestReview(nextReview));
    }

    if (currentReview?.compareBaseRef !== pullRequestWorkspace.compareBaseRef) {
      dispatch(setReviewBaseRef(pullRequestWorkspace.compareBaseRef));
    }
    if (currentReview?.compareHeadRef !== pullRequestWorkspace.compareHeadRef) {
      dispatch(setReviewHeadRef(pullRequestWorkspace.compareHeadRef));
    }
  }, [
    dispatch,
    hasRouteParams,
    owner,
    providerId,
    pullRequestNumber,
    pullRequestWorkspace,
    repo,
    currentReview,
  ]);

  useEffect(() => {
    if (!readyForDiff) return;
    if (!hasBranchFilesData) return;
    if (branchFiles.length === 0) return;

    const existing = branchFiles.find((file) => file.path === reviewActivePath);
    if (!existing) {
      dispatch(setReviewActivePath(branchFiles[0].path));
    }
  }, [branchFiles, dispatch, hasBranchFilesData, readyForDiff, reviewActivePath]);

  useEffect(() => {
    if (
      activeReviewTab === "files" &&
      fileViewerTarget?.returnToDiff?.kind === "pull-request" &&
      fileViewerTarget.returnToDiff.repoPath === activeRepo &&
      filesViewMode !== "files"
    ) {
      dispatch(setPullRequestFilesViewMode("files"));
    }
  }, [activeRepo, activeReviewTab, dispatch, fileViewerTarget, filesViewMode]);

  if (!resolvedReview) {
    return (
      <PullRequestPlaceholder
        icon={GitPullRequest}
        title="Open a pull request from the list"
        description="This review session is not active anymore. Go back to Pull Requests and reopen the PR to restore its local workspace."
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-border/70 bg-surface-toolbar border-b px-6 py-4">
        <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4">
          <div className="min-w-0">
            <div className="text-muted-foreground text-[11px] font-semibold tracking-[0.14em] uppercase">
              Pull Request Review
            </div>
            <div className="mt-1 truncate text-[24px] font-semibold tracking-[-0.03em]">
              #{resolvedReview.pullRequestNumber} {resolvedReview.title}
            </div>
            <div className="text-muted-foreground mt-1 text-sm">
              {resolvedReview.owner}/{resolvedReview.repo}
            </div>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {showingPullRequestFileViewer ? (
          <GeneralFileViewer />
        ) : activeReviewTab === "files" ? (
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
        ) : activeReviewTab === "conversation" ? (
          loadingConversation ? (
            <div className="text-muted-foreground p-6 text-sm">Loading conversation...</div>
          ) : conversationError ? (
            <div className="text-destructive p-6 text-sm">{conversationError}</div>
          ) : conversation ? (
            <PullRequestConversationTab
              repoPath={resolvedReview.repoPath}
              pullRequestNumber={resolvedReview.pullRequestNumber}
              conversation={conversation}
              activeThreadId={activeConversationThreadId}
              onSelectThread={(threadId) => {
                dispatch(setActiveConversationThreadId(threadId));
              }}
              onJumpToThread={(thread) => {
                dispatch(setReviewActivePath(thread.path));
                dispatch(
                  setPullRequestFileJumpTarget({
                    path: thread.path,
                    lineNumber: thread.line ?? thread.startLine ?? null,
                    lineIndex: null,
                    focusKey: Date.now(),
                    threadId: thread.id,
                  }),
                );
                dispatch(setPullRequestReviewTab("files"));
                dispatch(setPullRequestFilesViewMode("review"));
              }}
            />
          ) : (
            <PullRequestPlaceholder
              icon={MessagesSquare}
              title="Conversation unavailable"
              description="The pull request conversation could not be loaded."
            />
          )
        ) : (
          <PullRequestPlaceholder
            icon={ShieldCheck}
            title="Checks are next"
            description="Status checks and CI summaries will live here once the provider review shell is expanded."
          />
        )}
      </div>
    </div>
  );
}
