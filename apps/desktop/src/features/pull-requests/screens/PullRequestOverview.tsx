import { ErrorState } from "@/components/ui/error-state";
import { skipToken } from "@reduxjs/toolkit/query";
import { Copy, MessageSquarePlus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";

import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { Button } from "@/components/ui/button";
import { ListLoadingState } from "@/components/ui/list-loading-state";
import { TooltipProvider } from "@/components/ui/tooltip";
import { openPullRequestReview } from "@/features/hosted-repos/actions";
import {
  hostedReposApi,
  useAddPullRequestCommentMutation,
  useGetPullRequestActivityQuery,
  useGetPullRequestConversationQuery,
  useGetPullRequestFilesQuery,
  useLazyPreparePullRequestCompareRefsQuery,
  useListProviderConnectionsQuery,
  usePreparePullRequestCompareRefsQuery,
  useResolveHostedRepoQuery,
  useSetPullRequestReviewerMutation,
} from "@/features/hosted-repos/api";
import { copyToClipboard } from "@/features/pull-requests/components/pullRequestCommentParts";
import { PullRequestOverviewAnchorCard } from "@/features/pull-requests/components/PullRequestOverviewAnchorCard";
import { PullRequestProviderExtras } from "@/features/pull-requests/components/PullRequestProviderExtras";
import { usePullRequestMentionCandidates } from "@/features/pull-requests/hooks/usePullRequestMentionCandidates";
import { usePullRequestPendingReviewActions } from "@/features/pull-requests/hooks/usePullRequestPendingReviewActions";
import { usePullRequestReviewAnchors } from "@/features/pull-requests/hooks/usePullRequestReviewAnchors";
import { CommentReactions } from "@/features/pull-requests/overview/CommentReactions";
import {
  PullRequestHeaderActions,
  type PullRequestHeaderAction,
} from "@/features/pull-requests/overview/PullRequestHeaderActions";
import {
  headerLifecycleActions,
  PullRequestLifecycleDialog,
  type LifecycleRequest,
} from "@/features/pull-requests/overview/PullRequestLifecycleDialog";
import { PullRequestMergeBox } from "@/features/pull-requests/overview/PullRequestMergeBox";
import { PullRequestOverviewHeader } from "@/features/pull-requests/overview/PullRequestOverviewHeader";
import { PullRequestOverviewLayout } from "@/features/pull-requests/overview/PullRequestOverviewLayout";
import { PullRequestReviewerList } from "@/features/pull-requests/overview/PullRequestReviewerList";
import { PullRequestTimeline } from "@/features/pull-requests/overview/PullRequestTimeline";
import type { PersonView, TimelineEntry } from "@/features/pull-requests/overview/types";
import {
  toPersonView,
  usePullRequestOverviewView,
  type PullRequestLocator,
} from "@/features/pull-requests/overview/usePullRequestOverviewView";
import { buildPreviewTabPath } from "@/features/pull-requests/screens/PullRequestPreviewLayout";
import {
  setPullRequestPreviewActiveFilePath,
  setPullRequestPreviewFileJumpTarget,
} from "@/features/pull-requests/pullRequestsSlice";
import { buildPullRequestsInboxPath } from "@/features/pull-requests/utils";
import { selectHistoryPullRequestCommit } from "@/features/source-control/actions";
import type { PullRequestReviewAnchor } from "@/features/source-control/types";
import { desktop } from "@/platform/desktop";
import type {
  GitProviderId,
  PullRequestActivityItem,
  PullRequestDetail,
  PullRequestOpenMode,
} from "@/platform/desktop";

type QueryArg = PullRequestLocator | typeof skipToken;

type RouteContext = {
  providerId: GitProviderId;
  owner: string;
  repo: string;
  pullRequestNumber: number;
};

const unknownActor: PersonView = { login: "unknown", name: "Someone", avatarUrl: null };

function errorMessage(cause: unknown, fallback: string) {
  return cause && typeof cause === "object" && "message" in cause
    ? String(cause.message)
    : fallback;
}

function activityEntry(item: PullRequestActivityItem): TimelineEntry {
  const actor = toPersonView(item.actor);
  if (item.kind === "commit") {
    return {
      kind: "commit",
      id: item.id,
      author: actor,
      createdAt: item.occurredAt,
      sha: item.commitSha,
      message: item.message,
    };
  }
  if (
    item.event === "approved" ||
    item.event === "changes-requested" ||
    item.event === "reviewed"
  ) {
    return {
      kind: "review",
      id: item.id,
      author: actor ?? unknownActor,
      createdAt: item.occurredAt,
      state: item.event,
      body: item.body ?? "",
    };
  }
  return {
    kind: "event",
    id: item.id,
    actor,
    createdAt: item.occurredAt,
    event: item.event,
    detail: item.detail,
  };
}

function anchorStartedAt(anchor: PullRequestReviewAnchor) {
  const times = anchor.remoteThreads.flatMap((thread) =>
    thread.comments.map((comment) => comment.createdAt),
  );
  return times.toSorted()[0] ?? "";
}

function useOpenAnchorInFiles(route: RouteContext) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  return (anchor: PullRequestReviewAnchor) => {
    dispatch(setPullRequestPreviewActiveFilePath(anchor.path));
    dispatch(
      setPullRequestPreviewFileJumpTarget({
        path: anchor.path,
        lineNumber: anchor.endLine,
        lineIndex: null,
        focusKey: Date.now(),
      }),
    );
    navigate(buildPreviewTabPath({ ...route, tab: "files" }));
  };
}

function useOpenCommitInHistory(locator: PullRequestLocator) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [prepareRefs] = useLazyPreparePullRequestCompareRefsQuery();
  const opening = useRef(false);
  return async (commitSha: string) => {
    if (opening.current) return;
    opening.current = true;
    try {
      let result = await desktop.getCommitFiles(locator.repoPath, commitSha);
      if (!result.ok) {
        await prepareRefs(locator, true).unwrap();
        result = await desktop.getCommitFiles(locator.repoPath, commitSha);
      }
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      await dispatch(selectHistoryPullRequestCommit(commitSha));
      navigate(`/history?commit=${commitSha}`);
    } catch (cause) {
      toast.error(errorMessage(cause, "Could not open this commit in History."));
    } finally {
      opening.current = false;
    }
  };
}

function PullRequestOverviewHeaderBar({
  locator,
  route,
  repository,
  detail,
  onOpenChecks,
  onLifecycle,
}: {
  locator: PullRequestLocator;
  route: RouteContext;
  repository: string;
  detail: PullRequestDetail;
  onOpenChecks: () => void;
  onLifecycle: (request: LifecycleRequest) => void;
}) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [opening, setOpening] = useState<PullRequestOpenMode | null>(null);
  const pullRequest = usePullRequestOverviewView(locator, repository);
  const { refreshing } = useGetPullRequestConversationQuery(locator, {
    selectFromResult: ({ isFetching }) => ({ refreshing: isFetching }),
  });

  async function open(mode: PullRequestOpenMode) {
    setOpening(mode);
    const result = await dispatch(openPullRequestReview(route.pullRequestNumber, mode));
    setOpening(null);
    if (result.errorMessage) {
      toast.error(result.errorMessage);
      return;
    }
    navigate("../local-files", { relative: "path" });
  }

  function refresh() {
    const id = `${locator.repoPath}:${locator.pullRequestNumber}`;
    dispatch(
      hostedReposApi.util.invalidateTags([
        { type: "HostedRepo", id: locator.repoPath },
        { type: "PullRequestConversation", id },
        { type: "PullRequestActivity", id },
        { type: "PullRequestChecks", id },
        { type: "PullRequestReviewOverview", id },
        { type: "PullRequestFiles", id },
      ]),
    );
  }

  function handleAction(action: PullRequestHeaderAction) {
    if (action === "open-branch") void open("branch");
    else if (action === "open-worktree") void open("worktree");
    else if (action === "open-browser") window.open(detail.url, "_blank", "noopener,noreferrer");
    else if (action === "copy-link") void copyToClipboard(detail.url, "Pull request link copied");
    else if (action === "copy-branch") void copyToClipboard(detail.headRef, "Branch name copied");
    else refresh();
  }

  if (!pullRequest) return null;
  return (
    <PullRequestOverviewHeader
      pullRequest={pullRequest}
      refreshing={refreshing}
      actions={
        <PullRequestHeaderActions
          lifecycleActions={headerLifecycleActions(detail)}
          opening={opening}
          refreshing={refreshing}
          onAction={handleAction}
          onLifecycle={(action) => onLifecycle({ action })}
        />
      }
      onBack={() => navigate(buildPullRequestsInboxPath())}
      onCopyBranch={() => handleAction("copy-branch")}
      onOpenFiles={() => navigate(buildPreviewTabPath({ ...route, tab: "files" }))}
      onOpenChecks={onOpenChecks}
    />
  );
}

function PullRequestOverviewMergeStatus({
  locator,
  repository,
  detail,
  checksOpen,
  onChecksOpenChange,
  onLifecycle,
  mergeBoxRef,
}: {
  locator: PullRequestLocator;
  repository: string;
  detail: PullRequestDetail;
  checksOpen: boolean;
  onChecksOpenChange: (open: boolean) => void;
  onLifecycle: (request: LifecycleRequest) => void;
  mergeBoxRef: React.Ref<HTMLElement>;
}) {
  const pullRequest = usePullRequestOverviewView(locator, repository);
  const { conversation } = useGetPullRequestConversationQuery(locator, {
    selectFromResult: ({ data }) => ({ conversation: data ?? null }),
  });
  const mentions = usePullRequestMentionCandidates(conversation);
  const [setReviewer] = useSetPullRequestReviewerMutation();

  async function changeReviewer(reviewer: string, requested: boolean) {
    try {
      await setReviewer({ ...locator, reviewer, requested }).unwrap();
      toast.success(requested ? "Review requested" : "Reviewer removed");
      return true;
    } catch (cause) {
      toast.error(errorMessage(cause, "Could not update reviewers."));
      return false;
    }
  }

  if (!pullRequest) return null;
  const open = detail.state === "open";
  const github = detail.providerId === "github";
  return (
    <PullRequestMergeBox
      ref={mergeBoxRef}
      pullRequest={pullRequest}
      checksOpen={checksOpen}
      onChecksOpenChange={onChecksOpenChange}
      canAutoMerge={github && open && !detail.isDraft}
      onMerge={(method) => onLifecycle({ action: "merge", method })}
      onAutoMerge={() => onLifecycle({ action: "auto-merge" })}
      onMarkReady={github ? () => onLifecycle({ action: "ready" }) : undefined}
      reviewers={
        <div onFocus={mentions.onActivate} onPointerEnter={mentions.onActivate}>
          <PullRequestReviewerList
            reviewers={pullRequest.reviewers}
            candidates={mentions.candidates}
            onAdd={open ? (login) => changeReviewer(login, true) : undefined}
            onRerequest={open ? (reviewer) => void changeReviewer(reviewer.id, true) : undefined}
            onRemove={open ? (reviewer) => void changeReviewer(reviewer.id, false) : undefined}
          />
        </div>
      }
    />
  );
}

function PendingDraftsSection({
  locator,
  route,
  compareBaseRef,
  compareHeadRef,
  anchors,
  mentions,
}: {
  locator: PullRequestLocator;
  route: RouteContext;
  compareBaseRef: string;
  compareHeadRef: string;
  anchors: PullRequestReviewAnchor[];
  mentions: ReturnType<typeof usePullRequestMentionCandidates>;
}) {
  const pendingActions = usePullRequestPendingReviewActions({
    repoPath: locator.repoPath,
    pullRequestNumber: locator.pullRequestNumber,
    compareBaseRef,
    compareHeadRef,
  });
  const openAnchorInFiles = useOpenAnchorInFiles(route);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">
          Pending review drafts{" "}
          <span className="text-muted-foreground font-normal tabular-nums">{anchors.length}</span>
        </h2>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            disabled={pendingActions.isSubmittingReviewComments}
            onClick={() => void pendingActions.publishAllPendingDrafts()}
          >
            <MessageSquarePlus /> Publish all
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void pendingActions.copyAllPendingDrafts()}
          >
            <Copy /> Copy all
          </Button>
          <Button variant="ghost" size="sm" onClick={pendingActions.clearAllPendingDrafts}>
            <Trash2 /> Clear all
          </Button>
        </div>
      </div>
      {anchors.map((anchor) => (
        <PullRequestOverviewAnchorCard
          key={anchor.key}
          providerId={route.providerId}
          repoPath={locator.repoPath}
          pullRequestNumber={locator.pullRequestNumber}
          compareBaseRef={compareBaseRef}
          compareHeadRef={compareHeadRef}
          anchor={anchor}
          onOpenFile={() => openAnchorInFiles(anchor)}
          onPublishPending={() => void pendingActions.publishAnchorPendingDrafts(anchor)}
          onCopyPending={() => void pendingActions.copyAnchorPendingDrafts(anchor)}
          onClearPending={() => pendingActions.clearAnchorPendingDrafts(anchor)}
          commentMentions={mentions}
        />
      ))}
    </section>
  );
}

function PullRequestOverviewConversation({
  locator,
  route,
  onLifecycle,
}: {
  locator: PullRequestLocator;
  route: RouteContext;
  onLifecycle: (request: LifecycleRequest) => void;
}) {
  const { conversation } = useGetPullRequestConversationQuery(locator, {
    selectFromResult: ({ data }) => ({ conversation: data ?? null }),
  });
  const { files } = useGetPullRequestFilesQuery(locator, {
    selectFromResult: ({ data }) => ({ files: data }),
  });
  const { activity } = useGetPullRequestActivityQuery(locator, {
    selectFromResult: ({ data }) => ({ activity: data }),
  });
  const { compareRefs } = usePreparePullRequestCompareRefsQuery(locator, {
    selectFromResult: ({ data }) => ({ compareRefs: data ?? null }),
  });
  const { viewer } = useListProviderConnectionsQuery(undefined, {
    selectFromResult: ({ data }) => ({
      viewer: data?.find((connection) => connection.providerId === route.providerId) ?? null,
    }),
  });
  const [addComment] = useAddPullRequestCommentMutation();
  const mentions = usePullRequestMentionCandidates(conversation);
  const openAnchorInFiles = useOpenAnchorInFiles(route);
  const openCommit = useOpenCommitInHistory(locator);
  const compareBaseRef = compareRefs?.compareBaseRef ?? "";
  const compareHeadRef = compareRefs?.compareHeadRef ?? "";
  const { pendingAnchors, remoteAnchors } = usePullRequestReviewAnchors({
    repoPath: locator.repoPath,
    compareBaseRef,
    compareHeadRef,
    files: files ?? [],
    reviewThreads: conversation?.reviewThreads ?? [],
  });

  if (!conversation) return null;
  const { detail } = conversation;
  const github = detail.providerId === "github";

  const entries: TimelineEntry[] = [
    ...conversation.issueComments.map(
      (comment): TimelineEntry => ({
        kind: "comment",
        id: comment.id,
        author: toPersonView(comment.author) ?? unknownActor,
        createdAt: comment.createdAt,
        body: comment.body,
        url: comment.url,
        footer:
          github || comment.reactions.length > 0 ? (
            <CommentReactions
              repoPath={locator.repoPath}
              pullRequestNumber={locator.pullRequestNumber}
              comment={comment}
              canReact={github}
            />
          ) : null,
      }),
    ),
    ...(activity?.items ?? []).map(activityEntry),
    ...remoteAnchors.map(
      (anchor): TimelineEntry => ({
        kind: "custom",
        id: `anchor-${anchor.key}`,
        createdAt: anchorStartedAt(anchor),
        node: (
          <PullRequestOverviewAnchorCard
            providerId={route.providerId}
            repoPath={locator.repoPath}
            pullRequestNumber={locator.pullRequestNumber}
            compareBaseRef={compareBaseRef}
            compareHeadRef={compareHeadRef}
            anchor={anchor}
            onOpenFile={() => openAnchorInFiles(anchor)}
            commentMentions={mentions}
          />
        ),
      }),
    ),
  ];

  async function submitComment(body: string) {
    try {
      await addComment({ ...locator, body }).unwrap();
      return true;
    } catch (cause) {
      toast.error(errorMessage(cause, "Could not post the comment."));
      return false;
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {pendingAnchors.length > 0 ? (
        <PendingDraftsSection
          locator={locator}
          route={route}
          compareBaseRef={compareBaseRef}
          compareHeadRef={compareHeadRef}
          anchors={pendingAnchors}
          mentions={mentions}
        />
      ) : null}
      <PullRequestTimeline
        description={{
          author: toPersonView(detail.author) ?? unknownActor,
          createdAt: detail.createdAt,
          body: detail.body,
        }}
        entries={entries}
        viewer={
          viewer
            ? { login: viewer.login, name: viewer.displayName, avatarUrl: viewer.avatarUrl }
            : null
        }
        mentions={mentions}
        onOpenCommit={(sha) => void openCommit(sha)}
        onSubmitComment={submitComment}
        onEditDescription={() => onLifecycle({ action: "edit" })}
      />
      {activity?.truncated ? (
        <p className="text-muted-foreground pl-10 text-xs">
          Older events and commits are only on the provider.
        </p>
      ) : null}
    </div>
  );
}

export const PullRequestOverview = () => {
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo);
  const params = useParams();
  const [lifecycleRequest, setLifecycleRequest] = useState<LifecycleRequest | null>(null);
  const [checksOpen, setChecksOpen] = useState(false);
  const mergeBoxRef = useRef<HTMLElement>(null);
  const pullRequestNumber = Number.parseInt(params.pullRequestNumber ?? "", 10);
  const route: RouteContext | null =
    params.providerId && params.owner && params.repo && pullRequestNumber > 0
      ? {
          providerId: params.providerId as GitProviderId,
          owner: params.owner,
          repo: params.repo,
          pullRequestNumber,
        }
      : null;
  const {
    hostedRepo,
    loadingHostedRepo,
    hostedRepoError,
    refetch: retryHostedRepo,
  } = useResolveHostedRepoQuery(activeRepo, {
    skip: !activeRepo,
    selectFromResult: ({ currentData, isFetching, error }) => ({
      hostedRepo: currentData ?? null,
      loadingHostedRepo: isFetching && !currentData,
      hostedRepoError: currentData ? undefined : error,
    }),
  });
  const routeMatchesActiveRepo = Boolean(
    route &&
    hostedRepo &&
    hostedRepo.providerId === route.providerId &&
    hostedRepo.owner === route.owner &&
    hostedRepo.repo === route.repo,
  );
  const queryArg: QueryArg =
    activeRepo && route && routeMatchesActiveRepo
      ? { repoPath: activeRepo, pullRequestNumber }
      : skipToken;
  const {
    detail,
    loadingDetail,
    detailError,
    refetch: retryDetail,
  } = useGetPullRequestConversationQuery(queryArg, {
    selectFromResult: ({ currentData, isFetching, error }) => ({
      detail: currentData?.detail ?? null,
      loadingDetail: isFetching && !currentData,
      detailError: currentData ? undefined : error,
    }),
    pollingInterval: 10000,
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });

  if (loadingHostedRepo || loadingDetail) return <ListLoadingState label="Loading pull request…" />;
  if (hostedRepoError || detailError) {
    return (
      <ErrorState
        title="Couldn’t load this pull request"
        error={hostedRepoError || detailError}
        busy={loadingHostedRepo || loadingDetail}
        recovery={{
          label: "Retry",
          onAction: () => {
            void (hostedRepoError ? retryHostedRepo() : retryDetail());
          },
        }}
      />
    );
  }
  if (!detail || !route || queryArg === skipToken) return null;
  const repository = `${route.owner}/${route.repo}`;

  function openChecks() {
    setChecksOpen(true);
    mergeBoxRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <TooltipProvider>
      <PullRequestOverviewLayout
        header={
          <PullRequestOverviewHeaderBar
            locator={queryArg}
            route={route}
            repository={repository}
            detail={detail}
            onOpenChecks={openChecks}
            onLifecycle={setLifecycleRequest}
          />
        }
        aside={
          <>
            <PullRequestOverviewMergeStatus
              locator={queryArg}
              repository={repository}
              detail={detail}
              checksOpen={checksOpen}
              onChecksOpenChange={setChecksOpen}
              onLifecycle={setLifecycleRequest}
              mergeBoxRef={mergeBoxRef}
            />
            <PullRequestProviderExtras repoPath={queryArg.repoPath} detail={detail} />
          </>
        }
      >
        <PullRequestOverviewConversation
          locator={queryArg}
          route={route}
          onLifecycle={setLifecycleRequest}
        />
      </PullRequestOverviewLayout>
      <PullRequestLifecycleDialog
        repoPath={queryArg.repoPath}
        detail={detail}
        request={lifecycleRequest}
        onClose={() => setLifecycleRequest(null)}
      />
    </TooltipProvider>
  );
};
