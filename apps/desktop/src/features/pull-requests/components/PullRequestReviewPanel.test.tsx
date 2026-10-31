import { restoreWorkspaceSession } from "@/features/source-control/actions";
import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { afterEach, expect, it } from "vitest";

import { rootReducer } from "@/app/store";
import { addComment } from "@/features/comments/commentsSlice";
import { hostedReposApi } from "@/features/hosted-repos/api";
import { gitApi } from "@/features/source-control/api";
import { browserDesktopApi } from "@/platform/desktop/browser";
import type {
  PullRequestDetail,
  SubmitPullRequestReviewInput,
  WorkspaceSession,
} from "@/platform/desktop/contracts";
import { createWorkspaceSession } from "@/platform/desktop/workspaceSession";
import { desktopHandlers } from "@/test/desktopHandlers";
import { reviewDraftsRestored } from "../reviewDraftsSlice";
import { pullRequestSummaryFromDetail } from "../utils/pullRequestSummary";
import { PullRequestReviewPanel } from "./PullRequestReviewPanel";

const detail: PullRequestDetail = {
  id: "114",
  providerId: "bitbucket",
  number: 114,
  title: "Invoice validation",
  body: "",
  state: "open",
  isDraft: false,
  url: "https://bitbucket.org/team/invoice/pull-requests/114",
  author: { login: "alice", displayName: "Alice", avatarUrl: null },
  baseRef: "main",
  headRef: "feature",
  baseSha: "base123",
  headSha: "head123",
  createdAt: "2026-10-25T18:00:00Z",
  updatedAt: "2026-10-25T18:00:00Z",
  labels: [],
};

afterEach(() => {
  delete window.desktopBridge;
});

it("preserves a review draft across close, session restore, and partial submission retry", async () => {
  const inputs: SubmitPullRequestReviewInput[] = [];
  let closed = 0;
  window.desktopBridge = {
    ...browserDesktopApi,
    ...desktopHandlers({
      getPullRequestConversation: async () => ({ detail, issueComments: [], reviewThreads: [] }),
      preparePullRequestCompareRefs: async () => ({
        providerId: "bitbucket" as const,
        owner: "team",
        repo: "invoice",
        pullRequestNumber: 114,
        baseRef: "main",
        headRef: "feature",
        baseSha: "base123",
        compareBaseRef: "base123",
        compareHeadRef: "head123",
        localBranch: "feature",
      }),
      submitPullRequestReview: async (input: SubmitPullRequestReviewInput) => {
        inputs.push(input);
        return {
          submittedDraftIds: input.comments.map((comment) => comment.draftId),
          decisionSubmitted: inputs.length > 1,
          messageSubmitted: true,
          failedMessage: inputs.length === 1 ? "The decision could not be saved. Try again." : null,
        };
      },
    }),
  };
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefault) => getDefault().concat(gitApi.middleware, hostedReposApi.middleware),
  });
  store.dispatch(
    addComment({
      type: "annotation",
      id: "invoice-note",
      repoPath: "/repos/invoice",
      filePath: "src/invoice.ts",
      bucket: "unstaged",
      startLine: 3,
      endLine: 3,
      side: "additions",
      text: "Check negative amounts",
      contextKind: "review",
      baseRef: "base123",
      headRef: "head123",
    }),
  );
  store.dispatch(
    addComment({
      type: "annotation",
      id: "delete-note",
      repoPath: "/repos/invoice",
      filePath: "src/invoice.ts",
      bucket: "unstaged",
      startLine: 7,
      endLine: 7,
      side: "additions",
      text: "Remove this draft before submission",
      contextKind: "review",
      baseRef: "base123",
      headRef: "head123",
    }),
  );
  store.dispatch(
    addComment({
      type: "annotation",
      id: "other-note",
      repoPath: "/repos/other",
      filePath: "src/invoice.ts",
      bucket: "unstaged",
      startLine: 3,
      endLine: 3,
      side: "additions",
      text: "Keep other draft",
      contextKind: "review",
      baseRef: "base123",
      headRef: "head123",
    }),
  );
  const panel = (
    <Provider store={store}>
      <PullRequestReviewPanel
        repoPath="/repos/invoice"
        pullRequest={pullRequestSummaryFromDetail(detail, { owner: "team", repo: "invoice" })}
        onClose={() => {
          closed += 1;
        }}
      />
    </Provider>
  );
  const view = render(panel);

  await screen.findByText("2 pending inline comments");
  fireEvent.click(
    screen.getByRole("button", { name: "Delete pending comment on src/invoice.ts:7" }),
  );
  await screen.findByText("1 pending inline comment");
  expect(store.getState().comments.map((comment) => comment.id)).toEqual([
    "invoice-note",
    "other-note",
  ]);
  expect(screen.getByLabelText(/Review message/)).toHaveFocus();
  fireEvent.click(screen.getByRole("radio", { name: "Request changes" }));
  expect(screen.getByRole("button", { name: /Submit review/ })).toBeDisabled();
  fireEvent.change(screen.getByLabelText(/Review message/), {
    target: { value: "Please handle negative amounts." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Close review" }));
  expect(closed).toBe(1);
  view.unmount();

  const session = createWorkspaceSession(
    JSON.parse(JSON.stringify({ reviewDrafts: store.getState().reviewDrafts })),
  );
  store.dispatch(reviewDraftsRestored(session.reviewDrafts ?? []));
  render(panel);
  expect(screen.getByLabelText(/Review message/)).toHaveValue("Please handle negative amounts.");
  fireEvent.click(screen.getByRole("button", { name: /Submit review/ }));

  await screen.findByText("The decision could not be saved. Try again.");
  expect(store.getState().comments.map((comment) => comment.id)).toEqual(["other-note"]);
  expect(screen.getByLabelText(/Review message/)).toHaveValue("Please handle negative amounts.");
  fireEvent.click(screen.getByRole("button", { name: "Retry review" }));

  await waitFor(() => expect(closed).toBe(2));
  expect(inputs).toHaveLength(2);
  expect(inputs[0]).toMatchObject({
    expectedHeadSha: "head123",
    decision: "request-changes",
    messageAlreadyPublished: false,
    comments: [{ draftId: "invoice-note" }],
  });
  expect(inputs[1]).toMatchObject({ messageAlreadyPublished: true, comments: [] });
  expect(store.getState().reviewDrafts).toEqual([]);
});

it.each(["github", "bitbucket"] as const)(
  "submits an approval for the displayed %s PR with its current revision",
  async (providerId) => {
    const sent: SubmitPullRequestReviewInput[] = [];
    window.desktopBridge = {
      ...browserDesktopApi,
      ...desktopHandlers({
        getPullRequestConversation: async () => ({
          detail: { ...detail, providerId },
          issueComments: [],
          reviewThreads: [],
        }),
        preparePullRequestCompareRefs: async () => ({
          providerId,
          owner: "team",
          repo: "invoice",
          pullRequestNumber: 114,
          baseRef: "main",
          headRef: "feature",
          baseSha: "base123",
          compareBaseRef: "base123",
          compareHeadRef: "head123",
          localBranch: "feature",
        }),
        submitPullRequestReview: async (input: SubmitPullRequestReviewInput) => {
          sent.push(input);
          return { submittedDraftIds: [], decisionSubmitted: true, failedMessage: null };
        },
      }),
    };
    const store = configureStore({
      reducer: rootReducer,
      middleware: (getDefault) => getDefault().concat(gitApi.middleware, hostedReposApi.middleware),
    });
    render(
      <Provider store={store}>
        <PullRequestReviewPanel
          repoPath="/repos/invoice"
          pullRequest={pullRequestSummaryFromDetail(
            { ...detail, providerId },
            { owner: "team", repo: "invoice" },
          )}
          onClose={() => {}}
        />
      </Provider>,
    );

    expect(
      screen.queryByRole("region", { name: "Pending inline comments" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        "Bitbucket publishes inline comments, the message, and the decision separately.",
      ),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Approve", exact: true }));
    const submit = screen.getByRole("button", { name: /Submit review/ });
    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.click(submit);

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({
      repoPath: "/repos/invoice",
      pullRequestNumber: 114,
      decision: "approve",
      expectedHeadSha: "head123",
      body: "",
      comments: [],
    });
  },
);

it("keeps persisted review drafts through repeated workspace normalization", async () => {
  const draft = {
    repoPath: "/repos/invoice",
    pullRequestNumber: 114,
    decision: "request-changes" as const,
    message: "Keep this review after restart.",
    publishedMessage: "An already published note",
  };
  let persisted: WorkspaceSession = createWorkspaceSession({
    openRepos: ["/repos/invoice"],
    activeRepo: "/repos/invoice",
    reviewDrafts: [draft],
  });
  window.desktopBridge = {
    ...browserDesktopApi,
    ...desktopHandlers({
      loadWorkspaceSession: async () => persisted,
      saveWorkspaceSession: async (session: WorkspaceSession) => {
        persisted = createWorkspaceSession(JSON.parse(JSON.stringify(session)));
        return persisted;
      },
      getGitSnapshot: async () => ({
        repoRoot: "/repos/invoice",
        branch: "main",
        staged: [],
        unstaged: [],
        untracked: [],
      }),
    }),
  };

  for (let restart = 0; restart < 2; restart += 1) {
    const store = configureStore({
      reducer: rootReducer,
      middleware: (getDefault) => getDefault().concat(gitApi.middleware, hostedReposApi.middleware),
    });
    const result = await store.dispatch(restoreWorkspaceSession());

    expect(result.ok).toBe(true);
    expect(store.getState().reviewDrafts).toEqual([draft]);
    expect(persisted.reviewDrafts).toEqual([draft]);
  }
});
