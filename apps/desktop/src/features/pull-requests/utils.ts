import type { GitProviderId } from "@/platform/desktop";

type PullRequestReviewPathInput = {
  providerId: GitProviderId;
  owner: string;
  repo: string;
  pullRequestNumber: number;
};

export function buildPullRequestReviewPath({
  providerId,
  owner,
  repo,
  pullRequestNumber,
}: PullRequestReviewPathInput) {
  return `/pull-requests/${providerId}/${owner}/${repo}/${String(pullRequestNumber)}`;
}
