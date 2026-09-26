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
                  updatedAt: "2026-01-01T00:00:00Z",
                  baseRefName: "main",
                  headRefName: "fix-build",
                  baseRepository: { name: "app", owner: { login: "acme" } },
                  headRepository: { name: "app", owner: { login: "acme" } },
                  author: { login: "alice", name: "Alice" },
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
      involvement: "mine",
      viewerLogin: "bob",
    });

    expect(page.pullRequests).toMatchObject([
      { number: 42, state: "merged", authorLogin: "alice" },
    ]);
    expect(page.hasNextPage).toBe(true);
    const request = fetchMock.mock.calls[0];
    expect(request[0]).toBe("https://api.github.com/graphql");
    const variables = JSON.parse(request[1].body).variables;
    expect(variables.query).toContain("repo:acme/app is:pr is:merged");
    expect(variables.query).toContain("author:alice involves:bob");
  });

  it("uses Bitbucket filters on the provider, including the connected viewer", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith("/user"))
        return Promise.resolve(new Response(JSON.stringify({ uuid: "{viewer}" }), { status: 200 }));
      return Promise.resolve(
        new Response(JSON.stringify({ values: [], next: undefined }), { status: 200 }),
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

    await listBitbucketPullRequests({ ...repo, providerId: "bitbucket" }, connection, 1, 25, {
      state: "closed",
      query: "fix",
      author: "alice",
      involvement: "mine",
    });

    const url = new URL(fetchMock.mock.calls[1][0]);
    expect(url.searchParams.getAll("state")).toEqual(["DECLINED", "SUPERSEDED"]);
    expect(url.searchParams.get("q")).toContain('title ~ "fix"');
    expect(url.searchParams.get("q")).toContain('author.nickname = "alice"');
    expect(url.searchParams.get("q")).toContain('reviewers.uuid = "{viewer}"');
  });
});
