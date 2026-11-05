import { configureStore } from "@reduxjs/toolkit";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it } from "vitest";

import { rootReducer } from "@/app/store";
import { addComment, updateComment } from "@/features/comments/commentsSlice";
import { hostedReposApi } from "@/features/hosted-repos/api";
import { gitApi } from "@/features/source-control/api";
import type { CommentItem } from "@/features/source-control/types";
import { browserDesktopApi } from "@/platform/desktop/browser";
import type {
  PullRequestConversation,
  PullRequestReviewThread,
  SubmitPullRequestReviewCommentsInput,
  SubmitPullRequestReviewCommentsResult,
} from "@/platform/desktop/contracts";
import { desktopFailure, desktopSuccess } from "@/platform/desktop/failure";
import { desktopHandlers } from "@/test/desktopHandlers";
import { usePullRequestPendingReviewActions } from "../hooks/usePullRequestPendingReviewActions";
import { PullRequestInlineReviewThread } from "./PullRequestInlineReviewThread";

const locator = { repoPath: "/repos/invoice", pullRequestNumber: 114 };
const draft: CommentItem = {
  type: "annotation",
  id: "draft-1",
  repoPath: locator.repoPath,
  filePath: "invoice.ts",
  bucket: "unstaged",
  startLine: 1,
  endLine: 1,
  side: "additions",
  text: "Original draft",
  contextKind: "review",
  baseRef: "base123",
  headRef: "head123",
};
const thread: PullRequestReviewThread = {
  id: "thread-1",
  path: "invoice.ts",
  line: 1,
  startLine: null,
  diffSide: "RIGHT",
  isResolved: false,
  isOutdated: false,
  resolvedBy: null,
  comments: [
    {
      id: "comment-1",
      databaseId: 1,
      body: "Please explain this change.",
      createdAt: "2026-10-25T18:00:00Z",
      updatedAt: "2026-10-25T18:00:00Z",
      author: { login: "alice", displayName: "Alice", avatarUrl: null },
      path: "invoice.ts",
      line: 1,
      startLine: null,
      url: null,
    },
  ],
};
const conversation: PullRequestConversation = {
  detail: {
    id: "114",
    providerId: "github",
    number: 114,
    title: "Invoice validation",
    body: "",
    state: "open",
    isDraft: false,
    author: null,
    url: "https://github.com/team/invoice/pull/114",
    baseRef: "main",
    headRef: "feature",
    baseSha: "base123",
    headSha: "head123",
    createdAt: "2026-10-25T18:00:00Z",
    updatedAt: "2026-10-25T18:00:00Z",
    labels: [],
  },
  issueComments: [],
  reviewThreads: [thread],
};

function deferred<T>() {
  let complete: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    complete = resolve;
  });

  return {
    promise,
    resolve(value: T) {
      if (!complete) throw new Error("The deferred request was not initialized.");
      complete(value);
    },
  };
}

function createStore() {
  return configureStore({
    reducer: rootReducer,
    middleware: (getDefault) => getDefault().concat(gitApi.middleware, hostedReposApi.middleware),
  });
}

const stores: ReturnType<typeof createStore>[] = [];

afterEach(() => {
  cleanup();

  for (const store of stores.splice(0)) {
    store.dispatch(hostedReposApi.util.resetApiState());
    store.dispatch(gitApi.util.resetApiState());
  }

  delete window.desktopBridge;
});

function PendingDrafts() {
  const actions = usePullRequestPendingReviewActions({
    ...locator,
    compareBaseRef: "base123",
    compareHeadRef: "head123",
  });

  return <button onClick={() => void actions.publishAllPendingDrafts()}>Publish drafts</button>;
}

function replySubmitButton() {
  const button = screen.getAllByRole("button", { name: "Reply", exact: true }).at(-1);

  if (!button) throw new Error("The reply submit button is missing.");

  return button;
}

it("keeps a newer inline draft edit when an older published snapshot succeeds", async () => {
  const pending = deferred<SubmitPullRequestReviewCommentsResult>();
  const sent: SubmitPullRequestReviewCommentsInput[] = [];

  window.desktopBridge = {
    ...browserDesktopApi,
    ...desktopHandlers({
      submitPullRequestReviewComments(input: SubmitPullRequestReviewCommentsInput) {
        sent.push(input);
        return pending.promise;
      },
    }),
  };

  const store = createStore();
  stores.push(store);
  store.dispatch(addComment(draft));

  render(
    <Provider store={store}>
      <PendingDrafts />
    </Provider>,
  );

  fireEvent.click(screen.getByRole("button", { name: "Publish drafts" }));
  await waitFor(() => expect(sent).toHaveLength(1));

  act(() => {
    store.dispatch(updateComment({ id: draft.id, text: "New edit while publishing" }));
  });

  await act(async () => {
    pending.resolve({ submittedDraftIds: [draft.id], failedDraftId: null, failedMessage: null });
    await pending.promise;
  });

  expect(sent).toMatchObject([{ comments: [{ body: "Original draft" }] }]);
  expect(store.getState().comments).toMatchObject([
    { id: draft.id, text: "New edit while publishing" },
  ]);
});

it("clears only unchanged drafts acknowledged by a partial publication", async () => {
  window.desktopBridge = {
    ...browserDesktopApi,
    ...desktopHandlers({
      submitPullRequestReviewComments: async () => ({
        submittedDraftIds: [draft.id],
        failedDraftId: "draft-2",
        failedMessage: "The second comment was rejected.",
      }),
    }),
  };

  const store = createStore();
  stores.push(store);
  store.dispatch(addComment(draft));
  store.dispatch(addComment({ ...draft, id: "draft-2", text: "Keep this unsent draft" }));

  render(
    <Provider store={store}>
      <PendingDrafts />
    </Provider>,
  );

  fireEvent.click(screen.getByRole("button", { name: "Publish drafts" }));

  await waitFor(() => {
    expect(store.getState().comments).toMatchObject([
      { id: "draft-2", text: "Keep this unsent draft" },
    ]);
  });
});

it("acknowledges a posted reply even when the subsequent conversation refresh fails", async () => {
  let reads = 0;
  let writes = 0;

  window.desktopBridge = {
    ...browserDesktopApi,
    ...desktopHandlers({
      replyToPullRequestThread: async () => {
        writes += 1;
      },
    }),
    getPullRequestConversation: async () => {
      reads += 1;

      return reads === 1
        ? desktopSuccess(conversation)
        : { ok: false, error: desktopFailure("getPullRequestConversation", "network", "Offline") };
    },
  };

  const store = createStore();
  stores.push(store);
  const subscription = store.dispatch(
    hostedReposApi.endpoints.getPullRequestConversation.initiate(locator),
  );
  await subscription;

  render(
    <Provider store={store}>
      <MemoryRouter>
        <PullRequestInlineReviewThread {...locator} providerId="github" thread={thread} />
      </MemoryRouter>
    </Provider>,
  );

  fireEvent.click(screen.getByRole("button", { name: "Reply", exact: true }));
  fireEvent.change(screen.getByRole("textbox", { name: "Reply" }), {
    target: { value: "My posted reply" },
  });
  fireEvent.click(replySubmitButton());

  await waitFor(() => expect(writes).toBe(1));
  await waitFor(() => {
    expect(
      hostedReposApi.endpoints.getPullRequestConversation.select(locator)(store.getState()).isError,
    ).toBe(true);
  });

  expect(screen.queryByRole("textbox", { name: "Reply" })).not.toBeInTheDocument();
  expect(reads).toBe(2);
  subscription.unsubscribe();
});

it("keeps reply text typed while the earlier reply is being posted", async () => {
  const pending = deferred<void>();
  let writes = 0;

  window.desktopBridge = {
    ...browserDesktopApi,
    ...desktopHandlers({
      replyToPullRequestThread: async () => {
        writes += 1;
        await pending.promise;
      },
    }),
  };

  const store = createStore();
  stores.push(store);

  render(
    <Provider store={store}>
      <MemoryRouter>
        <PullRequestInlineReviewThread {...locator} providerId="github" thread={thread} />
      </MemoryRouter>
    </Provider>,
  );

  fireEvent.click(screen.getByRole("button", { name: "Reply", exact: true }));
  const editor = screen.getByRole("textbox", { name: "Reply" });
  fireEvent.change(editor, { target: { value: "Original reply" } });
  fireEvent.click(replySubmitButton());

  await waitFor(() => expect(writes).toBe(1));
  fireEvent.change(editor, { target: { value: "A newer reply draft" } });

  await act(async () => {
    pending.resolve(undefined);
    await pending.promise;
  });

  expect(screen.getByRole("textbox", { name: "Reply" })).toHaveValue("A newer reply draft");
  expect(writes).toBe(1);
});

it("preserves the reply draft when its write fails", async () => {
  let writes = 0;

  window.desktopBridge = {
    ...browserDesktopApi,
    replyToPullRequestThread: async () => {
      writes += 1;

      return {
        ok: false,
        error: desktopFailure("replyToPullRequestThread", "permission", "Reply was rejected"),
      };
    },
  };

  const store = createStore();
  stores.push(store);

  render(
    <Provider store={store}>
      <MemoryRouter>
        <PullRequestInlineReviewThread {...locator} providerId="github" thread={thread} />
      </MemoryRouter>
    </Provider>,
  );

  fireEvent.click(screen.getByRole("button", { name: "Reply", exact: true }));
  fireEvent.change(screen.getByRole("textbox", { name: "Reply" }), {
    target: { value: "Keep my rejected reply" },
  });
  fireEvent.click(replySubmitButton());

  await waitFor(() => expect(writes).toBe(1));
  await waitFor(() => expect(replySubmitButton()).toBeEnabled());

  expect(screen.getByRole("textbox", { name: "Reply" })).toHaveValue("Keep my rejected reply");
});
