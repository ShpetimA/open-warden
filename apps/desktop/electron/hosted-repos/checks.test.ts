import { beforeEach, describe, expect, it, vi } from "vitest";

const providerMocks = vi.hoisted(() => ({
  resolveHostedRepo: vi.fn(),
  getProviderConnection: vi.fn(),
  fetchGitHubPullRequest: vi.fn(),
  githubJsonRequest: vi.fn(),
  fetchBitbucketPullRequest: vi.fn(),
  bitbucketRequest: vi.fn(),
}));

vi.mock("./repository", () => ({ resolveHostedRepo: providerMocks.resolveHostedRepo }));
vi.mock("../providerConnections", () => ({
  getProviderConnection: providerMocks.getProviderConnection,
}));
vi.mock("../github-repo", () => ({
  fetchGitHubPullRequest: providerMocks.fetchGitHubPullRequest,
  githubJsonRequest: providerMocks.githubJsonRequest,
}));
vi.mock("../bitbucket-repo", () => ({
  fetchBitbucketPullRequest: providerMocks.fetchBitbucketPullRequest,
  bitbucketRequest: providerMocks.bitbucketRequest,
  bitbucketPullRequestPath: () => "/repositories/acme/app/pullrequests/7",
}));

import {
  bitbucketStatusState,
  combineGitHubChecks,
  getPullRequestChecks,
  githubCheckState,
  githubStatusState,
} from "./checks";

beforeEach(() => {
  vi.clearAllMocks();
  providerMocks.getProviderConnection.mockResolvedValue({ token: "secret" });
});

describe("pull request check state mapping", () => {
  it("keeps running and unknown GitHub check conclusions pending", () => {
    const run = {
      id: 1,
      name: "build",
      status: "in_progress",
      conclusion: null,
      details_url: null,
    };
    expect(githubCheckState(run)).toBe("pending");
    expect(githubCheckState({ ...run, status: "completed" })).toBe("pending");
    expect(githubCheckState({ ...run, status: "completed", conclusion: "failure" })).toBe("failed");
    expect(githubCheckState({ ...run, status: "completed", conclusion: "skipped" })).toBe("passed");
  });

  it("maps commit statuses without treating unknown values as failures", () => {
    expect(githubStatusState("success")).toBe("passed");
    expect(githubStatusState("error")).toBe("failed");
    expect(githubStatusState("pending")).toBe("pending");
    expect(githubStatusState("new-state")).toBe("pending");
    expect(bitbucketStatusState("SUCCESSFUL")).toBe("passed");
    expect(bitbucketStatusState("STOPPED")).toBe("failed");
    expect(bitbucketStatusState("INPROGRESS")).toBe("pending");
    expect(bitbucketStatusState("new-state")).toBe("pending");
  });

  it("counts a check run and its matching commit status once", () => {
    const checks = combineGitHubChecks(
      [
        {
          id: 7,
          name: "Build",
          status: "completed",
          conclusion: "success",
          details_url: "https://example.com/build",
        },
        {
          id: 8,
          name: "Build",
          status: "completed",
          conclusion: "failure",
          details_url: "https://example.com/old-build",
        },
      ],
      [
        {
          id: 9,
          context: "build",
          state: "success",
          description: null,
          target_url: "https://example.com/status",
        },
        {
          id: 10,
          context: "Deploy",
          state: "pending",
          description: null,
          target_url: "javascript:alert(1)",
        },
      ],
    );
    expect(checks).toHaveLength(2);
    expect(checks.map((check) => check.name)).toEqual(["Build", "Deploy"]);
    expect(checks[0]?.state).toBe("failed");
    expect(checks[1]?.url).toBeNull();
  });
});

describe("pull request checks provider reads", () => {
  it("combines GitHub runs and statuses for the PR head without duplicate contexts", async () => {
    providerMocks.resolveHostedRepo.mockResolvedValue({
      providerId: "github",
      owner: "acme",
      repo: "app",
    });
    providerMocks.fetchGitHubPullRequest.mockResolvedValue({
      head: { sha: "abc123" },
      mergeable: false,
    });
    providerMocks.githubJsonRequest
      .mockResolvedValueOnce({
        total_count: 1,
        check_runs: [
          { id: 1, name: "Build", status: "completed", conclusion: "success", details_url: null },
        ],
      })
      .mockResolvedValueOnce({
        statuses: [
          { id: 2, context: "Build", state: "success", description: null, target_url: null },
        ],
      });

    const result = await getPullRequestChecks({ repoPath: "/repo", pullRequestNumber: 7 });

    expect(result).toMatchObject({
      headSha: "abc123",
      complete: true,
      mergeability: "conflicting",
    });
    expect(result.checks).toHaveLength(1);
    expect(providerMocks.githubJsonRequest).toHaveBeenCalledWith(
      "/repos/acme/app/commits/abc123/check-runs?per_page=100",
      "secret",
    );
  });

  it("keeps available GitHub statuses when check runs are denied", async () => {
    providerMocks.resolveHostedRepo.mockResolvedValue({
      providerId: "github",
      owner: "acme",
      repo: "app",
    });
    providerMocks.fetchGitHubPullRequest.mockResolvedValue({
      head: { sha: "abc123" },
      mergeable: null,
    });
    providerMocks.githubJsonRequest
      .mockRejectedValueOnce(new Error("Forbidden"))
      .mockResolvedValueOnce({
        statuses: [
          { id: 2, context: "Build", state: "pending", description: null, target_url: null },
        ],
      });

    const result = await getPullRequestChecks({ repoPath: "/repo", pullRequestNumber: 7 });

    expect(result).toMatchObject({ complete: false, mergeability: "unknown" });
    expect(result.checks.map((check) => check.name)).toEqual(["Build"]);
  });

  it("reads all Bitbucket status pages and preserves checks when conflicts are unavailable", async () => {
    providerMocks.resolveHostedRepo.mockResolvedValue({
      providerId: "bitbucket",
      owner: "acme",
      repo: "app",
    });
    providerMocks.fetchBitbucketPullRequest.mockResolvedValue({
      source: { commit: { hash: "abc123" } },
    });
    providerMocks.bitbucketRequest
      .mockResolvedValueOnce({
        data: {
          values: [{ key: "build", state: "SUCCESSFUL" }],
          next: "https://api.bitbucket.org/next",
        },
      })
      .mockResolvedValueOnce({ data: { values: [{ key: "test", state: "FAILED" }] } })
      .mockRejectedValueOnce(new Error("Not available"));

    const result = await getPullRequestChecks({ repoPath: "/repo", pullRequestNumber: 7 });

    expect(result).toMatchObject({ headSha: "abc123", complete: true, mergeability: "unknown" });
    expect(result.checks.map((check) => check.state)).toEqual(["passed", "failed"]);
  });
});
