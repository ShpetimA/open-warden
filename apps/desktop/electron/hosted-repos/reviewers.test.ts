import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolvePullRequestContext: vi.fn(),
  fetchGitHubPullRequest: vi.fn(),
  githubJsonRequest: vi.fn(),
  githubRequest: vi.fn(),
  fetchBitbucketPullRequest: vi.fn(),
  submitPullRequestReviewComments: vi.fn(),
  addPullRequestComment: vi.fn(),
  submitPullRequestDecision: vi.fn(),
}));

vi.mock("./pullRequests", () => ({
  resolvePullRequestContext: mocks.resolvePullRequestContext,
  normalizePullRequestReviewComments: (comments: unknown[]) => comments,
  toGitHubReviewCommentInput: (comment: { body: string; path: string; line: number }) => ({
    body: comment.body,
    path: comment.path,
    line: comment.line,
  }),
  submitPullRequestReviewComments: mocks.submitPullRequestReviewComments,
  addPullRequestComment: mocks.addPullRequestComment,
  submitPullRequestDecision: mocks.submitPullRequestDecision,
}));
vi.mock("../github-repo", () => ({
  fetchGitHubPullRequest: mocks.fetchGitHubPullRequest,
  githubJsonRequest: mocks.githubJsonRequest,
  githubRequest: mocks.githubRequest,
}));
vi.mock("../bitbucket-repo", () => ({
  fetchBitbucketPullRequest: mocks.fetchBitbucketPullRequest,
  bitbucketRequest: vi.fn(),
  bitbucketPullRequestPath: () => "/repositories/acme/app/pullrequests/7",
}));

import { getPullRequestReviewOverview, submitPullRequestReview } from "./reviewers";

const input = {
  repoPath: "/repo",
  pullRequestNumber: 7,
  expectedHeadSha: "abc123",
  decision: "approve" as const,
  body: "Looks good",
  comments: [
    { draftId: "draft-1", body: "Nit", path: "src/a.ts", line: 10, side: "RIGHT" as const },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolvePullRequestContext.mockResolvedValue({
    hostedRepo: { providerId: "github", owner: "acme", repo: "app" },
    connection: { token: "secret", login: "reviewer" },
  });
  mocks.fetchGitHubPullRequest.mockResolvedValue({
    state: "open",
    draft: false,
    head: { sha: "abc123" },
    requested_reviewers: [],
  });
});

describe("unified pull request review", () => {
  it("sends the decision and inline comments in one GitHub review request", async () => {
    const result = await submitPullRequestReview(input);
    expect(mocks.githubJsonRequest).toHaveBeenCalledWith(
      "/repos/acme/app/pulls/7/reviews",
      "secret",
      {
        method: "POST",
        body: {
          event: "APPROVE",
          body: "Looks good",
          comments: [{ body: "Nit", path: "src/a.ts", line: 10 }],
        },
      },
    );
    expect(result).toEqual({
      submittedDraftIds: ["draft-1"],
      decisionSubmitted: true,
      failedMessage: null,
    });
  });

  it("does not submit an outdated GitHub review", async () => {
    mocks.fetchGitHubPullRequest.mockResolvedValue({
      state: "open",
      draft: false,
      head: { sha: "new" },
    });
    await expect(submitPullRequestReview(input)).rejects.toThrow("changed");
    expect(mocks.githubJsonRequest).not.toHaveBeenCalled();
  });

  it("returns only published Bitbucket draft IDs when a later comment fails", async () => {
    mocks.resolvePullRequestContext.mockResolvedValue({
      hostedRepo: { providerId: "bitbucket", owner: "acme", repo: "app" },
      connection: { token: "secret" },
    });
    mocks.fetchBitbucketPullRequest.mockResolvedValue({
      state: "OPEN",
      draft: false,
      source: { commit: { hash: "abc123" } },
    });
    mocks.submitPullRequestReviewComments.mockResolvedValue({
      submittedDraftIds: ["draft-1"],
      failedMessage: "Second comment failed",
    });
    const result = await submitPullRequestReview({
      ...input,
      comments: [...input.comments, { ...input.comments[0], draftId: "draft-2" }],
    });
    expect(result).toEqual({
      submittedDraftIds: ["draft-1"],
      decisionSubmitted: false,
      failedMessage: "Second comment failed",
    });
    expect(mocks.submitPullRequestDecision).not.toHaveBeenCalled();
  });
});

describe("reviewer overview", () => {
  it("shows requested GitHub reviewers and the latest review state", async () => {
    mocks.fetchGitHubPullRequest.mockResolvedValue({
      requested_reviewers: [{ login: "bob" }],
      state: "open",
    });
    mocks.githubRequest.mockResolvedValue({
      data: [
        { id: 1, state: "COMMENTED", user: { login: "alice" }, submitted_at: "2026-01-01" },
        { id: 2, state: "APPROVED", user: { login: "alice" }, submitted_at: "2026-01-02" },
      ],
      headers: new Headers(),
    });
    mocks.githubJsonRequest.mockResolvedValue({ permissions: { push: true } });
    const overview = await getPullRequestReviewOverview({
      repoPath: "/repo",
      pullRequestNumber: 7,
    });
    expect(overview.reviewers).toMatchObject([
      { login: "alice", state: "approved" },
      { login: "bob", state: "requested" },
    ]);
    expect(overview.canManageReviewers).toBe(true);
  });
});
