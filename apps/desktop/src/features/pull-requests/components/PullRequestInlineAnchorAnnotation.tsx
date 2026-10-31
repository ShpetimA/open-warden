import { ChevronDown, ChevronRight, Copy, MessageSquarePlus, Trash2 } from "lucide-react";
import { useState } from "react";

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
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex w-full min-w-0 max-w-3xl flex-col gap-1 py-2 pr-2 font-sans whitespace-normal">
      {hasPendingDrafts ? (
        <div className="flex min-h-7 flex-wrap items-center gap-1">
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground mr-auto flex min-h-7 items-center gap-1 text-[11px] tabular-nums"
            aria-label={collapsed ? "Expand pending comments" : "Collapse pending comments"}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((current) => !current)}
          >
            {collapsed ? <ChevronRight className="size-3" /> : <ChevronDown className="size-3" />}
            {pullRequestAnchorLabel(anchor)} · {anchor.pendingDrafts.length} pending
          </button>
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

      <div hidden={collapsed} className="space-y-1">
        {anchor.pendingDrafts.map((draft) => (
          <PullRequestPendingDraftItem
            key={draft.id}
            comment={draft}
            variant="inline"
            mentions={mentions}
          />
        ))}
      </div>
    </div>
  );
}
