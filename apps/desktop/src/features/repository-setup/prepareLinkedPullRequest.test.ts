import { desktopHandlers } from "@/test/desktopHandlers";
import { describe, expect, it } from "vitest";

import type {
  HostedRepoRef,
  PullRequestConversation,
  PreparedPullRequestWorkspace,
} from "@/platform/desktop/contracts";
import { parsePullRequestLink } from "@/platform/desktop/pullRequestLink";
import { prepareLinkedPullRequest, type RepositorySetupStage } from "./prepareLinkedPullRequest";

function link() {
  const parsed = parsePullRequestLink(
    "https://bitbucket.org/ndbusinessit/invoice-service/pull-requests/114",
  );
  if (!parsed) throw new Error("Invalid test link");
  return parsed;
}

const hosted: HostedRepoRef = {
  providerId: "bitbucket",
  owner: "NDBusinessIT",
  repo: "invoice-service",
  remoteName: "origin",
  remoteUrl: "git@bitbucket.org:ndbusinessit/invoice-service.git",
  webUrl: "https://bitbucket.org/ndbusinessit/invoice-service",
};
const conversation: PullRequestConversation = {
  detail: {
    id: "114",
    providerId: "bitbucket",
    number: 114,
    title: "Invoice improvements",
    body: "",
    state: "open",
    isDraft: false,
    url: link().url,
    author: null,
    baseRef: "main",
    headRef: "feature/invoice",
    baseSha: "abc",
    headSha: "def",
    createdAt: "",
    updatedAt: "",
    labels: [],
  },
  issueComments: [],
  reviewThreads: [],
};
const prepared: PreparedPullRequestWorkspace = {
  providerId: "bitbucket",
  repoPath: "/managed/worktrees/pr-114",
  worktreePath: "/managed/worktrees/pr-114",
  owner: "ndbusinessit",
  repo: "invoice-service",
  pullRequestNumber: 114,
  title: conversation.detail.title,
  baseRef: "main",
  headRef: "feature/invoice",
  compareBaseRef: "abc",
  compareHeadRef: "def",
  localBranch: "open-warden/pr-114",
  hostedRepo: hosted,
};

describe("prepare a linked pull request", () => {
  it("reuses an SSH remote in recent repos, skips stale paths, and never downloads", async () => {
    const stages: RepositorySetupStage[] = [];
    const checked: string[] = [];
    const result = await prepareLinkedPullRequest(
      desktopHandlers({
        async resolveHostedRepo(path) {
          checked.push(path);
          if (path === "/missing") throw new Error("Folder removed");
          return path === "/recent/invoice" ? hosted : null;
        },
        async getPullRequestConversation(input) {
          expect(input).toEqual({ repoPath: "/recent/invoice", pullRequestNumber: 114 });
          return conversation;
        },
        async preparePullRequestFromUrl() {
          throw new Error("Unexpected download");
        },
      }),
      link(),
      ["/missing", "/other", "/recent/invoice", "/recent/invoice"],
      (stage) => stages.push(stage),
    );

    expect(result).toMatchObject({
      ok: true,
      workspace: {
        repoPath: "/recent/invoice",
        title: "Invoice improvements",
        pullRequestNumber: 114,
      },
    });
    expect(stages).toEqual(["locating"]);
    expect(checked).toEqual(["/missing", "/other", "/recent/invoice"]);
  });

  it("prepares a managed checkout when no matching repository exists", async () => {
    const stages: RepositorySetupStage[] = [];
    const result = await prepareLinkedPullRequest(
      desktopHandlers({
        async resolveHostedRepo() {
          return { ...hosted, providerId: "github" };
        },
        async getPullRequestConversation() {
          throw new Error("Wrong repository");
        },
        async preparePullRequestFromUrl(url) {
          expect(url).toBe(link().url);
          return prepared;
        },
      }),
      link(),
      ["/unrelated"],
      (stage) => stages.push(stage),
    );

    expect(result).toMatchObject({
      ok: true,
      workspace: { repoPath: prepared.repoPath, providerId: "bitbucket" },
    });
    expect(stages).toEqual(["locating", "downloading"]);
  });

  it("returns a provider failure with the failed stage", async () => {
    const result = await prepareLinkedPullRequest(
      desktopHandlers({
        async resolveHostedRepo() {
          return null;
        },
        async getPullRequestConversation() {
          return conversation;
        },
        async preparePullRequestFromUrl() {
          throw {
            operation: "preparePullRequestFromUrl",
            code: "authentication",
            message: "Connect Bitbucket in Settings",
          };
        },
      }),
      link(),
      [],
      () => {},
    );
    expect(result).toEqual({
      ok: false,
      stage: "downloading",
      message: "Connect Bitbucket in Settings",
    });
  });

  it("reports an inaccessible PR in an existing repo without creating another checkout", async () => {
    const result = await prepareLinkedPullRequest(
      desktopHandlers({
        async resolveHostedRepo() {
          return hosted;
        },
        async getPullRequestConversation() {
          throw {
            operation: "getPullRequestConversation",
            code: "not-found",
            message: "Pull request not found",
          };
        },
        async preparePullRequestFromUrl() {
          throw new Error("Unexpected download");
        },
      }),
      link(),
      ["/invoice"],
      () => {},
    );
    expect(result).toEqual({ ok: false, stage: "locating", message: "Pull request not found" });
  });
});
