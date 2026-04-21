import { skipToken } from "@reduxjs/toolkit/query";
import { MessagesSquare } from "lucide-react";
import { useNavigate } from "react-router";

import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { useGetPullRequestConversationQuery } from "@/features/hosted-repos/api";
import { PullRequestRouteHeader } from "@/features/pull-requests/components/PullRequestRouteHeader";
import { PullRequestConversationTab } from "@/features/pull-requests/components/PullRequestConversationTab";
import {
  setActiveConversationThreadId,
  setPullRequestFileJumpTarget,
  setPullRequestFilesViewMode,
} from "@/features/pull-requests/pullRequestsSlice";
import { setReviewActivePath } from "@/features/source-control/sourceControlSlice";
import { errorMessageFrom } from "@/features/source-control/shared-utils/errorMessage";

import {
  InactivePullRequestReviewPlaceholder,
  PullRequestReviewPlaceholder,
  usePullRequestReviewSession,
} from "./PullRequestReviewShared";

export function PullRequestReviewConversationScreen() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const activeThreadId = useAppSelector((state) => state.pullRequests.activeConversationThreadId);

  const { resolvedReview } = usePullRequestReviewSession();

  const { conversation, conversationError, loadingConversation } =
    useGetPullRequestConversationQuery(
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

  if (!resolvedReview) {
    return <InactivePullRequestReviewPlaceholder />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PullRequestRouteHeader review={resolvedReview} />
      <div className="min-h-0 flex-1">
        {loadingConversation ? (
          <div className="text-muted-foreground p-6 text-sm">Loading conversation...</div>
        ) : conversationError ? (
          <div className="text-destructive p-6 text-sm">{conversationError}</div>
        ) : conversation ? (
          <PullRequestConversationTab
            providerId={resolvedReview.providerId}
            repoPath={resolvedReview.repoPath}
            pullRequestNumber={resolvedReview.pullRequestNumber}
            conversation={conversation}
            activeThreadId={activeThreadId}
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
              dispatch(setPullRequestFilesViewMode("review"));
              navigate("/changes/pull-request/files");
            }}
          />
        ) : (
          <PullRequestReviewPlaceholder
            icon={MessagesSquare}
            title="Conversation unavailable"
            description="The pull request conversation could not be loaded."
          />
        )}
      </div>
    </div>
  );
}
