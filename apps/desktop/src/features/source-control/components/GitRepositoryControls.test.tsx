import { useState } from "react";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { rootReducer } from "@/app/store";
import { gitApi } from "../api";
import type { GitCommand, GitRepositoryState } from "@/platform/desktop/gitOperations";
import { RepositoryActions } from "./GitRepositoryControls";
import { GitOperationStatus } from "./GitOperationBanner";

const state: GitRepositoryState = {
  branch: "main",
  upstream: "",
  ahead: 0,
  behind: 0,
  remotes: ["origin"],
  operation: null,
  conflicts: [],
  lastCommit: null,
  stashes: [],
  incoming: [],
  outgoing: [],
  branches: [
    { name: "main", remote: false, worktree: "/repo" },
    { name: "feature", remote: false, worktree: "" },
    { name: "busy", remote: false, worktree: "/other" },
    { name: "origin/topic", remote: true, worktree: "" },
  ],
};
function Harness() {
  const [command, setCommand] = useState<GitCommand | null>(null);
  return (
    <>
      <RepositoryActions
        repoPath="/repo"
        state={state}
        busy={false}
        run={async (next) => setCommand(next)}
      />
      <output>{JSON.stringify(command)}</output>
    </>
  );
}
it("switches local branches, tracks remotes, and prevents switching an occupied worktree", () => {
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefault) => getDefault().concat(gitApi.middleware),
  });
  render(
    <Provider store={store}>
      <Harness />
    </Provider>,
  );
  expect(screen.getByRole("button", { name: "Switch branch", exact: true })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: /busy/ }));
  expect(screen.getByRole("button", { name: "Switch branch", exact: true })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: /feature/ }));
  fireEvent.click(screen.getByRole("button", { name: "Switch branch", exact: true }));
  expect(screen.getByRole("status")).toHaveTextContent('"kind":"switch","branch":"feature"');
  fireEvent.click(screen.getByRole("button", { name: /origin\/topic/ }));
  fireEvent.click(screen.getByRole("button", { name: "Switch branch", exact: true }));
  expect(screen.getByRole("status")).toHaveTextContent(
    '"kind":"track","remoteBranch":"origin/topic","branch":"topic"',
  );
});
it("keeps Continue disabled until conflicts are resolved", () => {
  function Operation() {
    const [count, setCount] = useState(1);
    const [continued, setContinued] = useState(false);
    return (
      <>
        <GitOperationStatus
          operation="merge"
          conflictCount={count}
          busy={false}
          error=""
          onResolve={() => setCount(0)}
          onContinue={() => setContinued(true)}
          onAbort={() => {}}
        />
        <output>{continued ? "continued" : "pending"}</output>
      </>
    );
  }
  render(<Operation />);
  expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Review changes" }));
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  expect(screen.getByRole("status")).toHaveTextContent("continued");
});
