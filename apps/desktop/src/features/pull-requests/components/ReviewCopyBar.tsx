import { skipToken } from "@reduxjs/toolkit/query";
import { useHotkey } from "@tanstack/react-hotkeys";
import { Copy, MessageSquarePlus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useGetPullRequestConversationQuery } from "@/features/hosted-repos/api";
import { usePullRequestPendingReviewActions } from "@/features/pull-requests/hooks/usePullRequestPendingReviewActions";
import { buildPullRequestReviewCommentsPayload } from "@/features/pull-requests/utils/reviewCommentsPayload";
import { isTypingTarget } from "@/features/source-control/utils";

type ReviewCommentsCopyToolbarProps = {
  repoPath: string;
  pullRequestNumber: number;
  compareBaseRef: string;
  compareHeadRef: string;
  activePath: string;
  activePreviousPath?: string;
};

function joinReviewCommentPayloads(...payloads: string[]) {
  return payloads.filter(Boolean).join("\n");
}

function ReviewCommentsCopyToolbar({
  repoPath,
  pullRequestNumber,
  compareBaseRef,
  compareHeadRef,
  activePath,
  activePreviousPath,
}: ReviewCommentsCopyToolbarProps) {
  const pendingActions = usePullRequestPendingReviewActions({
    repoPath,
    pullRequestNumber,
    compareBaseRef,
    compareHeadRef,
  });
  const conversationQueryArg =
    repoPath && pullRequestNumber > 0 ? { repoPath, pullRequestNumber } : skipToken;
  const { reviewThreads } = useGetPullRequestConversationQuery(conversationQueryArg, {
    selectFromResult: ({ data }) => ({
      reviewThreads: data?.reviewThreads ?? [],
    }),
    pollingInterval: 10000,
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });

  const filePendingPayload = activePath ? pendingActions.getPendingPayloadForFile(activePath) : "";
  const filePendingCommentCount = activePath
    ? pendingActions.getPendingDraftsForFile(activePath).length
    : 0;
  const filePublishedPayload = activePath
    ? buildPullRequestReviewCommentsPayload({
        reviewThreads,
        path: activePath,
        previousPath: activePreviousPath,
      })
    : "";
  const allPublishedPayload = buildPullRequestReviewCommentsPayload({ reviewThreads });
  const filePayload = joinReviewCommentPayloads(filePublishedPayload, filePendingPayload);
  const allPayload = joinReviewCommentPayloads(
    allPublishedPayload,
    pendingActions.allPendingPayload,
  );
  const totalPendingCommentCount = pendingActions.pendingDraftCount;
  const hasFileReviewComments = filePayload.length > 0;
  const hasAnyReviewComments = allPayload.length > 0;

  const copyReviewCommentsPayload = async (payload: string, successMessage: string) => {
    if (!payload) {
      return;
    }

    try {
      await navigator.clipboard.writeText(payload);
      toast.success(successMessage);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to copy review comments");
    }
  };

  useHotkey(
    "Mod+Alt+C",
    (event) => {
      if (isTypingTarget(event.target)) {
        return;
      }

      event.preventDefault();
      void copyReviewCommentsPayload(allPayload, "Copied all review comments");
    },
    {
      enabled: hasAnyReviewComments,
    },
  );

  useHotkey(
    "Mod+C",
    (event) => {
      if (isTypingTarget(event.target)) {
        return;
      }

      event.preventDefault();
      void copyReviewCommentsPayload(filePayload, "Copied file review comments");
    },
    {
      enabled: hasFileReviewComments,
    },
  );

  return (
    <div className="border-border/70 bg-surface-toolbar flex items-center justify-between gap-2 border-b px-2 py-1">
      <div className="text-muted-foreground min-w-0 text-xs">
        {totalPendingCommentCount > 0
          ? `${totalPendingCommentCount} pending comment${totalPendingCommentCount === 1 ? "" : "s"}${filePendingCommentCount > 0 ? ` · ${filePendingCommentCount} in this file` : ""}`
          : "No pending inline comments"}
      </div>
      <div className="flex items-center gap-1">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="xs"
                disabled={
                  totalPendingCommentCount === 0 || pendingActions.isSubmittingReviewComments
                }
                onClick={() => {
                  void pendingActions.publishAllPendingDrafts();
                }}
                aria-label="Publish all pending review comments"
              >
                <MessageSquarePlus />
                Publish all
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Publish all pending inline comments</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="xs"
                variant="ghost"
                disabled={!hasFileReviewComments}
                onClick={() => {
                  void copyReviewCommentsPayload(filePayload, "Copied file review comments");
                }}
                aria-label="Copy file review comments"
              >
                <Copy />
                File
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Copy file review comments</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="xs"
                variant="ghost"
                disabled={!hasAnyReviewComments}
                onClick={() => {
                  void copyReviewCommentsPayload(allPayload, "Copied all review comments");
                }}
                aria-label="Copy all review comments"
              >
                <Copy />
                All
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Copy all review comments (⌘⌥C)</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
}

export default ReviewCommentsCopyToolbar;
