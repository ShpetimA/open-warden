import {
  CircleCheck,
  CircleDashed,
  CircleDot,
  CircleX,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
  MessageSquare,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type { CheckView, MergeabilityView, PullRequestStateView, ReviewerView } from "./types";

export type StatusTone = "success" | "danger" | "warning" | "neutral" | "info";

export const toneText: Record<StatusTone, string> = {
  success: "text-success",
  danger: "text-destructive",
  warning: "text-warning",
  neutral: "text-muted-foreground",
  info: "text-info",
};

export type StatusSummary = { tone: StatusTone; icon: LucideIcon; label: string; detail: string };

export function summarizeReviews(
  reviewers: ReviewerView[] | null,
  requiredApprovals: number | null,
): StatusSummary {
  if (reviewers === null)
    return {
      tone: "neutral",
      icon: CircleDashed,
      label: "Review status unavailable",
      detail: "Review status has not been loaded",
    };
  const approved = reviewers.filter((reviewer) => reviewer.state === "approved").length;
  const changes = reviewers.filter((reviewer) => reviewer.state === "changes-requested").length;
  const waiting = reviewers.filter((reviewer) => reviewer.state === "requested").length;
  const target = requiredApprovals ?? Math.max(reviewers.length, 1);

  if (changes > 0) {
    return {
      tone: "danger",
      icon: CircleX,
      label: "Changes requested",
      detail: `${changes} reviewer${changes === 1 ? "" : "s"} requested changes`,
    };
  }
  if (reviewers.length === 0) {
    return {
      tone: "neutral",
      icon: CircleDashed,
      label: "No reviewers",
      detail: "Nobody has been asked to review",
    };
  }
  if (approved >= target) {
    return {
      tone: "success",
      icon: CircleCheck,
      label: `${approved} approved`,
      detail: `${approved} of ${reviewers.length} reviewers approved`,
    };
  }
  return {
    tone: "warning",
    icon: CircleDot,
    label: `${approved}/${target} approved`,
    detail: `Waiting on ${waiting || target - approved} reviewer${(waiting || target - approved) === 1 ? "" : "s"}`,
  };
}

export function summarizeChecks(checks: CheckView[] | null): StatusSummary | null {
  if (!checks || checks.length === 0) return null;
  const failed = checks.filter((check) => check.state === "failed").length;
  const pending = checks.filter((check) => check.state === "pending").length;
  const passed = checks.length - failed - pending;
  const detail = [
    passed ? `${passed} passed` : null,
    failed ? `${failed} failed` : null,
    pending ? `${pending} running` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  if (failed > 0) return { tone: "danger", icon: CircleX, label: `${failed} failing`, detail };
  if (pending > 0)
    return { tone: "warning", icon: CircleDashed, label: `${pending} running`, detail };
  return { tone: "success", icon: CircleCheck, label: "Checks passed", detail };
}

export function summarizeMergeability(
  mergeability: MergeabilityView,
  baseRef: string,
): StatusSummary {
  if (mergeability === "conflicting") {
    return {
      tone: "danger",
      icon: TriangleAlert,
      label: "Conflicts",
      detail: `Conflicts with ${baseRef} must be resolved`,
    };
  }
  if (mergeability === "mergeable") {
    return {
      tone: "success",
      icon: CircleCheck,
      label: "No conflicts",
      detail: `Merges cleanly into ${baseRef}`,
    };
  }
  return {
    tone: "neutral",
    icon: CircleDashed,
    label: "Mergeability unknown",
    detail: "The provider has not reported conflicts yet",
  };
}

const stateMeta: Record<
  PullRequestStateView,
  { icon: LucideIcon; label: string; className: string }
> = {
  open: { icon: GitPullRequest, label: "Open", className: "bg-success text-success-foreground" },
  draft: { icon: GitPullRequestDraft, label: "Draft", className: "bg-muted text-muted-foreground" },
  merged: { icon: GitMerge, label: "Merged", className: "bg-[oklch(0.55_0.18_300)] text-white" },
  closed: { icon: GitPullRequestClosed, label: "Closed", className: "bg-destructive text-white" },
};

export function PullRequestStateBadge({ state }: { state: PullRequestStateView }) {
  const meta = stateMeta[state];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-medium",
        meta.className,
      )}
    >
      <Icon className="size-3.5" />
      {meta.label}
    </span>
  );
}

export function PullRequestStateIcon({ state }: { state: PullRequestStateView }) {
  const meta = stateMeta[state];
  const Icon = meta.icon;
  const color =
    state === "open"
      ? "text-success"
      : state === "merged"
        ? "text-[oklch(0.55_0.18_300)]"
        : state === "closed"
          ? "text-destructive"
          : "text-muted-foreground";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Icon aria-label={meta.label} className={cn("size-4 shrink-0", color)} />
      </TooltipTrigger>
      <TooltipContent side="top">{meta.label}</TooltipContent>
    </Tooltip>
  );
}

/** An icon and a few words; the tooltip carries the full sentence. */
export function StatusChip({
  summary,
  compact = false,
  onClick,
}: {
  summary: StatusSummary;
  compact?: boolean;
  onClick?: () => void;
}) {
  const Icon = summary.icon;
  const content = (
    <>
      <Icon className={cn("size-3.5 shrink-0", toneText[summary.tone])} />
      {compact ? null : <span>{summary.label}</span>}
    </>
  );
  const className =
    "text-muted-foreground hover:text-foreground inline-flex h-6 items-center gap-1.5 rounded-md px-1.5 text-xs transition-colors";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {onClick ? (
          <button type="button" className={className} onClick={onClick} aria-label={summary.detail}>
            {content}
          </button>
        ) : (
          <span className={className} aria-label={summary.detail}>
            {content}
          </span>
        )}
      </TooltipTrigger>
      <TooltipContent side="bottom">{summary.detail}</TooltipContent>
    </Tooltip>
  );
}

export function CommentCountChip({ count, unresolved }: { count: number; unresolved: number }) {
  return (
    <StatusChip
      summary={{
        tone: unresolved > 0 ? "warning" : "neutral",
        icon: MessageSquare,
        label:
          unresolved > 0 ? `${count} comments · ${unresolved} unresolved` : `${count} comments`,
        detail: `${count} comment${count === 1 ? "" : "s"}${unresolved > 0 ? `, ${unresolved} unresolved thread${unresolved === 1 ? "" : "s"}` : ""}`,
      }}
    />
  );
}

export function ReviewerStateIcon({ state }: { state: ReviewerView["state"] }): ReactNode {
  if (state === "approved")
    return <CircleCheck aria-label="Approved" className="text-success size-4" />;
  if (state === "changes-requested") {
    return <CircleX aria-label="Changes requested" className="text-destructive size-4" />;
  }
  if (state === "commented") {
    return <MessageSquare aria-label="Commented" className="text-muted-foreground size-4" />;
  }
  return <CircleDashed aria-label="Review requested" className="text-warning size-4" />;
}
