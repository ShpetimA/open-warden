import { CircleCheck, CircleDot } from "lucide-react";

import {
  summarizeChecks,
  summarizeReviews,
  type StatusSummary,
} from "@/features/pull-requests/overview/status";
import type { ReviewerView } from "@/features/pull-requests/overview/types";
import type { PullRequestReviewer, PullRequestSummary } from "@/platform/desktop";

export function toReviewerViews(reviewers: PullRequestReviewer[]): ReviewerView[] {
  return reviewers.map((reviewer) => ({
    id: reviewer.id,
    login: reviewer.login,
    name: reviewer.displayName,
    avatarUrl: reviewer.avatarUrl,
    state: reviewer.state,
    reviewedAt: reviewer.reviewedAt,
  }));
}

/** Review state for a list row: the provider's decision wins over counting reviewers. */
export function summaryReviewStatus(pullRequest: PullRequestSummary): StatusSummary | null {
  if (pullRequest.reviewDecision === null && pullRequest.reviewers.length === 0) return null;
  const summary = summarizeReviews(toReviewerViews(pullRequest.reviewers), null);
  // Once a pull request is merged or closed, a review still "waiting" is no longer news.
  if (pullRequest.state !== "open" && summary.tone === "warning") return null;
  if (pullRequest.reviewDecision === "approved" && summary.tone !== "success") {
    return { tone: "success", icon: CircleCheck, label: "Approved", detail: "Approved" };
  }
  if (pullRequest.reviewDecision === "review-required" && summary.tone === "success") {
    return {
      tone: "warning",
      icon: CircleDot,
      label: "Review required",
      detail: "Branch rules require more approvals",
    };
  }
  return summary;
}

export function summaryChecksStatus(pullRequest: PullRequestSummary): StatusSummary | null {
  if (!pullRequest.checksState) return null;
  return summarizeChecks([
    { id: "rollup", name: "Checks", description: null, state: pullRequest.checksState, url: null },
  ]);
}

export function pullRequestStateView(pullRequest: PullRequestSummary) {
  if (pullRequest.state === "merged" || pullRequest.state === "closed") return pullRequest.state;
  return pullRequest.isDraft ? "draft" : "open";
}
