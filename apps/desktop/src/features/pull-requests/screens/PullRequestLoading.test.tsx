import { desktopHandlers } from "@/test/desktopHandlers";
import { configureStore } from "@reduxjs/toolkit";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, expect, it } from "vitest";

import { CommandComposerLauncherProvider } from "@/features/command-palette/CommandComposerLauncher";
import { rootReducer } from "@/app/store";
import { hostedReposApi } from "@/features/hosted-repos/api";
import { gitApi } from "@/features/source-control/api";
import { repoWorkspaceUpserted } from "@/features/workspaces/workspacesSlice";
import { browserDesktopApi } from "@/platform/desktop/browser";
import type {
  FileItem,
  HostedRepoRef,
  PullRequestCompareRefs,
  ProviderConnection,
  PullRequestPage,
} from "@/platform/desktop";
import { PullRequestsScreen } from "./PullRequestsScreen";
import { PullRequestFiles } from "./PullRequestFiles";

const repo: HostedRepoRef = {
  providerId: "bitbucket",
  owner: "team",
  repo: "invoice",
  remoteName: "origin",
  remoteUrl: "git@bitbucket.org:team/invoice.git",
  webUrl: "https://bitbucket.org/team/invoice",
};
const refs: PullRequestCompareRefs = {
  providerId: repo.providerId,
  owner: repo.owner,
  repo: repo.repo,
  pullRequestNumber: 114,
  baseRef: "main",
  headRef: "feature/invoice",
  baseSha: "base",
  compareBaseRef: "base",
  compareHeadRef: "head",
  localBranch: "feature/invoice",
};

function deferred<T>() {
  let complete: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    complete = resolve;
  });
  return {
    promise,
    resolve(value: T) {
      if (!complete) throw new Error("Promise was not initialized");
      complete(value);
    },
  };
}

const originalResizeObserver = window.ResizeObserver;
beforeEach(() => {
  window.ResizeObserver = class implements ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(() => {
  window.ResizeObserver = originalResizeObserver;
  delete window.desktopBridge;
});

function createTestStore() {
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefault) => getDefault().concat(gitApi.middleware, hostedReposApi.middleware),
  });
  store.dispatch(repoWorkspaceUpserted({ repoPath: "/repos/invoice" }));
  return store;
}

function setup(prepareRefs: () => Promise<PullRequestCompareRefs>) {
  const hostedRepo = deferred<HostedRepoRef>();
  const files = deferred<FileItem[]>();
  const requests: string[] = [];
  window.desktopBridge = {
    ...browserDesktopApi,
    ...desktopHandlers({
      resolveHostedRepo: () => hostedRepo.promise,
      preparePullRequestCompareRefs: prepareRefs,
      getPullRequestConversation: async () => ({
        detail: {
          id: "114",
          providerId: "bitbucket",
          number: 114,
          title: "Invoice",
          body: "",
          state: "open",
          isDraft: false,
          author: null,
          url: "https://bitbucket.org/team/invoice/pull-requests/114",
          baseRef: "main",
          headRef: "feature/invoice",
          baseSha: "base",
          headSha: "head",
          createdAt: "2026-10-30",
          updatedAt: "2026-10-30",
          labels: [],
        },
        issueComments: [],
        reviewThreads: [],
      }),
      getBranchFiles: () => {
        requests.push("files");
        return files.promise;
      },
      getPullRequestViewedFiles: async () => ({
        storage: "device",
        viewedPaths: [],
        truncated: false,
      }),
    }),
  };
  const store = createTestStore();
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={["/pull-requests/bitbucket/team/invoice/114/files"]}>
        <Routes>
          <Route
            path="/pull-requests/:providerId/:owner/:repo/:pullRequestNumber/files"
            element={<PullRequestFiles />}
          />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
  return { hostedRepo, files, sidebar: within(screen.getByRole("complementary")), requests };
}

it("keeps the sidebar loading through remote resolution, ref preparation, and file fetching", async () => {
  const preparing = deferred<PullRequestCompareRefs>();
  const { hostedRepo, files, sidebar, requests } = setup(() => preparing.promise);
  expect(sidebar.getByRole("status")).toHaveTextContent("Loading changed files");
  expect(screen.queryByText("No changed files")).not.toBeInTheDocument();

  await act(async () => hostedRepo.resolve(repo));
  expect(sidebar.getByRole("status")).toHaveTextContent("Loading changed files");
  await act(async () => preparing.resolve(refs));
  await waitFor(() => expect(requests).toContain("files"));
  expect(sidebar.getByRole("status")).toHaveTextContent("Loading changed files");

  await act(async () => files.resolve([]));
  expect(
    await sidebar.findByText("No changed files were reported for this pull request."),
  ).toBeVisible();
  expect(sidebar.getByRole("status")).toHaveTextContent(
    "No changed files were reported for this pull request.",
  );
});

it("shows ref preparation failures instead of an empty file list", async () => {
  const { hostedRepo, sidebar } = setup(async () => {
    throw {
      operation: "preparePullRequestCompareRefs",
      code: "unavailable",
      message: "Could not fetch PR refs",
    };
  });
  await act(async () => hostedRepo.resolve(repo));
  expect(await sidebar.findByText("Could not fetch PR refs")).toBeVisible();
  expect(sidebar.queryByText(/No changed files/)).not.toBeInTheDocument();
});

it("keeps the inbox loading while connections and then PR results are pending", async () => {
  const connections = deferred<ProviderConnection[]>();
  const results = deferred<PullRequestPage>();
  window.desktopBridge = {
    ...browserDesktopApi,
    ...desktopHandlers({
      resolveHostedRepo: async () => repo,
      listProviderConnections: () => connections.promise,
      listPullRequests: () => results.promise,
    }),
  };
  render(
    <Provider store={createTestStore()}>
      <MemoryRouter>
        <CommandComposerLauncherProvider open={() => {}}>
          <PullRequestsScreen />
        </CommandComposerLauncherProvider>
      </MemoryRouter>
    </Provider>,
  );
  expect(await screen.findByRole("status")).toHaveTextContent("Loading pull requests");
  expect(
    screen.queryByRole("button", { name: "Connect Bitbucket", exact: true }),
  ).not.toBeInTheDocument();
  await act(async () =>
    connections.resolve([
      {
        id: "bitbucket",
        providerId: "bitbucket",
        method: "pat",
        login: "reviewer",
        displayName: "Reviewer",
        avatarUrl: null,
        scopes: [],
        createdAt: "2026-10-25T18:00:00Z",
        updatedAt: "2026-10-25T18:00:00Z",
      },
    ]),
  );
  expect(
    screen
      .getAllByRole("status")
      .some((status) => status.textContent?.includes("Loading pull requests")),
  ).toBe(true);
  expect(screen.queryByText("No pull requests match these filters.")).not.toBeInTheDocument();
  await act(async () =>
    results.resolve({ pullRequests: [], page: 1, perPage: 25, hasNextPage: false }),
  );
  expect(await screen.findByText("No pull requests match these filters.")).toBeVisible();
});
