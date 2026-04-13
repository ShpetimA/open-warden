import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { openPullRequestReview } from "@/features/hosted-repos/actions";
import {
  hostedReposApi,
  useGetPullRequestConversationQuery,
  useGetPullRequestFilesQuery,
  useResolveHostedRepoQuery,
} from "@/features/hosted-repos/api";
import {
  CommentBody,
  copyToClipboard,
} from "@/features/pull-requests/components/pullRequestCommentParts";
import { PullRequestPreviewHeader } from "@/features/pull-requests/components/PullRequestPreviewHeader";
import {
  buildPreviewTabPath,
  type PreviewTab,
} from "@/features/pull-requests/screens/PullRequestPreviewLayout";
import { buildPullRequestsInboxPath } from "@/features/pull-requests/utils";
import { errorMessageFrom } from "@/features/source-control/shared-utils/errorMessage";
import type { GitProviderId, PullRequestOpenMode } from "@/platform/desktop/contracts";
import { skipToken } from "@reduxjs/toolkit/query";
import { useState, type ReactNode } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { toast } from "sonner";

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

export const PullRequestOverview = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo);
  const { providerId, owner, repo, pullRequestNumber } = useParams();
  const [searchParams] = useSearchParams();
  const [openingMode, setOpeningMode] = useState<PullRequestOpenMode | null>(null);
  const [openError, setOpenError] = useState("");

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

  const parsedPullRequestNumber = Number.parseInt(pullRequestNumber ?? "", 10);
  const hasValidRoute = Boolean(
    providerId &&
    owner &&
    repo &&
    Number.isFinite(parsedPullRequestNumber) &&
    parsedPullRequestNumber > 0,
  );

  const conversationQueryArg =
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
  } = useGetPullRequestConversationQuery(conversationQueryArg, {
    selectFromResult: ({ data, error, isLoading, isFetching }) => ({
      conversation: data ?? null,
      conversationError: data ? "" : errorMessageFrom(error, ""),
      loadingConversation: isLoading || isFetching,
    }),
    pollingInterval: 10000,
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });

  const filesQueryArg =
    activeRepo && hasValidRoute && routeMatchesActiveRepo
      ? { repoPath: activeRepo, pullRequestNumber: parsedPullRequestNumber }
      : skipToken;

  const { files } = useGetPullRequestFilesQuery(filesQueryArg, {
    selectFromResult: ({ data, error, isLoading, isFetching }) => ({
      files: data ?? [],
      filesError: data ? "" : errorMessageFrom(error, ""),
      isLoadingFiles: isLoading || isFetching,
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

    if (result.workspace) {
      navigate("/changes");
      return;
    }

    if (result.errorMessage) {
      setOpenError(result.errorMessage);
      toast.error(result.errorMessage);
    }
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

    const nextParams = new URLSearchParams(searchParams);
    if (tab === "files" && files.length > 0 && !searchParams.get("file")) {
      nextParams.set("file", files[0].path);
    }

    const nextQuery = nextParams.toString();
    navigate(nextQuery ? `${nextPath}?${nextQuery}` : nextPath);
  }

  if (!conversation) return null;

  const { detail } = conversation;
  const totalAdditions = files.reduce((sum, f) => sum + f.additions, 0);
  const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0);
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
        <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-4">
          {openError ? (
            <div className="text-destructive rounded-lg border border-red-500/25 bg-red-500/8 px-3 py-2 text-sm">
              {openError}
            </div>
          ) : null}

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <section className="rounded-lg border bg-surface-0 p-5">
              <div className="text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase">
                Description
              </div>
              <div className="mt-3 text-sm leading-6">
                {detail.body.trim() ? (
                  <CommentBody body={detail.body} />
                ) : (
                  <div className="text-muted-foreground italic">No description provided.</div>
                )}
              </div>
            </section>

            <aside className="rounded-lg border bg-surface-0 p-4">
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
                      {files.length} files{" "}
                      <span className="text-emerald-500">+{totalAdditions}</span>{" "}
                      <span className="text-red-500">-{totalDeletions}</span>
                    </span>
                  }
                />
              </dl>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
};
