import { configureStore } from "@reduxjs/toolkit";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { Link, MemoryRouter, Route, Routes } from "react-router";
import { afterEach, expect, test } from "vitest";

import { rootReducer } from "@/app/store";
import { PullRequestCommentComposer } from "./PullRequestTimeline";

const locator = { repoPath: "/repo", pullRequestNumber: 42 };

afterEach(cleanup);

function renderComposer(post: (body: string) => Promise<boolean>) {
  const store = configureStore({ reducer: rootReducer });

  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={["/overview"]}>
        <Link to="/overview">Overview</Link>
        <Link to="/files">Files</Link>
        <Routes>
          <Route
            path="/overview"
            element={<PullRequestCommentComposer locator={locator} viewer={null} onSubmit={post} />}
          />
          <Route path="/files" element={<p>File list</p>} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );

  return store;
}

function commentInput() {
  return screen.getByPlaceholderText("Add a comment… Markdown and @mentions supported");
}

test("an overview comment survives a route unmount and remount", () => {
  renderComposer(async () => true);
  fireEvent.change(commentInput(), { target: { value: "Keep this unfinished comment" } });
  fireEvent.click(screen.getByRole("link", { name: "Files", exact: true }));
  expect(
    screen.queryByPlaceholderText("Add a comment… Markdown and @mentions supported"),
  ).toBeNull();

  fireEvent.click(screen.getByRole("link", { name: "Overview", exact: true }));
  expect(commentInput()).toHaveValue("Keep this unfinished comment");
});

test("a successful in-flight post keeps newer text and stays busy across route changes", async () => {
  const requests: Array<{ body: string; complete: (posted: boolean) => void }> = [];
  renderComposer(
    async (body) => await new Promise<boolean>((complete) => requests.push({ body, complete })),
  );
  fireEvent.change(commentInput(), { target: { value: "First comment" } });
  fireEvent.click(screen.getByRole("button", { name: "Comment", exact: true }));
  expect(screen.getByRole("button", { name: "Commenting…", exact: true })).toBeDisabled();
  fireEvent.change(commentInput(), { target: { value: "A newer unfinished comment" } });
  fireEvent.click(screen.getByRole("link", { name: "Files", exact: true }));
  fireEvent.click(screen.getByRole("link", { name: "Overview", exact: true }));
  expect(screen.getByRole("button", { name: "Commenting…", exact: true })).toBeDisabled();
  expect(requests.map((request) => request.body)).toEqual(["First comment"]);

  const request = requests[0];
  if (!request) throw new Error("The post must be pending");
  await act(async () => request.complete(true));

  expect(commentInput()).toHaveValue("A newer unfinished comment");
  expect(screen.getByRole("button", { name: "Comment", exact: true })).toBeEnabled();
});

test.each(["failure", "rejection"] as const)(
  "retains the draft and releases submission state after %s",
  async (outcome) => {
    renderComposer(async () => {
      if (outcome === "rejection") throw new Error("Provider unavailable");
      return false;
    });
    fireEvent.change(commentInput(), { target: { value: "Retry this comment" } });

    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Comment", exact: true })),
    );

    expect(commentInput()).toHaveValue("Retry this comment");
    expect(screen.getByRole("button", { name: "Comment", exact: true })).toBeEnabled();
  },
);

test("an acknowledged unchanged comment is cleared", async () => {
  renderComposer(async () => true);
  fireEvent.change(commentInput(), { target: { value: "Posted text" } });

  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "Comment", exact: true })),
  );

  expect(commentInput()).toHaveValue("");
});
