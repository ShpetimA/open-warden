import { Copy, MessageSquarePlus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { MentionConfig } from "@/components/markdown/MarkdownEditor";
import { PullRequestInlineReviewThread } from "@/features/pull-requests/components/PullRequestInlineReviewThread";
import { PullRequestPendingDraftItem } from "@/features/pull-requests/components/PullRequestPendingDraftItem";
import { usePullRequestPendingReviewActions } from "@/features/pull-requests/hooks/usePullRequestPendingReviewActions";
import { pullRequestAnchorLabel } from "@/features/pull-requests/utils/reviewAnchors";
import type { GitProviderId } from "@/platform/desktop";
import type { PullRequestReviewAnchor } from "@/features/source-control/types";

type PullRequestInlineAnchorAnnotationProps = {
  providerId?: GitProviderId;
  repoPath: string;
  pullRequestNumber: number;
  anchor: PullRequestReviewAnchor;
  compareBaseRef: string;
  compareHeadRef: string;
  mentions?: MentionConfig;
};

export function PullRequestInlineAnchorAnnotation({
  providerId,
  repoPath,
  pullRequestNumber,
  anchor,
  compareBaseRef,
  compareHeadRef,
  mentions,
}: PullRequestInlineAnchorAnnotationProps) {
  const pendingActions = usePullRequestPendingReviewActions({
    repoPath,
    pullRequestNumber,
    compareBaseRef,
    compareHeadRef,
  });
  const hasPendingDrafts = anchor.pendingDrafts.length > 0;

  return (
    <div className="flex w-full min-w-0 flex-col gap-2 py-1">
      {hasPendingDrafts ? (
        <div className="flex max-w-[32rem] flex-wrap items-center gap-1 border-b border-border/50 pb-1">
          <div className="text-muted-foreground mr-auto text-[10px] uppercase tracking-[0.12em]">
            {pullRequestAnchorLabel(anchor)} · {anchor.pendingDrafts.length} pending
          </div>
          <Button
            size="xs"
            disabled={pendingActions.isSubmittingReviewComments}
            onClick={() => {
              void pendingActions.publishAnchorPendingDrafts(anchor);
            }}
          >
            <MessageSquarePlus className="h-3 w-3" />
            Publish
          </Button>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => {
              void pendingActions.copyAnchorPendingDrafts(anchor);
            }}
          >
            <Copy className="h-3 w-3" />
            Copy
          </Button>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => {
              pendingActions.clearAnchorPendingDrafts(anchor);
            }}
          >
            <Trash2 className="h-3 w-3" />
            Clear
          </Button>
        </div>
      ) : null}

      {anchor.remoteThreads.map((thread) => (
        <PullRequestInlineReviewThread
          key={thread.id}
          providerId={providerId}
          repoPath={repoPath}
          pullRequestNumber={pullRequestNumber}
          thread={thread}
          mentions={mentions}
        />
      ))}

      {anchor.pendingDrafts.map((draft) => (
        <PullRequestPendingDraftItem
          key={draft.id}
          comment={draft}
          variant="inline"
          mentions={mentions}
        />
      ))}
    </div>
  );
}
