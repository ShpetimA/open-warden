import { describe, expect, it } from "vitest";

import {
  toPullRequestDetail,
  toPullRequestIssueComment,
  type GitHubPullRequestResponse,
} from "./github-repo";

describe("GitHub review extras", () => {
  it("keeps labels and reaction counts from provider responses", () => {
    const repository = {
      clone_url: "https://github.com/acme/app.git",
      html_url: "https://github.com/acme/app",
      name: "app",
      owner: { login: "acme" },
    };
    const pullRequest: GitHubPullRequestResponse = {
      id: 1,
      number: 42,
      title: "Improve review",
      draft: false,
      state: "open",
      merged_at: null,
      html_url: "https://github.com/acme/app/pull/42",
      updated_at: "2026-09-26T00:00:00Z",
      created_at: "2026-09-25T00:00:00Z",
      user: { login: "author" },
      base: { ref: "main", sha: "base", repo: repository },
      head: { ref: "review", sha: "head", repo: repository },
      labels: [
        { name: "bug", description: "Needs a fix" },
        { name: "", description: null },
      ],
    };

    expect(toPullRequestDetail(pullRequest, "github").labels).toEqual([
      { name: "bug", description: "Needs a fix" },
    ]);
    expect(
      toPullRequestIssueComment({
        id: 3,
        body: "Looks good",
        created_at: "2026-09-26T00:00:00Z",
        updated_at: "2026-09-26T00:00:00Z",
        html_url: null,
        user: { login: "reviewer", avatar_url: null },
        reactions: { "+1": 2, heart: 1, eyes: 0 },
      }).reactions,
    ).toEqual([
      { content: "+1", count: 2 },
      { content: "heart", count: 1 },
    ]);
  });
});
