import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolvePullRequestContext: vi.fn(),
  fetchGitHubPullRequest: vi.fn(),
  githubGraphqlRequest: vi.fn(),
  githubJsonRequest: vi.fn(),
  githubRequest: vi.fn(),
  fetchBitbucketPullRequest: vi.fn(),
  bitbucketRequest: vi.fn(),
}));

vi.mock("./pullRequests", () => ({ resolvePullRequestContext: mocks.resolvePullRequestContext }));
vi.mock("../github-repo", () => ({
  fetchGitHubPullRequest: mocks.fetchGitHubPullRequest,
  githubGraphqlRequest: mocks.githubGraphqlRequest,
  githubJsonRequest: mocks.githubJsonRequest,
  githubRequest: mocks.githubRequest,
}));
vi.mock("../bitbucket-repo", () => ({
  fetchBitbucketPullRequest: mocks.fetchBitbucketPullRequest,
  bitbucketRequest: mocks.bitbucketRequest,
  bitbucketPullRequestPath: () => "/repositories/acme/app/pullrequests/7",
}));

import { runPullRequestLifecycle } from "./lifecycle";
import {
  getPullRequestActivity,
  getPullRequestViewedFiles,
  setPullRequestFileViewed,
} from "./continuity";

const input = { repoPath: "/repo", pullRequestNumber: 7 };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolvePullRequestContext.mockResolvedValue({
    hostedRepo: { providerId: "github", owner: "acme", repo: "app" },
    connection: { token: "secret" },
  });
  mocks.fetchGitHubPullRequest.mockResolvedValue({
    head: { sha: "abc123" },
    node_id: "PR_node",
    state: "open",
    draft: false,
    merged_at: null,
  });
});

describe("pull request lifecycle", () => {
  it("blocks a lifecycle mutation when the reviewed head changed", async () => {
    await expect(
      runPullRequestLifecycle({ ...input, expectedHeadSha: "older", action: "close" }),
    ).rejects.toThrow("changed");
    expect(mocks.githubJsonRequest).not.toHaveBeenCalled();
  });

  it("changes GitHub draft state through its pull request node", async () => {
    await runPullRequestLifecycle({ ...input, expectedHeadSha: "abc123", action: "draft" });
    expect(mocks.githubGraphqlRequest).toHaveBeenCalledWith(
      "secret",
      expect.stringContaining("convertPullRequestToDraft"),
      { id: "PR_node" },
    );
  });

  it("declines Bitbucket pull requests using its provider action", async () => {
    mocks.resolvePullRequestContext.mockResolvedValue({
      hostedRepo: { providerId: "bitbucket", owner: "acme", repo: "app" },
      connection: { token: "secret" },
    });
    mocks.fetchBitbucketPullRequest.mockResolvedValue({
      source: { commit: { hash: "abc123" } },
      state: "OPEN",
    });
    await runPullRequestLifecycle({ ...input, expectedHeadSha: "abc123", action: "close" });
    expect(mocks.bitbucketRequest).toHaveBeenCalledWith(
      "/repositories/acme/app/pullrequests/7/decline",
      expect.anything(),
      { method: "POST" },
    );
  });
});

describe("review continuity", () => {
  it("pages GitHub viewed files and marks a file using its node ID", async () => {
    mocks.githubGraphqlRequest
      .mockResolvedValueOnce({
        data: {
          repository: {
            pullRequest: {
              files: {
                pageInfo: { hasNextPage: true, endCursor: "next" },
                nodes: [{ path: "a.ts", viewerViewedState: "VIEWED" }],
              },
            },
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          repository: {
            pullRequest: {
              files: {
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: [{ path: "b.ts", viewerViewedState: "UNVIEWED" }],
              },
            },
          },
        },
      });
    expect(await getPullRequestViewedFiles(input)).toEqual({
      storage: "provider",
      viewedPaths: ["a.ts"],
      truncated: false,
    });
    await setPullRequestFileViewed({ ...input, path: "b.ts", viewed: true });
    expect(mocks.githubGraphqlRequest).toHaveBeenLastCalledWith(
      "secret",
      expect.stringContaining("markFileAsViewed"),
      { id: "PR_node", path: "b.ts" },
    );
  });

  it("separates timeline events and commits from discussion comments", async () => {
    mocks.githubRequest
      .mockResolvedValueOnce({
        data: [
          { id: 1, event: "commented", created_at: "2026-01-01T00:00:00Z" },
          {
            id: 2,
            event: "head_ref_force_pushed",
            created_at: "2026-01-02T00:00:00Z",
            actor: { login: "alice" },
          },
        ],
        headers: new Headers(),
      })
      .mockResolvedValueOnce({
        data: [
          {
            sha: "abc123",
            commit: {
              message: "Fix issue\nmore",
              author: { name: "Alice", date: "2026-01-03T00:00:00Z" },
            },
          },
        ],
        headers: new Headers(),
      });
    const activity = await getPullRequestActivity(input);
    expect(
      activity.items.map((item) => (item.kind === "commit" ? item.message : item.event)),
    ).toEqual(["Fix issue", "force-pushed"]);
    expect(activity.items[1]?.actor).toEqual({
      login: "alice",
      displayName: null,
      avatarUrl: null,
    });
    expect(activity.truncated).toBe(false);
  });

  it("reads what changed between Bitbucket snapshots and leaves pushes to commits", async () => {
    mocks.resolvePullRequestContext.mockResolvedValue({
      hostedRepo: { providerId: "bitbucket", owner: "acme", repo: "app" },
      connection: { token: "secret", authType: "bearer" },
    });
    const author = { nickname: "ana", display_name: "Ana" };
    const snapshot = (date: string, title: string, description: string, state = "OPEN") => ({
      update: { date, title, description, state, author },
    });
    mocks.bitbucketRequest
      .mockResolvedValueOnce({
        data: {
          values: [
            snapshot("2026-01-05T00:00:00Z", "New title", "Body v2", "MERGED"),
            { approval: { date: "2026-01-04T00:00:00Z", user: { nickname: "ben" } } },
            snapshot("2026-01-03T00:00:00Z", "New title", "Body v2"),
            snapshot("2026-01-02T00:00:00Z", "Old title", "Body v2"),
            snapshot("2026-01-01T12:00:00Z", "Old title", "Body v2"),
            snapshot("2026-01-01T00:00:00Z", "Old title", "Body v1"),
          ],
        },
      })
      .mockResolvedValueOnce({ data: { values: [] } });

    const activity = await getPullRequestActivity(input);

    expect(
      activity.items.map((item) => (item.kind === "event" ? [item.event, item.detail] : null)),
    ).toEqual([
      ["merged", null],
      ["approved", null],
      ["renamed", "Old title → New title"],
      ["edited", null],
    ]);
  });
});
