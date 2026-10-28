import { desktopHandlers } from "@/test/desktopHandlers";
import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { afterEach, expect, it } from "vitest";

import { rootReducer } from "@/app/store";
import { CommandComposerLauncherProvider } from "@/features/command-palette/CommandComposerLauncher";
import type { ComposerAction } from "@/features/command-palette/commandComposerModel";
import { hostedReposApi } from "@/features/hosted-repos/api";
import { gitApi } from "@/features/source-control/api";
import { pullRequestWorkspaceUpserted } from "@/features/workspaces/workspacesSlice";
import { browserDesktopApi } from "@/platform/desktop/browser";
import type { PullRequestDetail, PullRequestSummary } from "@/platform/desktop";
import { PullRequestReviewControl } from "./PullRequestReviewControl";

const detail: PullRequestDetail = {
  id: "114",
  providerId: "bitbucket",
  number: 114,
  title: "Invoice improvements",
  body: "Review these changes",
  state: "open",
  isDraft: false,
  url: "https://bitbucket.org/team/invoice/pull-requests/114",
  author: { login: "alice", displayName: "Alice", avatarUrl: null },
  baseRef: "main",
  headRef: "feature/invoice",
  baseSha: "base123",
  headSha: "head123",
  createdAt: "2026-10-25T18:00:00Z",
  updatedAt: "2026-10-25T18:00:00Z",
  labels: [],
};

afterEach(() => {
  delete window.desktopBridge;
});

function setup(loadDetail: () => Promise<PullRequestDetail>) {
  const opened: Array<{ action?: ComposerAction; pullRequest?: PullRequestSummary }> = [];
  window.desktopBridge = {
    ...browserDesktopApi,
    ...desktopHandlers({
      resolveHostedRepo: async () => ({
        providerId: "bitbucket",
        owner: "team",
        repo: "invoice",
        remoteName: "origin",
        remoteUrl: "git@bitbucket.org:team/invoice.git",
        webUrl: "https://bitbucket.org/team/invoice",
      }),
      getPullRequestConversation: async () => ({
        detail: await loadDetail(),
        issueComments: [],
        reviewThreads: [],
      }),
    }),
  };
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefault) => getDefault().concat(gitApi.middleware, hostedReposApi.middleware),
  });
  store.dispatch(
    pullRequestWorkspaceUpserted({
      repoPath: "/repos/invoice",
      providerId: "bitbucket",
      owner: "team",
      repo: "invoice",
      pullRequestNumber: 99,
      title: "Another PR",
    }),
  );
  render(
    <Provider store={store}>
      <CommandComposerLauncherProvider
        open={(action, pullRequest) => opened.push({ action, pullRequest })}
      >
        <PullRequestReviewControl repoPath="/repos/invoice" pullRequestNumber={114} />
      </CommandComposerLauncherProvider>
    </Provider>,
  );
  return opened;
}

it("opens review for the displayed PR rather than the active workspace's PR", async () => {
  const opened = setup(async () => detail);
  const button = await screen.findByRole("button", { name: "Review pull request" });
  await screen.findByTitle("Approve, request changes, or leave a review comment");
  expect(button).toBeEnabled();
  fireEvent.click(button);
  expect(opened).toMatchObject([
    {
      action: "submit-review",
      pullRequest: {
        number: 114,
        title: detail.title,
        providerId: "bitbucket",
        headOwner: "team",
        headRepo: "invoice",
      },
    },
  ]);
});

it.each([
  {
    state: "open" as const,
    isDraft: true,
    reason: "Mark this pull request ready for review first",
  },
  { state: "merged" as const, isDraft: false, reason: "Only open pull requests can be reviewed" },
  { state: "closed" as const, isDraft: false, reason: "Only open pull requests can be reviewed" },
])("disables review for $state with draft=$isDraft", async ({ state, isDraft, reason }) => {
  const opened = setup(async () => ({ ...detail, state, isDraft }));
  const button = await screen.findByTitle(reason);
  expect(button).toBeDisabled();
  fireEvent.click(button);
  expect(opened).toEqual([]);
});

it("keeps review visible and disabled until its context has loaded", () => {
  const opened = setup(() => new Promise(() => {}));
  const button = screen.getByRole("button", { name: "Review pull request" });
  expect(button).toBeDisabled();
  fireEvent.click(button);
  expect(opened).toEqual([]);
});
