import { configureStore } from "@reduxjs/toolkit";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router";
import { afterEach, expect, test } from "vitest";

import { rootReducer } from "@/app/store";
import { hostedReposApi } from "@/features/hosted-repos/api";
import { browserDesktopApi } from "@/platform/desktop/browser";
import { desktopFailure } from "@/platform/desktop/failure";
import type { GitRepositoryState } from "@/platform/desktop/gitOperations";
import { desktopHandlers } from "@/test/desktopHandlers";
import { refreshActiveRepo, refreshRepositoryStatus } from "./actions";
import { gitApi } from "./api";
import { CommitBox } from "./components/CommitBox";
import { GitOperationBanner } from "./components/GitOperationBanner";
import { gitOperationsApi } from "./gitOperationsApi";
import { setActiveRepo } from "./sourceControlSlice";

const repository: GitRepositoryState = {
  branch: "main",
  upstream: "origin/main",
  ahead: 1,
  behind: 0,
  remotes: ["origin"],
  branches: [],
  tags: [],
  worktrees: [],
  operation: null,
  conflicts: [],
  lastCommit: { id: "abc123", message: "Keep this commit", published: false },
  stashes: [],
  incoming: [],
  outgoing: [],
};
const pushFailure = {
  ...desktopFailure("runGitCommand", "git-failed", "Git rejected this operation."),
  git: { exitCode: 1, output: "pre-push: tests failed\nGit lock test timed out after 5000ms" },
};

function openRepository() {
  const control = { failRead: false, failCommand: true, published: false };
  window.desktopBridge = {
    ...browserDesktopApi,
    ...desktopHandlers({
      getGitRepositoryState: async () =>
        control.failRead
          ? {
              ok: false as const,
              error: desktopFailure(
                "getGitRepositoryState",
                "unavailable",
                "Status could not be read.",
              ),
            }
          : { ok: true as const, value: { ...repository, ahead: control.published ? 0 : 1 } },
      getGitSnapshot: async () => ({ staged: [], unstaged: [], untracked: [] }),
      runGitCommand: async () =>
        control.failCommand
          ? { ok: false as const, error: pushFailure }
          : { ok: true as const, value: "Pushed" },
    }),
  };
  const store = configureStore({
    reducer: rootReducer,
    middleware: (defaults) => defaults().concat(gitApi.middleware, hostedReposApi.middleware),
  });
  store.dispatch(setActiveRepo("/repo"));

  const view = render(
    <Provider store={store}>
      <MemoryRouter>
        <GitOperationBanner />
        <CommitBox />
      </MemoryRouter>
    </Provider>,
  );

  return { control, store, view };
}

async function push(store: ReturnType<typeof openRepository>["store"]) {
  await act(async () => {
    await store.dispatch(
      gitOperationsApi.endpoints.runGitCommand.initiate(
        {
          repoPath: "/repo",
          command: { kind: "push" },
        },
        { fixedCacheKey: "/repo" },
      ),
    );
  });
}

afterEach(() => {
  delete window.desktopBridge;
});

test("a push error has its own label and diagnostics and refresh clears it after an external push", async () => {
  const { control, store } = openRepository();
  await push(store);

  expect(await screen.findByText("Couldn’t push commits")).toBeVisible();
  expect(screen.queryByText("Couldn’t update this commit")).not.toBeInTheDocument();
  expect(screen.getByText(/Git exit code: 1/)).toHaveTextContent(
    "Git lock test timed out after 5000ms",
  );

  await act(async () => {
    await store.dispatch(
      gitOperationsApi.endpoints.getGitRepositoryState.initiate("/repo", {
        forceRefetch: true,
        subscribe: false,
      }),
    );
  });
  expect(screen.getByText("Couldn’t push commits")).toBeVisible();

  control.failRead = true;
  fireEvent.click(screen.getByRole("button", { name: "Refresh status", exact: true }));
  await screen.findByText("Status could not be read.");
  expect(screen.getByText("Couldn’t push commits")).toBeVisible();

  control.failRead = false;
  control.published = true;
  fireEvent.click(screen.getByRole("button", { name: "Refresh status", exact: true }));
  await waitFor(() => expect(screen.queryByText("Couldn’t push commits")).not.toBeInTheDocument());
  expect(store.getState().gitCommandFeedback.byRepository["/repo"]).toBeUndefined();
});

test("retry success, dismiss, and the main repository refresh each remove old feedback", async () => {
  const { control, store } = openRepository();
  await push(store);
  fireEvent.click(await screen.findByRole("button", { name: "Dismiss", exact: true }));
  expect(screen.queryByText("Couldn’t push commits")).not.toBeInTheDocument();

  await push(store);
  control.failCommand = false;
  await push(store);
  expect(screen.queryByText("Couldn’t push commits")).not.toBeInTheDocument();

  control.failCommand = true;
  await push(store);
  await act(async () => {
    await store.dispatch(refreshActiveRepo());
  });
  expect(screen.queryByText("Couldn’t push commits")).not.toBeInTheDocument();
});

test("a slow refresh does not clear a newer command failure", async () => {
  const { store } = openRepository();
  await push(store);

  let release: ((value: GitRepositoryState) => void) | undefined;
  const heldRead = new Promise<GitRepositoryState>((resolve) => {
    release = resolve;
  });
  const bridge = window.desktopBridge;
  if (!bridge) throw new Error("Desktop fixture was not initialized");

  window.desktopBridge = {
    ...bridge,
    ...desktopHandlers({ getGitRepositoryState: () => heldRead }),
  };
  const first = store.getState().gitCommandFeedback.byRepository["/repo"]?.requestId;
  const refresh = store.dispatch(refreshRepositoryStatus("/repo"));
  await push(store);
  const latest = store.getState().gitCommandFeedback.byRepository["/repo"]?.requestId;
  expect(latest).not.toBe(first);

  await act(async () => {
    if (!release) throw new Error("Status read was not started");
    release(repository);
    await refresh;
  });
  expect(screen.getByText("Couldn’t push commits")).toBeVisible();
  expect(store.getState().gitCommandFeedback.byRepository["/repo"]?.requestId).toBe(latest);
});
