import { desktopHandlers } from "@/test/desktopHandlers";
import { useState } from "react";
import { configureStore } from "@reduxjs/toolkit";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Provider } from "react-redux";
import { createMemoryRouter, Outlet, RouterProvider, useLocation } from "react-router";
import { afterEach, expect, it } from "vitest";

import { rootReducer } from "@/app/store";
import { AppCommandPalette } from "@/features/command-palette/AppCommandPalette";
import { hostedReposApi } from "@/features/hosted-repos/api";
import { gitApi } from "@/features/source-control/api";
import { WorkspaceNavigation } from "@/features/workspaces/components/WorkspaceNavigation";
import { WorkspaceTabBar } from "@/features/workspaces/components/WorkspaceTabBar";
import { repoWorkspaceUpserted } from "@/features/workspaces/workspacesSlice";
import { browserDesktopApi } from "@/platform/desktop/browser";
import type { PreparedPullRequestWorkspace } from "@/platform/desktop/contracts";
import { RepositorySetupScreen } from "./RepositorySetupScreen";

const url = "https://bitbucket.org/ndbusinessit/invoice-service/pull-requests/114";
const prepared: PreparedPullRequestWorkspace = {
  providerId: "bitbucket",
  repoPath: "/managed/invoice",
  worktreePath: "/managed/invoice",
  owner: "ndbusinessit",
  repo: "invoice-service",
  pullRequestNumber: 114,
  title: "Invoice improvements",
  baseRef: "main",
  headRef: "feature/invoice",
  compareBaseRef: "abc",
  compareHeadRef: "def",
  localBranch: "open-warden/pr-114",
  hostedRepo: {
    providerId: "bitbucket",
    owner: "ndbusinessit",
    repo: "invoice-service",
    remoteName: "origin",
    remoteUrl: "https://bitbucket.org/ndbusinessit/invoice-service.git",
    webUrl: "https://bitbucket.org/ndbusinessit/invoice-service",
  },
};

afterEach(() => {
  delete window.desktopBridge;
});

function Shell() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  return (
    <>
      <WorkspaceNavigation />
      <WorkspaceTabBar />
      <button onClick={() => setOpen(true)}>Quick actions</button>
      <output aria-label="Current route">{location.pathname}</output>
      <Outlet />
      <AppCommandPalette open={open} onOpenChange={setOpen} />
    </>
  );
}

function setup(prepare: () => Promise<PreparedPullRequestWorkspace>, existingRepo = false) {
  window.desktopBridge = {
    ...browserDesktopApi,
    ...desktopHandlers({
      async resolveHostedRepo() {
        return null;
      },
      preparePullRequestFromUrl: prepare,
      async getGitSnapshot(repoPath) {
        return { repoRoot: repoPath, branch: "main", staged: [], unstaged: [], untracked: [] };
      },
      async saveWorkspaceSession(session) {
        return session;
      },
    }),
  };
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefault) => getDefault().concat(gitApi.middleware, hostedReposApi.middleware),
  });
  if (existingRepo) store.dispatch(repoWorkspaceUpserted({ repoPath: "/projects/other" }));
  const router = createMemoryRouter(
    [
      {
        element: <Shell />,
        children: [
          { path: "/changes", element: <p>Repository changes</p> },
          { path: "/repository-setup", element: <RepositorySetupScreen /> },
          {
            path: "/pull-requests/:provider/:owner/:repo/:number/overview",
            element: <p>Pull request review</p>,
          },
        ],
      },
    ],
    { initialEntries: ["/changes"] },
  );
  render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>,
  );
  return { store, router };
}

function downloadNotStarted(): never {
  throw new Error("Download not started");
}

function pasteLink() {
  fireEvent.click(screen.getByRole("button", { name: "Quick actions" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Search actions" }), {
    target: { value: url },
  });
  fireEvent.click(
    within(screen.getByRole("group", { name: "Actions" })).getByRole("button", {
      name: /^Open pull request #114/,
    }),
  );
}

it("opens a setup tab, then replaces it with the repository and PR review", async () => {
  const { store } = setup(async () => prepared);
  pasteLink();
  await screen.findByText("Pull request review");
  expect(screen.getByRole("status", { name: "Current route" })).toHaveTextContent(
    "/pull-requests/bitbucket/ndbusinessit/invoice-service/114/overview",
  );
  expect(store.getState().sourceControl.activeRepo).toBe("/managed/invoice");
  expect(store.getState().repositorySetup.items.some((item) => item.visible)).toBe(false);
  expect(store.getState().workspaces.items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: "pull-request",
        pullRequestNumber: 114,
        repoPath: "/managed/invoice",
      }),
    ]),
  );
});

it("lets setup finish in the background and opens the PR when its tab is selected", async () => {
  let finish: (value: PreparedPullRequestWorkspace) => void = downloadNotStarted;
  const download = new Promise<PreparedPullRequestWorkspace>((resolve) => {
    finish = resolve;
  });
  const { store } = setup(() => download, true);
  pasteLink();
  await screen.findByText("Downloading repository data and preparing the review checkout…");
  const tabs = screen.getByRole("navigation", { name: "Open projects" });
  fireEvent.click(within(tabs).getByRole("button", { name: "other, /projects" }));
  await screen.findByText("Repository changes");
  await act(async () => finish(prepared));
  await waitFor(() =>
    expect(store.getState().repositorySetup.items[0]?.progress.stage).toBe("ready"),
  );
  expect(store.getState().sourceControl.activeRepo).toBe("/projects/other");
  fireEvent.click(
    within(tabs).getByRole("button", { name: /invoice-service · #114, Ready to open/ }),
  );
  await screen.findByText("Pull request review");
});

it("shows a provider error in the setup tab and retries successfully", async () => {
  let attempts = 0;
  setup(async () => {
    attempts += 1;
    if (attempts === 1)
      throw {
        operation: "preparePullRequestCompareRefs",
        code: "authentication",
        message: "Connect Bitbucket in Settings",
      };
    return prepared;
  });
  pasteLink();
  expect(await screen.findByRole("alert")).toHaveTextContent("Connect Bitbucket in Settings");
  fireEvent.click(screen.getByRole("button", { name: "Retry setup" }));
  await screen.findByText("Pull request review");
  expect(attempts).toBe(2);
});

it("reopens an in-flight setup without starting a second download", async () => {
  let finish: (value: PreparedPullRequestWorkspace) => void = downloadNotStarted;
  const download = new Promise<PreparedPullRequestWorkspace>((resolve) => {
    finish = resolve;
  });
  let downloads = 0;
  setup(() => {
    downloads += 1;
    return download;
  });
  pasteLink();
  await screen.findByText("Downloading repository data and preparing the review checkout…");
  fireEvent.click(
    screen.getByRole("button", { name: "Close invoice-service · #114", exact: true }),
  );
  await screen.findByText("Repository changes");
  pasteLink();
  await screen.findByText("Downloading repository data and preparing the review checkout…");
  expect(downloads).toBe(1);
  await act(async () => finish(prepared));
  await screen.findByText("Pull request review");
});
