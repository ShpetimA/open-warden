import { skipToken } from "@reduxjs/toolkit/query";
import { Copy, MessageSquarePlus, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";

import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { Button } from "@/components/ui/button";
import { openPullRequestReview } from "@/features/hosted-repos/actions";
import {
  hostedReposApi,
  useGetPullRequestConversationQuery,
  useGetPullRequestFilesQuery,
  usePreparePullRequestCompareRefsQuery,
  useResolveHostedRepoQuery,
} from "@/features/hosted-repos/api";
import {
  CommentBody,
  copyToClipboard,
} from "@/features/pull-requests/components/pullRequestCommentParts";
import { PullRequestDiscussionSection } from "@/features/pull-requests/components/PullRequestDiscussionSection";
import { PullRequestOverviewAnchorCard } from "@/features/pull-requests/components/PullRequestOverviewAnchorCard";
import { PullRequestPreviewHeader } from "@/features/pull-requests/components/PullRequestPreviewHeader";
import { usePullRequestMentionCandidates } from "@/features/pull-requests/hooks/usePullRequestMentionCandidates";
import { usePullRequestPendingReviewActions } from "@/features/pull-requests/hooks/usePullRequestPendingReviewActions";
import { usePullRequestReviewAnchors } from "@/features/pull-requests/hooks/usePullRequestReviewAnchors";
import {
  buildPreviewTabPath,
  type PreviewTab,
} from "@/features/pull-requests/screens/PullRequestPreviewLayout";
import {
  setPullRequestPreviewActiveFilePath,
  setPullRequestPreviewFileJumpTarget,
} from "@/features/pull-requests/pullRequestsSlice";
import { buildPullRequestsInboxPath } from "@/features/pull-requests/utils";
import type { PullRequestReviewAnchor } from "@/features/source-control/types";
import type { PullRequestChangedFile, PullRequestConversation } from "@/platform/desktop";
import type { GitProviderId, PullRequestOpenMode } from "@/platform/desktop/contracts";

type PullRequestQueryArg =
  | {
      repoPath: string;
      pullRequestNumber: number;
    }
  | typeof skipToken;

function providerTitle(providerId: string) {
  if (providerId === "github") return "GitHub";
  if (providerId === "gitlab") return "GitLab";
  return "Bitbucket";
}

function OverviewDetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-right text-sm font-medium">{value}</dd>
    </div>
  );
}

function SectionHeader({
  title,
  count,
  actions,
}: {
  title: string;
  count?: number;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <div className="text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase">
          {title}
        </div>
        {typeof count === "number" ? (
          <div className="text-muted-foreground rounded-full border border-border/70 px-2 py-0.5 text-[11px]">
            {count}
          </div>
        ) : null}
      </div>
      {actions}
    </div>
  );
}

function PullRequestSummarySection({ body }: { body: string }) {
  return (
    <section className="rounded-lg border bg-surface-0 p-5">
      <div className="text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase">
        Summary
      </div>
      <div className="mt-3 text-sm leading-6">
        {body.trim() ? (
          <div className="min-w-0 max-w-none">
            <CommentBody body={body} />
          </div>
        ) : (
          <div className="text-muted-foreground italic">No description provided.</div>
        )}
      </div>
    </section>
  );
}

type PullRequestOverviewReviewSectionsProps = {
  queryArg: PullRequestQueryArg;
  activeRepo: string;
  pullRequestNumber: number;
  providerId?: GitProviderId;
  files: PullRequestChangedFile[];
  conversation: PullRequestConversation;
  onOpenAnchorInFiles: (anchor: PullRequestReviewAnchor) => void;
};

function PullRequestOverviewReviewSections({
  queryArg,
  activeRepo,
  pullRequestNumber,
  providerId,
  files,
  conversation,
  onOpenAnchorInFiles,
}: PullRequestOverviewReviewSectionsProps) {
  const { compareRefs } = usePreparePullRequestCompareRefsQuery(queryArg, {
    selectFromResult: ({ data }) => ({
      compareRefs: data ?? null,
    }),
  });
  const compareBaseRef = compareRefs?.compareBaseRef ?? "";
  const compareHeadRef = compareRefs?.compareHeadRef ?? "";
  const commentMentions = usePullRequestMentionCandidates(conversation);
  const pendingActions = usePullRequestPendingReviewActions({
    repoPath: activeRepo,
    pullRequestNumber,
    compareBaseRef,
    compareHeadRef,
  });
  const { pendingAnchors, remoteAnchors } = usePullRequestReviewAnchors({
    repoPath: activeRepo,
    compareBaseRef,
    compareHeadRef,
    files,
    reviewThreads: conversation.reviewThreads,
  });

  return (
    <>
      {pendingAnchors.length > 0 ? (
        <section className="flex flex-col gap-3">
          <SectionHeader
            title="Pending review drafts"
            count={pendingAnchors.length}
            actions={
              <div className="flex flex-wrap items-center gap-1">
                <Button
                  size="sm"
                  className="h-7 px-2"
                  disabled={pendingActions.isSubmittingReviewComments}
                  onClick={() => {
                    void pendingActions.publishAllPendingDrafts();
                  }}
                >
                  <MessageSquarePlus className="h-3.5 w-3.5" />
                  Publish all
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => {
                    void pendingActions.copyAllPendingDrafts();
                  }}
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copy all
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => {
                    pendingActions.clearAllPendingDrafts();
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Clear all
                </Button>
              </div>
            }
          />

          <div className="flex flex-col gap-3">
            {pendingAnchors.map((anchor) => (
              <PullRequestOverviewAnchorCard
                key={anchor.key}
                providerId={providerId}
                repoPath={activeRepo}
                pullRequestNumber={pullRequestNumber}
                compareBaseRef={compareBaseRef}
                compareHeadRef={compareHeadRef}
                anchor={anchor}
                onOpenFile={() => onOpenAnchorInFiles(anchor)}
                onPublishPending={() => {
                  void pendingActions.publishAnchorPendingDrafts(anchor);
                }}
                onCopyPending={() => {
                  void pendingActions.copyAnchorPendingDrafts(anchor);
                }}
                onClearPending={() => {
                  pendingActions.clearAnchorPendingDrafts(anchor);
                }}
                commentMentions={commentMentions}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <SectionHeader title="Commented code" count={remoteAnchors.length} />
        {remoteAnchors.length > 0 ? (
          <div className="flex flex-col gap-3">
            {remoteAnchors.map((anchor) => (
              <PullRequestOverviewAnchorCard
                key={anchor.key}
                providerId={providerId}
                repoPath={activeRepo}
                pullRequestNumber={pullRequestNumber}
                compareBaseRef={compareBaseRef}
                compareHeadRef={compareHeadRef}
                anchor={anchor}
                onOpenFile={() => onOpenAnchorInFiles(anchor)}
                commentMentions={commentMentions}
              />
            ))}
          </div>
        ) : (
          <div className="text-muted-foreground rounded-lg border border-border/70 bg-surface-0 px-4 py-3 text-sm">
            No inline review threads yet.
          </div>
        )}
      </section>
    </>
  );
}

type PullRequestOverviewDetailsSidebarProps = {
  queryArg: PullRequestQueryArg;
  activeRepo: string;
  pullRequestNumber: number;
  detail: PullRequestConversation["detail"];
  files: PullRequestChangedFile[];
  totalAdditions: number;
  totalDeletions: number;
  issueCommentCount: number;
  reviewThreadCount: number;
};

function PullRequestOverviewDetailsSidebar({
  queryArg,
  activeRepo,
  pullRequestNumber,
  detail,
  files,
  totalAdditions,
  totalDeletions,
  issueCommentCount,
  reviewThreadCount,
}: PullRequestOverviewDetailsSidebarProps) {
  const { compareRefs } = usePreparePullRequestCompareRefsQuery(queryArg, {
    selectFromResult: ({ data }) => ({
      compareRefs: data ?? null,
    }),
  });
  const pendingActions = usePullRequestPendingReviewActions({
    repoPath: activeRepo,
    pullRequestNumber,
    compareBaseRef: compareRefs?.compareBaseRef ?? "",
    compareHeadRef: compareRefs?.compareHeadRef ?? "",
  });

  return (
    <aside className="flex flex-col gap-4 xl:sticky xl:top-4">
      <section className="rounded-lg border bg-surface-0 p-4">
        <div className="text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase">
          Details
        </div>
        <dl className="mt-2 divide-y divide-border/70">
          <OverviewDetailRow label="Provider" value={providerTitle(detail.providerId)} />
          <OverviewDetailRow
            label="Conversation"
            value={`${issueCommentCount} comments · ${reviewThreadCount} threads`}
          />
          <OverviewDetailRow
            label="Changes"
            value={
              <span>
                {files.length} files <span className="text-emerald-500">+{totalAdditions}</span>{" "}
                <span className="text-red-500">-{totalDeletions}</span>
              </span>
            }
          />
          <OverviewDetailRow label="Pending drafts" value={pendingActions.pendingDraftCount} />
          <OverviewDetailRow label="Base" value={detail.baseRef} />
          <OverviewDetailRow label="Head" value={detail.headRef} />
        </dl>
      </section>
    </aside>
  );
}

export const PullRequestOverview = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo);
  const activePreviewFilePath = useAppSelector((state) => state.pullRequests.previewActiveFilePath);
  const { providerId, owner, repo, pullRequestNumber } = useParams();
  const [openingMode, setOpeningMode] = useState<PullRequestOpenMode | null>(null);
  const [openError, setOpenError] = useState("");

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

  const parsedPullRequestNumber = Number.parseInt(pullRequestNumber ?? "", 10);
  const hasValidRoute = Boolean(
    providerId &&
    owner &&
    repo &&
    Number.isFinite(parsedPullRequestNumber) &&
    parsedPullRequestNumber > 0,
  );

  const queryArg: PullRequestQueryArg =
    activeRepo && hasValidRoute && routeMatchesActiveRepo
      ? {
          repoPath: activeRepo,
          pullRequestNumber: parsedPullRequestNumber,
        }
      : skipToken;

  const {
    conversation,
    loadingConversation,
    refetch: refetchConversation,
  } = useGetPullRequestConversationQuery(queryArg, {
    selectFromResult: ({ data, isLoading, isFetching }) => ({
      conversation: data ?? null,
      loadingConversation: isLoading || isFetching,
    }),
    pollingInterval: 10000,
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });

  const { files } = useGetPullRequestFilesQuery(queryArg, {
    selectFromResult: ({ data }) => ({
      files: data ?? [],
    }),
  });

  async function handleOpen(mode: PullRequestOpenMode) {
    if (!Number.isFinite(parsedPullRequestNumber)) {
      return;
    }

    setOpenError("");
    setOpeningMode(mode);
    const result = await dispatch(openPullRequestReview(parsedPullRequestNumber, mode));
    setOpeningMode(null);

    if (!result.errorMessage) {
      navigate("/changes/pull-request/files");
      return;
    }

    setOpenError(result.errorMessage);
    toast.error(result.errorMessage);
  }

  async function handleCopyPullRequestLink() {
    const url = conversation?.detail.url;
    if (!url) {
      toast.error("PR link is not available yet.");
      return;
    }

    await copyToClipboard(url, "PR link copied");
  }

  async function handleCopyBranchName() {
    const branchName = conversation?.detail.headRef;
    if (!branchName) {
      toast.error("Branch name is not available yet.");
      return;
    }

    await copyToClipboard(branchName, "Branch name copied");
  }

  function handleRefresh() {
    if (activeRepo && hasValidRoute && routeMatchesActiveRepo) {
      void refetchConversation();
      dispatch(hostedReposApi.util.invalidateTags([{ type: "HostedRepo", id: activeRepo }]));
    }
  }

  function handleTabChange(tab: PreviewTab) {
    if (!hasValidRoute || !providerId || !owner || !repo) {
      return;
    }

    const nextPath = buildPreviewTabPath({
      providerId: providerId as GitProviderId,
      owner,
      repo,
      pullRequestNumber: parsedPullRequestNumber,
      tab,
    });

    if (tab === "files" && files.length > 0) {
      const hasMatchingActiveFile = files.some((file) => file.path === activePreviewFilePath);
      if (!hasMatchingActiveFile) {
        dispatch(setPullRequestPreviewActiveFilePath(files[0].path));
      }
    }

    navigate(nextPath);
  }

  function openAnchorInFiles(anchor: PullRequestReviewAnchor) {
    if (!hasValidRoute || !providerId || !owner || !repo) {
      return;
    }

    dispatch(setPullRequestPreviewActiveFilePath(anchor.path));
    dispatch(
      setPullRequestPreviewFileJumpTarget({
        path: anchor.path,
        lineNumber: anchor.endLine,
        lineIndex: null,
        focusKey: Date.now(),
      }),
    );

    navigate(
      buildPreviewTabPath({
        providerId: providerId as GitProviderId,
        owner,
        repo,
        pullRequestNumber: parsedPullRequestNumber,
        tab: "files",
      }),
    );
  }

  if (!conversation) {
    return null;
  }

  const { detail } = conversation;
  const totalAdditions = files.reduce((sum, file) => sum + file.additions, 0);
  const totalDeletions = files.reduce((sum, file) => sum + file.deletions, 0);
  const issueCommentCount = conversation.issueComments.length;
  const reviewThreadCount = conversation.reviewThreads.length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PullRequestPreviewHeader
        owner={hostedRepo?.owner ?? owner ?? ""}
        repo={hostedRepo?.repo ?? repo ?? ""}
        detail={detail}
        openingMode={openingMode}
        isRefreshing={loadingConversation && !!conversation}
        changedFilesCount={files.length}
        additions={totalAdditions}
        deletions={totalDeletions}
        onBack={() => navigate(buildPullRequestsInboxPath())}
        onOpen={(mode) => {
          void handleOpen(mode);
        }}
        onOpenInBrowser={() => {
          window.open(detail.url, "_blank", "noopener,noreferrer");
        }}
        onCopyLink={() => {
          void handleCopyPullRequestLink();
        }}
        onCopyBranch={() => {
          void handleCopyBranchName();
        }}
        onRefresh={handleRefresh}
        onToggleFilesView={() => handleTabChange("files")}
      />

      <div className="min-h-0 flex-1 overflow-auto px-6 py-6">
        <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-6">
          {openError ? (
            <div className="text-destructive rounded-lg border border-red-500/25 bg-red-500/8 px-3 py-2 text-sm">
              {openError}
            </div>
          ) : null}

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px] xl:items-start">
            <div className="flex min-w-0 flex-col gap-6">
              <PullRequestSummarySection body={detail.body} />
              <PullRequestDiscussionSection conversation={conversation} />
              <PullRequestOverviewReviewSections
                queryArg={queryArg}
                activeRepo={activeRepo ?? ""}
                pullRequestNumber={parsedPullRequestNumber}
                providerId={detail.providerId as GitProviderId}
                files={files}
                conversation={conversation}
                onOpenAnchorInFiles={openAnchorInFiles}
              />
            </div>

            <PullRequestOverviewDetailsSidebar
              queryArg={queryArg}
              activeRepo={activeRepo ?? ""}
              pullRequestNumber={parsedPullRequestNumber}
              detail={detail}
              files={files}
              totalAdditions={totalAdditions}
              totalDeletions={totalDeletions}
              issueCommentCount={issueCommentCount}
              reviewThreadCount={reviewThreadCount}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
