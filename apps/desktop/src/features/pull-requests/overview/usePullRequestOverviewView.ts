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
  let additions = 0;
  let deletions = 0;
  for (const file of files ?? []) {
    additions += file.additions;
    deletions += file.deletions;
  }
  return { changedFiles: files?.length ?? 0, additions, deletions };
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
  const { conversation } = useGetPullRequestConversationQuery(locator, {
    selectFromResult: ({ data }) => ({ conversation: data }),
  });
  const { files } = useGetPullRequestFilesQuery(locator, {
    selectFromResult: ({ data }) => ({ files: data }),
  });
  const { reviewers } = useGetPullRequestReviewOverviewQuery(locator, {
    selectFromResult: ({ data }) => ({ reviewers: data?.reviewers }),
  });
  const { checks } = useGetPullRequestChecksQuery(locator, {
    pollingInterval: 60_000,
    refetchOnFocus: true,
    selectFromResult: ({ data }) => ({ checks: data }),
  });

  if (!conversation) return null;
  const { detail } = conversation;
  const currentChecks = checks?.headSha === detail.headSha ? checks : null;
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
    reviewers: (reviewers ?? []).map(toReviewerView),
    requiredApprovals: null,
    checks: currentChecks?.checks ?? null,
    mergeability: currentChecks?.mergeability ?? "unknown",
    commentCount: conversation.issueComments.length + threadComments,
    unresolvedThreadCount: conversation.reviewThreads.filter((thread) => !thread.isResolved).length,
    ...diffTotals(files),
    labels: detail.labels.map((label) => label.name),
  };
}
