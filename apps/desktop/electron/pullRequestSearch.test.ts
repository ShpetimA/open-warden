import { afterEach, describe, expect, it, vi } from "vitest";

import { listBitbucketPullRequests } from "./bitbucket-repo";
import { listGitHubPullRequests } from "./github-repo";
import type { ProviderConnectionSecret } from "./providerConnections";
import type { HostedRepoRef } from "../src/platform/desktop/contracts";

const repo: HostedRepoRef = {
  providerId: "github",
  owner: "acme",
  repo: "app",
  remoteName: "origin",
  remoteUrl: "https://github.com/acme/app.git",
  webUrl: "https://github.com/acme/app",
};

function reviewer(uuid: string) {
  return { uuid, nickname: uuid, display_name: uuid };
}

afterEach(() => vi.unstubAllGlobals());

describe("project pull request search", () => {
  it("asks GitHub for merged PRs in this repository and maps search results", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            search: {
              pageInfo: { endCursor: "next", hasNextPage: true },
              nodes: [
                {
                  __typename: "PullRequest",
                  number: 42,
                  title: "Fix build",
                  state: "MERGED",
                  isDraft: false,
                  url: "https://github.com/acme/app/pull/42",
                  createdAt: "2025-12-30T00:00:00Z",
                  updatedAt: "2026-01-01T00:00:00Z",
                  baseRefName: "main",
                  headRefName: "fix-build",
                  additions: 12,
                  deletions: 3,
                  changedFiles: 2,
                  reviewDecision: "CHANGES_REQUESTED",
                  totalCommentsCount: 4,
                  baseRepository: { name: "app", owner: { login: "acme" } },
                  headRepository: { name: "app", owner: { login: "acme" } },
                  author: { login: "alice", name: "Alice", avatarUrl: "https://a/alice.png" },
                  latestOpinionatedReviews: {
                    nodes: [
                      {
                        state: "APPROVED",
                        submittedAt: "2026-01-01T00:00:00Z",
                        author: { login: "carol" },
                      },
                      {
                        state: "CHANGES_REQUESTED",
                        submittedAt: "2026-01-01T00:00:00Z",
                        author: { login: "dan" },
                      },
                    ],
                  },
                  reviewRequests: {
                    nodes: [{ requestedReviewer: { login: "carol", name: "Carol" } }],
                  },
                  commits: { nodes: [{ commit: { statusCheckRollup: { state: "FAILURE" } } }] },
                },
              ],
            },
          },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const page = await listGitHubPullRequests(repo, "token", 1, 25, {
      state: "merged",
      query: "Fix build",
      author: "alice",
      involvement: "review-requested",
      viewerLogin: "bob",
    });

    expect(page.pullRequests).toMatchObject([
      {
        number: 42,
        state: "merged",
        author: { login: "alice", displayName: "Alice", avatarUrl: "https://a/alice.png" },
        reviewDecision: "changes-requested",
        checksState: "failed",
        commentCount: 4,
        additions: 12,
        deletions: 3,
        changedFiles: 2,
      },
    ]);
    // Carol was asked again after approving, so her review is owed.
    expect(
      page.pullRequests[0]?.reviewers.map((reviewer) => [reviewer.login, reviewer.state]),
    ).toEqual([
      ["carol", "requested"],
      ["dan", "changes-requested"],
    ]);
    expect(page.hasNextPage).toBe(true);
    const request = fetchMock.mock.calls[0];
    expect(request[0]).toBe("https://api.github.com/graphql");
    const variables = JSON.parse(request[1].body).variables;
    expect(variables.query).toContain("repo:acme/app is:pr is:merged");
    expect(variables.query).toContain("author:alice review-requested:bob");
  });

  it("uses Bitbucket filters and keeps only reviews the viewer still owes", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith("/user"))
        return Promise.resolve(new Response(JSON.stringify({ uuid: "{viewer}" }), { status: 200 }));
      return Promise.resolve(
        new Response(
          JSON.stringify({
            values: [
              {
                id: 1,
                title: "Owed",
                reviewers: [reviewer("{viewer}")],
                participants: [{ user: reviewer("{viewer}"), approved: false, state: null }],
              },
              {
                id: 2,
                title: "Already approved",
                comment_count: 3,
                reviewers: [reviewer("{viewer}")],
                participants: [{ user: reviewer("{viewer}"), approved: true, state: "approved" }],
              },
            ],
          }),
          { status: 200 },
        ),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const connection = {
      providerId: "bitbucket",
      id: "bitbucket",
      method: "pat",
      login: "bob",
      displayName: null,
      avatarUrl: null,
      scopes: [],
      createdAt: "",
      updatedAt: "",
      token: "token",
      authType: "bearer",
      identifier: null,
    } satisfies ProviderConnectionSecret;

    const page = await listBitbucketPullRequests(
      { ...repo, providerId: "bitbucket" },
      connection,
      1,
      25,
      { state: "closed", query: "fix", author: "alice", involvement: "review-requested" },
    );

    const url = new URL(fetchMock.mock.calls[1][0]);
    expect(url.searchParams.get("q")).toContain('(state = "DECLINED" OR state = "SUPERSEDED")');
    expect(url.searchParams.get("q")).toContain('title ~ "fix"');
    expect(url.searchParams.get("q")).toContain('author.nickname = "alice"');
    expect(url.searchParams.get("q")).toContain('reviewers.uuid = "{viewer}"');
    expect(url.searchParams.get("fields")).toBe("+values.reviewers,+values.participants");
    expect(page.pullRequests.map((pullRequest) => pullRequest.title)).toEqual(["Owed"]);
  });

  it("filters Bitbucket states with the state parameter when there is no query", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ values: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await listBitbucketPullRequests(
      { ...repo, providerId: "bitbucket" },
      {
        providerId: "bitbucket",
        id: "bitbucket",
        method: "pat",
        login: "bob",
        displayName: null,
        avatarUrl: null,
        scopes: [],
        createdAt: "",
        updatedAt: "",
        token: "token",
        authType: "bearer",
        identifier: null,
      },
      1,
      25,
      { state: "open" },
    );
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.getAll("state")).toEqual(["OPEN"]);
    expect(url.searchParams.has("q")).toBe(false);
  });
});
