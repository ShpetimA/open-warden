import { configureStore } from "@reduxjs/toolkit";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router";
import { afterEach, expect, test } from "vitest";

import { rootReducer } from "@/app/store";
import { gitApi } from "@/features/source-control/api";
import { hostedReposApi } from "@/features/hosted-repos/api";
import { setActiveRepo } from "@/features/source-control/sourceControlSlice";
import { browserDesktopApi } from "@/platform/desktop/browser";
import { desktopHandlers } from "@/test/desktopHandlers";
import type { GitCommand, GitRepositoryState } from "@/platform/desktop/gitOperations";
import { GitOperationBanner } from "./GitOperationBanner";

afterEach(() => {
  delete window.desktopBridge;
});

test("a cancelled native confirmation never runs a Git abort or skip command", async () => {
  const commands: GitCommand[] = [];
  const repository: GitRepositoryState = {
    branch: "main",
    upstream: "",
    ahead: 0,
    behind: 0,
    remotes: [],
    branches: [],
    tags: [],
    worktrees: [],
    operation: "rebase",
    conflicts: [],
    lastCommit: null,
    stashes: [],
    incoming: [],
    outgoing: [],
  };
  window.desktopBridge = {
    ...browserDesktopApi,
    ...desktopHandlers({
      async getGitRepositoryState() {
        return { ok: true as const, value: repository };
      },
      async confirm() {
        return false;
      },
      async runGitCommand(_repo: string, command: GitCommand) {
        commands.push(command);
        return { ok: true as const, value: "done" };
      },
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
      </MemoryRouter>
    </Provider>,
  );
  const abort = await screen.findByRole("button", { name: "Abort", exact: true });
  await act(async () => fireEvent.click(abort));
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "Skip commit", exact: true })),
  );
  expect(commands).toEqual([]);
  view.unmount();
  store.dispatch(gitApi.util.resetApiState());
});
