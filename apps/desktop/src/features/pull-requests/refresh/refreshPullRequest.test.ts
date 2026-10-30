import { configureStore } from "@reduxjs/toolkit";
import { afterEach, expect, test, vi } from "vitest";
import { rootReducer } from "@/app/store";
import { gitApi } from "@/features/source-control/api";
import { hostedReposApi } from "@/features/hosted-repos/api";
import type { DesktopBridge, PullRequestDetail } from "@/platform/desktop";
import { refreshPullRequest } from "./refreshPullRequest";

const locator = { repoPath: "/repo", pullRequestNumber: 114 };
const detail: PullRequestDetail = {
  id: "114",
  providerId: "bitbucket",
  number: 114,
  title: "Invoice validation",
  body: "",
  state: "open",
  isDraft: false,
  author: null,
  url: "https://bitbucket.org/team/invoice/pull-requests/114",
  baseRef: "main",
  headRef: "validation",
  baseSha: "base123",
  headSha: "head123",
  createdAt: "2026-10-30",
  updatedAt: "2026-10-30",
  labels: [],
};
const cleanup: Array<() => void> = [];
afterEach(() => {
  for (const dispose of cleanup.splice(0)) dispose();
  vi.useRealTimers();
});
function fixture(bridge: Partial<DesktopBridge>) {
  Object.defineProperty(window, "desktopBridge", { value: bridge, configurable: true });
  const appStore = configureStore({
    reducer: rootReducer,
    middleware: (defaults) => defaults().concat(gitApi.middleware, hostedReposApi.middleware),
  });
  cleanup.push(() => {
    appStore.dispatch(hostedReposApi.util.resetApiState());
    appStore.dispatch(gitApi.util.resetApiState());
  });
  return appStore;
}

test("refreshes demanded reads while leaving a cached but unmounted checks read alone", async () => {
  let conversations = 0;
  let checks = 0;
  const appStore = fixture({
    getPullRequestConversation: async () => {
      conversations += 1;
      return { ok: true, value: { detail, issueComments: [], reviewThreads: [] } };
    },
    getPullRequestChecks: async () => {
      checks += 1;
      return {
        ok: true,
        value: { headSha: "head123", complete: true, checks: [], mergeability: "unknown" },
      };
    },
  });
  await appStore.dispatch(
    hostedReposApi.endpoints.getPullRequestChecks.initiate(locator, { subscribe: false }),
  );
  expect(await refreshPullRequest(locator, true, [], appStore)).toEqual([]);
  expect([conversations, checks]).toEqual([2, 1]);
  expect(await refreshPullRequest(locator, true, ["checks"], appStore)).toEqual([]);
  expect([conversations, checks]).toEqual([3, 2]);
});

test("a provider deadline blocks a different mounted PR reader and manual retry until expiry", async () => {
  vi.useFakeTimers();
  const now = Date.now();
  let conversations = 0;
  let checks = 0;
  const appStore = fixture({
    getPullRequestConversation: async () => {
      conversations += 1;
      return { ok: true, value: { detail, issueComments: [], reviewThreads: [] } };
    },
    getPullRequestChecks: async () => {
      checks += 1;
      return checks === 1
        ? {
            ok: false,
            error: {
              operation: "getPullRequestChecks",
              code: "rate-limit",
              provider: "bitbucket",
              message: "Wait",
              retryAt: now + 60000,
            },
          }
        : {
            ok: true,
            value: { headSha: "head123", complete: true, checks: [], mergeability: "unknown" },
          };
    },
  });
  await appStore.dispatch(
    hostedReposApi.endpoints.getPullRequestChecks.initiate(locator, { subscribe: false }),
  );
  const blocked = await appStore.dispatch(
    hostedReposApi.endpoints.getPullRequestActivity.initiate(locator, { subscribe: false }),
  );
  expect(blocked.error).toMatchObject({ code: "rate-limit" });
  await refreshPullRequest(locator, true, ["checks"], appStore);
  expect([conversations, checks]).toEqual([1, 1]);
  vi.setSystemTime(now + 60001);
  expect(await refreshPullRequest(locator, true, ["checks"], appStore)).toEqual([]);
  expect([conversations, checks]).toEqual([2, 2]);
});

test("a permanent read failure does not retry on mounting and explicit recovery restores automatic refresh", async () => {
  let checks = 0;
  const appStore = fixture({
    getPullRequestConversation: async () => ({
      ok: true,
      value: { detail, issueComments: [], reviewThreads: [] },
    }),
    getPullRequestChecks: async () => {
      checks += 1;
      return checks === 1
        ? {
            ok: false,
            error: { operation: "getPullRequestChecks", code: "permission", message: "No access" },
          }
        : {
            ok: true,
            value: { headSha: "head123", complete: true, checks: [], mergeability: "unknown" },
          };
    },
  });
  const endpoint = hostedReposApi.endpoints.getPullRequestChecks;
  await appStore.dispatch(endpoint.initiate(locator, { subscribe: false }));
  await appStore.dispatch(endpoint.initiate(locator, { subscribe: false }));
  expect(checks).toBe(1);
  expect(await refreshPullRequest(locator, false, ["checks"], appStore)).toMatchObject([
    { code: "permission" },
  ]);
  expect(checks).toBe(1);
  expect(await refreshPullRequest(locator, true, ["checks"], appStore)).toEqual([]);
  expect(await refreshPullRequest(locator, false, ["checks"], appStore)).toEqual([]);
  expect(checks).toBe(3);
});

test("provider deadlines outlive query cache disposal and cover another repository on the same provider", async () => {
  vi.useFakeTimers();
  const now = Date.now();
  let requests = 0;
  const appStore = fixture({
    resolveHostedRepo: async () => ({
      ok: true,
      value: {
        providerId: "bitbucket",
        owner: "team",
        repo: "other",
        remoteName: "origin",
        remoteUrl: "git@bitbucket.org:team/other.git",
        webUrl: "https://bitbucket.org/team/other",
      },
    }),
    getPullRequestConversation: async () => {
      requests += 1;
      if (requests === 1)
        return {
          ok: false,
          error: {
            operation: "getPullRequestConversation",
            code: "rate-limit",
            provider: "bitbucket",
            message: "Wait",
            retryAt: now + 120000,
          },
        };
      return { ok: true, value: { detail, issueComments: [], reviewThreads: [] } };
    },
  });
  await appStore.dispatch(
    hostedReposApi.endpoints.getPullRequestConversation.initiate(locator, { subscribe: false }),
  );
  appStore.dispatch(hostedReposApi.util.resetApiState());
  await appStore.dispatch(
    hostedReposApi.endpoints.resolveHostedRepo.initiate("/other", { subscribe: false }),
  );
  const other = { ...locator, repoPath: "/other" };
  const blocked = await appStore.dispatch(
    hostedReposApi.endpoints.getPullRequestConversation.initiate(other, { subscribe: false }),
  );
  expect(blocked.error).toMatchObject({ code: "rate-limit" });
  expect(requests).toBe(1);
  vi.setSystemTime(now + 120001);
  expect(await refreshPullRequest(other, true, [], appStore)).toEqual([]);
  expect(requests).toBe(2);
});

test("checks and file statistics retain their read revision until both are refreshed", async () => {
  let baseSha = "base123";
  const appStore = fixture({
    getPullRequestConversation: async () => ({
      ok: true,
      value: { detail: { ...detail, baseSha }, issueComments: [], reviewThreads: [] },
    }),
    getPullRequestChecks: async () => ({
      ok: true,
      value: { headSha: detail.headSha, complete: true, checks: [], mergeability: "mergeable" },
    }),
    getPullRequestFiles: async () => ({ ok: true, value: [] }),
  });
  const api = hostedReposApi.endpoints;
  await Promise.all([
    appStore.dispatch(api.getPullRequestChecks.initiate(locator, { subscribe: false })),
    appStore.dispatch(api.getPullRequestFiles.initiate(locator, { subscribe: false })),
  ]);
  baseSha = "base456";
  await refreshPullRequest(locator, true, [], appStore);
  expect(
    api.getPullRequestConversation.select(locator)(appStore.getState()).data?.detail.baseSha,
  ).toBe("base456");
  expect(api.getPullRequestChecks.select(locator)(appStore.getState()).data?.baseSha).toBe(
    "base123",
  );
  expect(api.getPullRequestFiles.select(locator)(appStore.getState()).data?.baseSha).toBe(
    "base123",
  );
  await refreshPullRequest(locator, true, ["checks", "files"], appStore);
  expect(api.getPullRequestChecks.select(locator)(appStore.getState()).data?.baseSha).toBe(
    "base456",
  );
  expect(api.getPullRequestFiles.select(locator)(appStore.getState()).data?.baseSha).toBe(
    "base456",
  );
});

test("provider comment mutations refresh subscribed inbox and activity reads", async () => {
  let commentCount = 0;
  let activityReads = 0;
  const appStore = fixture({
    listPullRequests: async () => ({
      ok: true,
      value: {
        pullRequests: [
          {
            ...detail,
            author: { login: "alice", displayName: "Alice", avatarUrl: null },
            headOwner: "team",
            headRepo: "invoice",
            reviewers: [],
            reviewDecision: null,
            checksState: null,
            commentCount,
            additions: null,
            deletions: null,
            changedFiles: null,
          },
        ],
        page: 1,
        perPage: 25,
        hasNextPage: false,
      },
    }),
    getPullRequestActivity: async () => {
      activityReads += 1;
      return { ok: true, value: { items: [], truncated: false } };
    },
    addPullRequestComment: async () => {
      commentCount += 1;
      return { ok: true, value: undefined };
    },
  });
  const input = { repoPath: locator.repoPath, page: 1, perPage: 25 };
  const list = appStore.dispatch(hostedReposApi.endpoints.listPullRequests.initiate(input));
  const activity = appStore.dispatch(
    hostedReposApi.endpoints.getPullRequestActivity.initiate(locator),
  );
  cleanup.push(list.unsubscribe, activity.unsubscribe);
  await Promise.all([list, activity]);
  await appStore.dispatch(
    hostedReposApi.endpoints.addPullRequestComment.initiate({ ...locator, body: "Reviewed" }),
  );
  await Promise.all(appStore.dispatch(hostedReposApi.util.getRunningQueriesThunk()));
  const page = hostedReposApi.endpoints.listPullRequests.select(input)(appStore.getState()).data;
  expect(page?.pullRequests[0]?.commentCount).toBe(1);
  expect(activityReads).toBe(2);
});

test("automatic recovery retries a failed comparison even when the PR revision is unchanged", async () => {
  let comparisons = 0;
  const appStore = fixture({
    getPullRequestConversation: async () => ({
      ok: true,
      value: { detail, issueComments: [], reviewThreads: [] },
    }),
    preparePullRequestCompareRefs: async () => {
      comparisons += 1;
      if (comparisons === 1)
        return {
          ok: false,
          error: {
            operation: "preparePullRequestCompareRefs",
            code: "network",
            message: "Offline",
          },
        };
      return {
        ok: true,
        value: {
          providerId: "bitbucket",
          owner: "team",
          repo: "invoice",
          pullRequestNumber: 114,
          baseRef: "main",
          headRef: "validation",
          baseSha: detail.baseSha,
          compareBaseRef: "merge123",
          compareHeadRef: detail.headSha,
          localBranch: "validation",
        },
      };
    },
  });
  await Promise.all([
    appStore.dispatch(
      hostedReposApi.endpoints.getPullRequestConversation.initiate(locator, { subscribe: false }),
    ),
    appStore.dispatch(
      hostedReposApi.endpoints.preparePullRequestCompareRefs.initiate(locator, {
        subscribe: false,
      }),
    ),
  ]);
  expect(await refreshPullRequest(locator, false, ["comparison"], appStore)).toEqual([]);
  expect(comparisons).toBe(2);
});

test("refresh reconciles prepared refs after another reader has already installed a new PR revision", async () => {
  let headSha = "head123";
  let comparisons = 0;
  const appStore = fixture({
    getPullRequestConversation: async () => ({
      ok: true,
      value: { detail: { ...detail, headSha }, issueComments: [], reviewThreads: [] },
    }),
    preparePullRequestCompareRefs: async () => {
      comparisons += 1;
      return {
        ok: true,
        value: {
          providerId: "bitbucket",
          owner: "team",
          repo: "invoice",
          pullRequestNumber: 114,
          baseRef: "main",
          headRef: "validation",
          baseSha: detail.baseSha,
          compareBaseRef: "merge123",
          compareHeadRef: headSha,
          localBranch: "validation",
        },
      };
    },
  });
  await refreshPullRequest(locator, true, ["comparison"], appStore);
  headSha = "head456";
  await appStore.dispatch(
    hostedReposApi.endpoints.getPullRequestConversation.initiate(locator, {
      subscribe: false,
      forceRefetch: true,
    }),
  );
  expect(await refreshPullRequest(locator, false, ["comparison"], appStore)).toEqual([]);
  expect(comparisons).toBe(2);
  expect(
    hostedReposApi.endpoints.preparePullRequestCompareRefs.select(locator)(appStore.getState()).data
      ?.compareHeadRef,
  ).toBe("head456");
});
