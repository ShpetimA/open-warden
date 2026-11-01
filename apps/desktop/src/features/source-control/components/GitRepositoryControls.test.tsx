import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { expect, it, vi } from "vitest";

import type { GitRepositoryState } from "@/platform/desktop/gitOperations";

import { RepositoryControlButtons } from "./GitRepositoryControls";
import { GitOperationStatus } from "./GitOperationBanner";

const state: GitRepositoryState = {
  branch: "main",
  upstream: "origin/main",
  ahead: 2,
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
  ],
  tags: [],
  worktrees: [{ path: "/repo", branch: "main", commitId: "a".repeat(40) }],
};

it("opens focused composer actions from the repository controls", () => {
  const open = vi.fn();
  render(<RepositoryControlButtons state={state} busy={false} open={open} />);

  fireEvent.click(screen.getByRole("button", { name: /main/ }));
  fireEvent.click(screen.getByRole("button", { name: "Fetch remote changes" }));
  fireEvent.click(screen.getByRole("button", { name: "Push commits" }));

  expect(open.mock.calls.map(([action]) => action)).toEqual(["switch-branch", "fetch", "push"]);
  expect(screen.getByRole("button", { name: "Pull (fast-forward only)" })).toBeDisabled();
});

it("opens Publish branch when there is no upstream", () => {
  const open = vi.fn();
  render(
    <RepositoryControlButtons
      state={{ ...state, upstream: "", ahead: 0 }}
      busy={false}
      open={open}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Publish branch" }));

  expect(open).toHaveBeenCalledWith("publish");
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
