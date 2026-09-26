import type {
  PullRequestLocatorInput,
  PullRequestReviewOverview,
  PullRequestReviewer,
  SetPullRequestReviewerInput,
  SubmitPullRequestReviewInput,
  SubmitPullRequestReviewResult,
} from "../../src/platform/desktop/contracts";
import {
  bitbucketPullRequestPath,
  bitbucketRequest,
  fetchBitbucketPullRequest,
} from "../bitbucket-repo";
import { fetchGitHubPullRequest, githubJsonRequest, githubRequest } from "../github-repo";
import { providerDisplayName } from "./providers";
import {
  addPullRequestComment,
  normalizePullRequestReviewComments,
  resolvePullRequestContext,
  submitPullRequestDecision,
  submitPullRequestReviewComments,
  toGitHubReviewCommentInput,
} from "./pullRequests";

type GitHubReview = {
  id: number;
  state: string;
  submitted_at: string | null;
  user: { login: string; name?: string | null; avatar_url?: string | null } | null;
};

async function listGitHubReviews(path: string, token: string) {
  const reviews: GitHubReview[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const response = await githubRequest<GitHubReview[]>(
      `${path}/reviews?per_page=100&page=${page}`,
      token,
    );
    reviews.push(...response.data);
    if (!response.headers.get("link")?.includes('rel="next"')) break;
  }
  return reviews;
}

export async function getPullRequestReviewOverview(
  input: PullRequestLocatorInput,
): Promise<PullRequestReviewOverview> {
  const { hostedRepo, connection } = await resolvePullRequestContext(input);
  if (hostedRepo.providerId === "github") {
    const path = `/repos/${encodeURIComponent(hostedRepo.owner)}/${encodeURIComponent(hostedRepo.repo)}/pulls/${input.pullRequestNumber}`;
    const [pullRequest, reviews, repositoryPermission] = await Promise.all([
      fetchGitHubPullRequest(hostedRepo, connection.token, input.pullRequestNumber),
      listGitHubReviews(path, connection.token),
      githubJsonRequest<{ permissions?: { push?: boolean } }>(
        `/repos/${encodeURIComponent(hostedRepo.owner)}/${encodeURIComponent(hostedRepo.repo)}`,
        connection.token,
      ).catch(() => null),
    ]);
    const latestByLogin = new Map<string, PullRequestReviewer>();
    for (const review of reviews) {
      const login = review.user?.login;
      if (!login) continue;
      const state =
        review.state === "APPROVED"
          ? "approved"
          : review.state === "CHANGES_REQUESTED"
            ? "changes-requested"
            : review.state === "COMMENTED"
              ? "commented"
              : null;
      if (!state) {
        if (review.state === "DISMISSED") latestByLogin.delete(login);
        continue;
      }
      latestByLogin.set(login, {
        id: login,
        login,
        displayName: review.user?.name ?? null,
        avatarUrl: review.user?.avatar_url ?? null,
        state,
        reviewedAt: review.submitted_at,
      });
    }
    for (const reviewer of pullRequest.requested_reviewers ?? []) {
      latestByLogin.set(reviewer.login, {
        id: reviewer.login,
        login: reviewer.login,
        displayName: reviewer.name ?? null,
        avatarUrl: reviewer.avatar_url ?? null,
        state: "requested",
        reviewedAt: null,
      });
    }
    return {
      reviewers: Array.from(latestByLogin.values()),
      viewerLogin: connection.login,
      canManageReviewers: repositoryPermission?.permissions?.push ?? null,
    };
  }

  if (hostedRepo.providerId === "bitbucket") {
    const pullRequest = await fetchBitbucketPullRequest(
      hostedRepo,
      connection,
      input.pullRequestNumber,
    );
    const reviewers = (pullRequest.reviewers ?? []).map((reviewer): PullRequestReviewer => {
      const participation = pullRequest.participants?.find(
        (item) => item.user?.uuid && item.user.uuid === reviewer.uuid,
      );
      const state =
        participation?.state === "changes_requested"
          ? "changes-requested"
          : participation?.approved || participation?.state === "approved"
            ? "approved"
            : "requested";
      return {
        id: reviewer.uuid ?? reviewer.nickname ?? reviewer.username ?? "",
        login: reviewer.nickname ?? reviewer.username ?? reviewer.uuid ?? "unknown",
        displayName: reviewer.display_name ?? null,
        avatarUrl: reviewer.links?.avatar?.href ?? null,
        state,
        reviewedAt: participation?.participated_on ?? null,
      };
    });
    return { reviewers, viewerLogin: connection.login, canManageReviewers: null };
  }
  throw new Error(
    `${providerDisplayName(hostedRepo.providerId)} review data is not supported yet.`,
  );
}

export async function setPullRequestReviewer(input: SetPullRequestReviewerInput): Promise<void> {
  const reviewer = input.reviewer.trim();
  if (!reviewer) throw new Error("Enter a reviewer.");
  const { hostedRepo, connection } = await resolvePullRequestContext(input);
  if (hostedRepo.providerId === "github") {
    if (!/^[a-zA-Z0-9-]+$/.test(reviewer)) throw new Error("Enter a valid GitHub username.");
    const current = await fetchGitHubPullRequest(
      hostedRepo,
      connection.token,
      input.pullRequestNumber,
    );
    if (current.state !== "open")
      throw new Error("Reviewers can only be changed on open pull requests.");
    await githubJsonRequest(
      `/repos/${encodeURIComponent(hostedRepo.owner)}/${encodeURIComponent(hostedRepo.repo)}/pulls/${input.pullRequestNumber}/requested_reviewers`,
      connection.token,
      { method: input.requested ? "POST" : "DELETE", body: { reviewers: [reviewer] } },
    );
    return;
  }
  if (hostedRepo.providerId === "bitbucket") {
    const current = await fetchBitbucketPullRequest(
      hostedRepo,
      connection,
      input.pullRequestNumber,
    );
    if (current.state !== "OPEN")
      throw new Error("Reviewers can only be changed on open pull requests.");
    let reviewerId = reviewer;
    if (input.requested && !reviewer.startsWith("{")) {
      const expression = `user.nickname = "${reviewer.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
      const { data } = await bitbucketRequest<{
        values: Array<{ user?: { uuid?: string; nickname?: string } }>;
      }>(
        `/workspaces/${encodeURIComponent(hostedRepo.owner)}/members?q=${encodeURIComponent(expression)}&pagelen=100`,
        connection,
      );
      const match = data.values.find((member) => member.user?.nickname === reviewer);
      if (!match?.user?.uuid)
        throw new Error("No Bitbucket workspace member matched that username.");
      reviewerId = match.user.uuid;
    }
    const ids = new Set(
      (current.reviewers ?? []).flatMap((item) => (item.uuid ? [item.uuid] : [])),
    );
    if (input.requested) ids.add(reviewerId);
    else ids.delete(reviewerId);
    await bitbucketRequest(
      bitbucketPullRequestPath(hostedRepo, input.pullRequestNumber),
      connection,
      { method: "PUT", body: { reviewers: Array.from(ids, (uuid) => ({ uuid })) } },
    );
    return;
  }
  throw new Error(
    `${providerDisplayName(hostedRepo.providerId)} reviewer management is not supported yet.`,
  );
}

export async function submitPullRequestReview(
  input: SubmitPullRequestReviewInput,
): Promise<SubmitPullRequestReviewResult> {
  const comments = normalizePullRequestReviewComments(input.comments);
  const body = input.body.trim();
  if (input.decision === "comment" && !body && comments.length === 0) {
    throw new Error("Write a review note or add an inline comment first.");
  }
  if (input.decision === "request-changes" && !body) {
    throw new Error("Explain the changes requested before submitting the review.");
  }
  const { hostedRepo, connection } = await resolvePullRequestContext(input);
  if (hostedRepo.providerId === "github") {
    const current = await fetchGitHubPullRequest(
      hostedRepo,
      connection.token,
      input.pullRequestNumber,
    );
    if (current.state !== "open" || current.draft)
      throw new Error("This pull request is not ready for review.");
    if (current.head.sha !== input.expectedHeadSha)
      throw new Error("The pull request changed. Review the latest commit before submitting.");
    const event =
      input.decision === "approve"
        ? "APPROVE"
        : input.decision === "request-changes"
          ? "REQUEST_CHANGES"
          : "COMMENT";
    await githubJsonRequest(
      `/repos/${encodeURIComponent(hostedRepo.owner)}/${encodeURIComponent(hostedRepo.repo)}/pulls/${input.pullRequestNumber}/reviews`,
      connection.token,
      { method: "POST", body: { event, body, comments: comments.map(toGitHubReviewCommentInput) } },
    );
    return {
      submittedDraftIds: comments.map((comment) => comment.draftId),
      decisionSubmitted: true,
      failedMessage: null,
    };
  }
  if (hostedRepo.providerId === "bitbucket") {
    const current = await fetchBitbucketPullRequest(
      hostedRepo,
      connection,
      input.pullRequestNumber,
    );
    if (current.state !== "OPEN" || current.draft)
      throw new Error("This pull request is not ready for review.");
    if (current.source?.commit?.hash !== input.expectedHeadSha)
      throw new Error("The pull request changed. Review the latest commit before submitting.");
    const published = await submitPullRequestReviewComments({ ...input, comments });
    if (published.failedMessage)
      return {
        submittedDraftIds: published.submittedDraftIds,
        decisionSubmitted: false,
        failedMessage: published.failedMessage,
      };
    try {
      if (body) await addPullRequestComment({ ...input, body });
      if (input.decision !== "comment")
        await submitPullRequestDecision({ ...input, body, decision: input.decision });
      return {
        submittedDraftIds: published.submittedDraftIds,
        decisionSubmitted: true,
        failedMessage: null,
      };
    } catch (error) {
      return {
        submittedDraftIds: published.submittedDraftIds,
        decisionSubmitted: false,
        failedMessage: error instanceof Error ? error.message : String(error),
      };
    }
  }
  throw new Error(
    `${providerDisplayName(hostedRepo.providerId)} review submission is not supported yet.`,
  );
}
