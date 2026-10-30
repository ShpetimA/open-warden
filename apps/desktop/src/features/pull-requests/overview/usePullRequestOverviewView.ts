import { useRetainPullRequestRefresh } from "../refresh/PullRequestRefreshProvider";
import { skipToken } from "@reduxjs/toolkit/query";

import {
  useGetPullRequestChecksQuery,
  useGetPullRequestConversationQuery,
  useGetPullRequestFilesQuery,
  useGetPullRequestReviewOverviewQuery,
} from "@/features/hosted-repos/api";
import type {
  PullRequestChangedFile,
  PullRequestDetail,
  PullRequestPerson,
  PullRequestReviewer,
} from "@/platform/desktop";

import type { PersonView, PullRequestOverviewView, ReviewerView } from "./types";

const REFRESH_RESOURCES = ["checks", "reviewers", "files"] as const;

export type PullRequestLocator = { repoPath: string; pullRequestNumber: number };

export function toPersonView(person: PullRequestPerson | null | undefined): PersonView | null {
  if (!person?.login) return null;
  return { login: person.login, name: person.displayName, avatarUrl: person.avatarUrl };
}

const unknownPerson: PersonView = { login: "unknown", name: "Unknown author", avatarUrl: null };

function toReviewerView(reviewer: PullRequestReviewer): ReviewerView {
  return {
    id: reviewer.id,
    login: reviewer.login,
    name: reviewer.displayName,
    avatarUrl: reviewer.avatarUrl,
    state: reviewer.state,
    reviewedAt: reviewer.reviewedAt,
  };
}

function overviewState(detail: PullRequestDetail): PullRequestOverviewView["state"] {
  if (detail.state === "merged" || detail.state === "closed") return detail.state;
  return detail.isDraft ? "draft" : "open";
}

function diffTotals(files: PullRequestChangedFile[] | undefined) {
  if (!files) return null;
  let additions = 0;
  let deletions = 0;
  for (const file of files) {
    additions += file.additions;
    deletions += file.deletions;
  }
  return { changedFiles: files.length, additions, deletions };
}

/**
 * Everything the header and merge box show about a pull request, read from the provider
 * queries. Each query hands back its cached data untouched so a poll that changes nothing
 * does not re-render the caller.
 */
export function usePullRequestOverviewView(
  locator: PullRequestLocator | typeof skipToken,
  repository: string,
): PullRequestOverviewView | null {
  useRetainPullRequestRefresh(locator === skipToken ? null : locator, REFRESH_RESOURCES);
  const { conversation } = useGetPullRequestConversationQuery(locator, {
    selectFromResult: ({ currentData: data }) => ({ conversation: data }),
  });
  const { files } = useGetPullRequestFilesQuery(locator, {
    selectFromResult: ({ currentData: data }) => ({ files: data }),
  });
  const { reviewers } = useGetPullRequestReviewOverviewQuery(locator, {
    selectFromResult: ({ currentData: data }) => ({ reviewers: data?.reviewers }),
  });
  const { checks } = useGetPullRequestChecksQuery(locator, {
    selectFromResult: ({ currentData: data }) => ({ checks: data }),
  });

  if (!conversation) return null;
  const { detail } = conversation;
  const currentChecks =
    checks?.headSha === detail.headSha && checks.baseSha === detail.baseSha && checks.complete
      ? checks
      : null;
  const threadComments = conversation.reviewThreads.reduce(
    (count, thread) => count + thread.comments.length,
    0,
  );

  return {
    number: detail.number,
    title: detail.title,
    body: detail.body,
    state: overviewState(detail),
    repository,
    baseRef: detail.baseRef,
    headRef: detail.headRef,
    author: toPersonView(detail.author) ?? unknownPerson,
    createdAt: detail.createdAt,
    updatedAt: detail.updatedAt,
    reviewers: reviewers ? reviewers.map(toReviewerView) : null,
    requiredApprovals: null,
    checks: currentChecks?.checks ?? null,
    mergeability: currentChecks?.mergeability ?? "unknown",
    commentCount: conversation.issueComments.length + threadComments,
    unresolvedThreadCount: conversation.reviewThreads.filter((thread) => !thread.isResolved).length,
    fileStats:
      files?.headSha === detail.headSha && files.baseSha === detail.baseSha
        ? diffTotals(files.files)
        : null,
    labels: detail.labels.map((label) => label.name),
  };
}
