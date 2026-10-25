import type { HostedRepoRef, PullRequestDetail, PullRequestSummary } from "@/platform/desktop";

export function pullRequestSummaryFromDetail(
  detail: PullRequestDetail,
  repository: Pick<HostedRepoRef, "owner" | "repo">,
): PullRequestSummary {
  return {
    id: detail.id,
    providerId: detail.providerId,
    number: detail.number,
    title: detail.title,
    state: detail.state,
    isDraft: detail.isDraft,
    author: detail.author ?? { login: "", displayName: null, avatarUrl: null },
    url: detail.url,
    baseRef: detail.baseRef,
    headRef: detail.headRef,
    headOwner: repository.owner,
    headRepo: repository.repo,
    createdAt: detail.createdAt,
    updatedAt: detail.updatedAt,
    reviewers: [],
    reviewDecision: null,
    checksState: null,
    commentCount: null,
    additions: null,
    deletions: null,
    changedFiles: null,
  };
}
