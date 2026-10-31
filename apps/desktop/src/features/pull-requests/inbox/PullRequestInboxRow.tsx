import { GitBranch, MessageSquare } from "lucide-react";

import { DiffStat } from "@/components/ui/diff-stat";
import { RelativeTime } from "@/components/ui/relative-time";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { UserAvatar } from "@/components/ui/user-avatar";
import { PullRequestStateIcon, StatusChip } from "@/features/pull-requests/overview/status";
import { cn } from "@/lib/utils";
import type { PullRequestReviewer, PullRequestSummary } from "@/platform/desktop";

import { pullRequestStateView, summaryChecksStatus, summaryReviewStatus } from "./listStatus";

const reviewerRing: Record<PullRequestReviewer["state"], string> = {
  approved: "ring-success",
  "changes-requested": "ring-destructive",
  commented: "ring-border",
  requested: "ring-warning",
};

const reviewerVerb: Record<PullRequestReviewer["state"], string> = {
  approved: "approved",
  "changes-requested": "requested changes",
  commented: "commented",
  requested: "review requested",
};

function ReviewerStack({ reviewers }: { reviewers: PullRequestReviewer[] }) {
  if (reviewers.length === 0) return null;
  const shown = reviewers.slice(0, 3);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex -space-x-1">
          {shown.map((reviewer) => (
            <UserAvatar
              key={reviewer.id}
              login={reviewer.login}
              name={reviewer.displayName}
              avatarUrl={reviewer.avatarUrl}
              size="xs"
              className={cn("ring-2", reviewerRing[reviewer.state])}
            />
          ))}
          {reviewers.length > shown.length ? (
            <span className="bg-surface-1 text-muted-foreground ring-background flex size-4 items-center justify-center rounded-full text-[8px] ring-2">
              +{reviewers.length - shown.length}
            </span>
          ) : null}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="flex flex-col gap-0.5">
        {reviewers.map((reviewer) => (
          <span key={reviewer.id}>
            {reviewer.displayName ?? reviewer.login} · {reviewerVerb[reviewer.state]}
          </span>
        ))}
      </TooltipContent>
    </Tooltip>
  );
}

export function PullRequestInboxRow({
  pullRequest,
  selected,
  index,
  onSelect,
  onOpen,
}: {
  pullRequest: PullRequestSummary;
  selected: boolean;
  index: number;
  onSelect: () => void;
  onOpen: () => void;
}) {
  const review = summaryReviewStatus(pullRequest);
  const checks = summaryChecksStatus(pullRequest);
  const { author } = pullRequest;
  return (
    <button
      type="button"
      data-pull-request-row="true"
      data-pull-request-number={String(pullRequest.number)}
      data-nav-index={String(index)}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "border-border/50 focus-visible:ring-ring/50 flex w-full items-center gap-3 border-b px-4 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset",
        selected ? "bg-surface-active" : "hover:bg-surface-1",
      )}
      onClick={onSelect}
      onDoubleClick={onOpen}
    >
      <PullRequestStateIcon state={pullRequestStateView(pullRequest)} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[13px] font-medium">{pullRequest.title}</span>
          {pullRequest.isDraft ? (
            <StatusBadge size="sm" showDot={false}>
              Draft
            </StatusBadge>
          ) : null}
        </div>
        <div className="text-muted-foreground mt-1 flex min-w-0 items-center gap-1.5 text-xs">
          <UserAvatar
            login={author.login}
            name={author.displayName}
            avatarUrl={author.avatarUrl}
            size="xs"
          />
          <span className="text-foreground/80 shrink-0">{author.displayName ?? author.login}</span>
          <span aria-hidden="true">·</span>
          <span className="shrink-0 font-mono">#{pullRequest.number}</span>
          <span aria-hidden="true">·</span>
          <GitBranch className="size-3 shrink-0" />
          <span className="min-w-0 truncate font-mono text-[11px]">{pullRequest.headRef}</span>
          <span aria-hidden="true">·</span>
          <RelativeTime value={pullRequest.updatedAt} className="shrink-0" />
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <ReviewerStack reviewers={pullRequest.reviewers} />
        <span className="flex w-12 items-center justify-end gap-0.5">
          {review ? <StatusChip summary={review} compact /> : null}
          {checks ? <StatusChip summary={checks} compact /> : null}
        </span>
        <span
          className={cn(
            "text-muted-foreground flex w-9 items-center justify-end gap-1 text-xs tabular-nums",
            !pullRequest.commentCount && "invisible",
          )}
          aria-label={`${pullRequest.commentCount ?? 0} comments`}
        >
          <MessageSquare className="size-3.5" />
          {pullRequest.commentCount}
        </span>
        {pullRequest.additions !== null && pullRequest.deletions !== null ? (
          <span className="flex w-24 items-center justify-end gap-1.5">
            <DiffStat kind="addition" value={pullRequest.additions} />
            <DiffStat kind="deletion" value={pullRequest.deletions} />
          </span>
        ) : null}
      </div>
    </button>
  );
}
