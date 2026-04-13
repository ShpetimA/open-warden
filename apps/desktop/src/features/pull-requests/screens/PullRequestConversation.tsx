import { useAppSelector } from "@/app/hooks";
import {
  useGetPullRequestConversationQuery,
  useResolveHostedRepoQuery,
} from "@/features/hosted-repos/api";
import { PullRequestConversationTab } from "@/features/pull-requests/components/PullRequestConversationTab";
import { errorMessageFrom } from "@/features/source-control/shared-utils/errorMessage";
import { skipToken } from "@reduxjs/toolkit/query";
import { useState } from "react";
import { useParams } from "react-router";
import { toast } from "sonner";

export const PullRequestConversation = () => {
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo);
  const { providerId, owner, repo, pullRequestNumber } = useParams();
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);

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

  const conversationQueryArg =
    activeRepo && hasValidRoute && routeMatchesActiveRepo
      ? {
          repoPath: activeRepo,
          pullRequestNumber: parsedPullRequestNumber,
        }
      : skipToken;

  const { conversation } = useGetPullRequestConversationQuery(conversationQueryArg, {
    selectFromResult: ({ data, error, isLoading, isFetching }) => ({
      conversation: data ?? null,
      conversationError: data ? "" : errorMessageFrom(error, ""),
      loadingConversation: isLoading || isFetching,
    }),
    pollingInterval: 10000,
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });

  if (!conversation) return;

  const { detail } = conversation;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PullRequestConversationTab
        providerId={detail.providerId}
        repoPath={activeRepo}
        pullRequestNumber={detail.number}
        conversation={conversation}
        activeThreadId={activeThreadId}
        onSelectThread={setActiveThreadId}
        onJumpToThread={() => {
          toast.info(
            "Open this PR on a branch or in a worktree to jump from comments into the diff.",
          );
        }}
      />
    </div>
  );
};
