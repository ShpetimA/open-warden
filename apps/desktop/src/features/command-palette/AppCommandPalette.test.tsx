import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { AppCommandPalette } from "./AppCommandPalette";

const mocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
  execute: vi.fn(),
  useGetGitSnapshotQuery: vi.fn(),
  useGetGitRepositoryStateQuery: vi.fn(),
  useGetGitStashPatchQuery: vi.fn(),
  useRunGitCommandMutation: vi.fn(),
  useHotkey: vi.fn(),
}));

vi.mock("@tanstack/react-hotkeys", () => ({ useHotkey: mocks.useHotkey }));

vi.mock("@/app/hooks", () => ({
  useAppDispatch: () => mocks.dispatch,
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({
      sourceControl: {
        activeRepo: "/tmp/repo",
        runningAction: "",
        commitMessage: "",
      },
    }),
}));

vi.mock("@/features/source-control/api", () => ({
  useGetGitSnapshotQuery: mocks.useGetGitSnapshotQuery,
}));

vi.mock("@/features/source-control/gitOperationsApi", () => ({
  useGetGitRepositoryStateQuery: mocks.useGetGitRepositoryStateQuery,
  useGetGitStashPatchQuery: mocks.useGetGitStashPatchQuery,
  useRunGitCommandMutation: mocks.useRunGitCommandMutation,
}));

vi.mock("@/features/source-control/actions", () => ({
  commitAction: () => ({ type: "test/commit" }),
  stageAllAction: () => ({ type: "test/stage-all" }),
  unstageAllAction: () => ({ type: "test/unstage-all" }),
  setCommitMessageValue: (message: string) => ({ type: "test/message", payload: message }),
}));

async function pressHotkey(key: string, target?: EventTarget) {
  const handler = mocks.useHotkey.mock.calls.findLast(
    ([registeredKey]) => registeredKey === key,
  )?.[1];
  expect(handler).toBeDefined();
  await act(async () => handler({ preventDefault: vi.fn(), target }));
}

function actionChoice(name: RegExp) {
  return within(screen.getByRole("group", { name: "Actions" })).getByRole("button", { name });
}

const baseRepository = {
  branch: "main",
  upstream: "origin/main",
  ahead: 0,
  behind: 2,
  operation: null,
  remotes: ["origin"],
  branches: [
    { name: "main", remote: false, worktree: "/tmp/repo" },
    { name: "feature", remote: false, worktree: "" },
    { name: "origin/topic", remote: true, worktree: "" },
  ],
  stashes: [{ oid: "a".repeat(40), label: "Saved work" }],
  incoming: [{ id: "abc1234", subject: "Remote work" }],
  outgoing: [],
};

describe("AppCommandPalette", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useGetGitSnapshotQuery.mockReturnValue({
      stagedCount: 1,
      unstageableCount: 2,
      hasMixedFile: false,
    });
    mocks.useGetGitRepositoryStateQuery.mockReturnValue({
      repository: baseRepository,
    });
    mocks.useRunGitCommandMutation.mockReturnValue([mocks.execute, { isLoading: false }]);
    mocks.useGetGitStashPatchQuery.mockReturnValue({ currentData: "", isFetching: false });
    mocks.execute.mockReturnValue({ unwrap: () => Promise.resolve("done") });
    mocks.dispatch.mockImplementation((action) =>
      ["test/commit", "test/stage-all", "test/unstage-all"].includes(action.type)
        ? Promise.resolve(true)
        : undefined,
    );
  });

  test("keeps repository subscriptions unmounted while closed", () => {
    render(<AppCommandPalette open={false} onOpenChange={() => {}} />);

    expect(mocks.useGetGitSnapshotQuery).not.toHaveBeenCalled();
    expect(mocks.useGetGitRepositoryStateQuery).not.toHaveBeenCalled();
  });

  test("shows every Git action before search and keeps unavailable actions explained", () => {
    render(<AppCommandPalette open onOpenChange={() => {}} />);

    expect(screen.getByRole("dialog", { name: "Compose a Git command" })).toHaveClass(
      "command-composer-dialog",
    );
    expect(screen.getByRole("textbox", { name: "Search Git actions" })).toHaveFocus();
    expect(actionChoice(/^Pull/)).toBeEnabled();
    expect(actionChoice(/^Push/)).toBeDisabled();
    expect(actionChoice(/^Commit/)).toBeEnabled();
    expect(actionChoice(/^Stage all/)).toBeEnabled();
    expect(actionChoice(/^Unstage all/)).toBeEnabled();
    expect(actionChoice(/^Stash staged/)).toBeEnabled();
    expect(actionChoice(/^Switch branch/)).toBeEnabled();
    expect(actionChoice(/^Fetch/)).toBeEnabled();
    expect(
      within(screen.getByRole("group", { name: "Actions" })).getAllByRole("button"),
    ).toHaveLength(21);
    expect(screen.getByText("Available now")).toBeInTheDocument();
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
    expect(screen.queryByText("Stage changes")).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "Search Git actions" }), {
      target: { value: "switch" },
    });
    expect(actionChoice(/^Switch branch/)).toBeEnabled();
  });

  test("typing narrows the same action list without matching incidental status text", () => {
    render(<AppCommandPalette open onOpenChange={() => {}} />);

    fireEvent.change(screen.getByRole("textbox", { name: "Search Git actions" }), {
      target: { value: "s" },
    });

    expect(actionChoice(/^Stage all/)).toBeEnabled();
    expect(actionChoice(/^Stash staged/)).toBeEnabled();
    expect(screen.queryByRole("button", { name: /^Fetch/ })).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("group", { name: "Actions" })).getAllByRole("button").length,
    ).toBeLessThan(21);
  });

  test("a focused Fetch still requires confirmation with one remote", async () => {
    const onOpenChange = vi.fn();
    render(<AppCommandPalette open initialAction="fetch" onOpenChange={onOpenChange} />);

    expect(mocks.execute).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm Fetch" }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(mocks.execute).toHaveBeenCalledWith({
      repoPath: "/tmp/repo",
      command: { kind: "fetch", remote: "origin" },
    });
  });

  test("a focused Stage all opens confirmation without staging", async () => {
    render(<AppCommandPalette open initialAction="stage-all" onOpenChange={() => {}} />);

    expect(screen.getByRole("button", { name: "Confirm Stage all" })).toBeEnabled();
    expect(mocks.dispatch).not.toHaveBeenCalledWith({ type: "test/stage-all" });
  });

  test("the action card selects its previewed action without executing it", () => {
    render(<AppCommandPalette open onOpenChange={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Action: Pull" }));
    expect(screen.getByRole("button", { name: "Confirm Pull" })).toBeEnabled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  test("Enter selects, then confirms, while arrow keys stay inside the dialog", async () => {
    const behindKeydown = vi.fn();
    const onOpenChange = vi.fn();
    document.addEventListener("keydown", behindKeydown);
    try {
      render(<AppCommandPalette open onOpenChange={onOpenChange} />);

      const search = screen.getByRole("textbox", { name: "Search Git actions" });
      fireEvent.keyDown(search, { key: "ArrowDown" });
      expect(behindKeydown).not.toHaveBeenCalled();

      await pressHotkey("ArrowDown");
      await pressHotkey("ArrowDown");
      expect(actionChoice(/^Stage all/)).toHaveAttribute("data-highlighted", "true");

      await pressHotkey("Enter");
      expect(screen.getByRole("group", { name: "Command preview" })).toBeInTheDocument();
      expect(mocks.dispatch).not.toHaveBeenCalledWith({ type: "test/stage-all" });
      await pressHotkey("Enter");
      await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
      expect(mocks.dispatch).toHaveBeenCalledWith({ type: "test/stage-all" });
    } finally {
      document.removeEventListener("keydown", behindKeydown);
    }
  });

  test("opens the focused branch action and confirms after selecting a branch", async () => {
    const onOpenChange = vi.fn();
    render(<AppCommandPalette open initialAction="switch-branch" onOpenChange={onOpenChange} />);

    expect(screen.getByRole("textbox", { name: "Search branches" })).toHaveFocus();
    await pressHotkey("Enter");
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Confirm Switch branch" })).toBeEnabled();
    await pressHotkey("Enter");
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(mocks.execute).toHaveBeenCalledWith({
      repoPath: "/tmp/repo",
      command: { kind: "switch", branch: "feature" },
    });
  });

  test("filters remote branches and tracks the selected branch", async () => {
    const onOpenChange = vi.fn();
    render(<AppCommandPalette open initialAction="switch-branch" onOpenChange={onOpenChange} />);

    const search = screen.getByRole("textbox", { name: "Search branches" });
    fireEvent.change(search, { target: { value: "origin/topic" } });
    await pressHotkey("Enter", search);
    expect(mocks.execute).not.toHaveBeenCalled();
    await pressHotkey("Enter");
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(mocks.execute).toHaveBeenCalledWith({
      repoPath: "/tmp/repo",
      command: { kind: "track", remoteBranch: "origin/topic", branch: "topic" },
    });
  });

  test("Right selects and Left goes back for actions that need input", async () => {
    render(<AppCommandPalette open onOpenChange={() => {}} />);

    const search = screen.getByRole("textbox", { name: "Search Git actions" });
    fireEvent.change(search, { target: { value: "Commit" } });
    await pressHotkey("ArrowRight");
    expect(screen.getByRole("textbox", { name: "Commit message" })).toBeInTheDocument();

    await pressHotkey("ArrowLeft");
    expect(screen.getByRole("group", { name: "Actions" })).toBeInTheDocument();
  });

  test("Right advances to a commit message and Left returns to actions", async () => {
    render(<AppCommandPalette open onOpenChange={() => {}} />);

    fireEvent.change(screen.getByRole("textbox", { name: "Search Git actions" }), {
      target: { value: "Commit" },
    });
    await pressHotkey("ArrowRight");
    expect(screen.getByRole("textbox", { name: "Commit message" })).toBeInTheDocument();

    await pressHotkey("ArrowLeft");
    expect(screen.getByRole("group", { name: "Actions" })).toBeInTheDocument();
  });

  test("Left and Backspace leave an empty stash branch search instead of trapping the flow", async () => {
    render(<AppCommandPalette open initialAction="stash-switch" onOpenChange={() => {}} />);

    const search = screen.getByRole("textbox", { name: "Search branches" });
    expect(search).toHaveFocus();
    await pressHotkey("ArrowLeft", search);
    expect(screen.getByRole("group", { name: "Actions" })).toBeInTheDocument();

    fireEvent.click(actionChoice(/^Stash & switch/));
    const branchSearch = screen.getByRole("textbox", { name: "Search branches" });
    fireEvent.change(branchSearch, { target: { value: "feature" } });
    await pressHotkey("Backspace", branchSearch);
    expect(screen.getByRole("textbox", { name: "Search branches" })).toBeInTheDocument();
    fireEvent.change(branchSearch, { target: { value: "" } });
    await pressHotkey("Backspace", branchSearch);
    expect(screen.getByRole("group", { name: "Actions" })).toBeInTheDocument();
  });

  test("pressing the action card returns from the stash branch step", () => {
    render(<AppCommandPalette open initialAction="stash-switch" onOpenChange={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Action: Stash & switch" }));
    expect(screen.getByRole("group", { name: "Actions" })).toBeInTheDocument();
  });

  test("an empty branch name goes back with Left while a nonempty name stays editable", async () => {
    render(<AppCommandPalette open initialAction="create-branch" onOpenChange={() => {}} />);

    const name = screen.getByRole("textbox", { name: "Branch name" });
    fireEvent.change(name, { target: { value: "feature/new" } });
    await pressHotkey("ArrowLeft", name);
    expect(screen.getByRole("textbox", { name: "Branch name" })).toBeInTheDocument();
    fireEvent.change(name, { target: { value: "" } });
    await pressHotkey("ArrowLeft", name);
    expect(screen.getByRole("group", { name: "Actions" })).toBeInTheDocument();
  });

  test("back from a stash confirmation returns to branch choice, then actions", async () => {
    render(<AppCommandPalette open initialAction="stash-switch" onOpenChange={() => {}} />);

    await pressHotkey("Enter");
    expect(screen.getByRole("button", { name: "Confirm Stash & switch" })).toBeEnabled();
    await pressHotkey("ArrowLeft");
    expect(screen.getByRole("textbox", { name: "Search branches" })).toBeInTheDocument();
    await pressHotkey("ArrowLeft", screen.getByRole("textbox", { name: "Search branches" }));
    expect(screen.getByRole("group", { name: "Actions" })).toBeInTheDocument();
  });

  test("runs Pull through the existing Git command mutation", async () => {
    const onOpenChange = vi.fn();
    render(<AppCommandPalette open onOpenChange={onOpenChange} />);

    fireEvent.click(actionChoice(/^Pull/));
    expect(mocks.execute).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm Pull" }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(mocks.execute).toHaveBeenCalledWith({
      repoPath: "/tmp/repo",
      command: { kind: "pull" },
    });
  });

  test("runs Push when commits are ahead of upstream", async () => {
    mocks.useGetGitRepositoryStateQuery.mockReturnValue({
      repository: {
        ...baseRepository,
        ahead: 2,
        behind: 0,
      },
    });
    const onOpenChange = vi.fn();
    render(<AppCommandPalette open onOpenChange={onOpenChange} />);

    fireEvent.click(actionChoice(/^Push/));
    expect(mocks.execute).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm Push" }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(mocks.execute).toHaveBeenCalledWith({
      repoPath: "/tmp/repo",
      command: { kind: "push" },
    });
  });

  test("does not offer a normal push for a diverged branch", () => {
    mocks.useGetGitRepositoryStateQuery.mockReturnValue({
      repository: {
        ...baseRepository,
        ahead: 2,
        behind: 1,
      },
    });
    render(<AppCommandPalette open onOpenChange={() => {}} />);

    fireEvent.change(screen.getByRole("textbox", { name: "Search Git actions" }), {
      target: { value: "Push" },
    });
    expect(actionChoice(/^Push/)).toBeDisabled();
    expect(actionChoice(/^Push/)).toHaveTextContent("Branch has diverged");
  });

  test("keeps a failed quick action open with a retry", async () => {
    mocks.execute.mockReturnValue({
      unwrap: () => Promise.reject({ message: "Remote rejected the command" }),
    });
    const onOpenChange = vi.fn();
    render(<AppCommandPalette open onOpenChange={onOpenChange} />);

    fireEvent.click(actionChoice(/^Pull/));
    fireEvent.click(screen.getByRole("button", { name: "Confirm Pull" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Remote rejected the command");
    expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  test("commits staged files with the entered message", async () => {
    const onOpenChange = vi.fn();
    render(<AppCommandPalette open onOpenChange={onOpenChange} />);

    fireEvent.click(actionChoice(/^Commit/));
    expect(screen.getByRole("textbox", { name: "Commit message" })).toHaveFocus();
    fireEvent.change(screen.getByPlaceholderText("Summary, then an optional description"), {
      target: { value: "A short summary" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm Commit" }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(mocks.dispatch).toHaveBeenCalledWith({
      type: "test/message",
      payload: "A short summary",
    });
    expect(mocks.dispatch).toHaveBeenCalledWith({ type: "test/commit" });
  });

  test.each([
    ["Stage all", "test/stage-all"],
    ["Unstage all", "test/unstage-all"],
  ])("runs %s through the source control action", async (label, actionType) => {
    const onOpenChange = vi.fn();
    render(<AppCommandPalette open onOpenChange={onOpenChange} />);

    fireEvent.click(actionChoice(new RegExp(`^${label}`)));
    expect(mocks.dispatch).not.toHaveBeenCalledWith({ type: actionType });
    fireEvent.click(screen.getByRole("button", { name: `Confirm ${label}` }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(mocks.dispatch).toHaveBeenCalledWith({ type: actionType });
  });

  test("keeps Stage all open with an error and retry when staging fails", async () => {
    mocks.dispatch.mockImplementation((action) =>
      action.type === "test/stage-all" ? Promise.resolve(false) : undefined,
    );
    const onOpenChange = vi.fn();
    render(<AppCommandPalette open onOpenChange={onOpenChange} />);

    fireEvent.click(actionChoice(/^Stage all/));
    fireEvent.click(screen.getByRole("button", { name: "Confirm Stage all" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not stage the changes.");
    expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  test("stashes only staged changes", async () => {
    const onOpenChange = vi.fn();
    render(<AppCommandPalette open onOpenChange={onOpenChange} />);

    fireEvent.click(actionChoice(/^Stash staged/));
    expect(mocks.execute).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm Stash staged" }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(mocks.execute).toHaveBeenCalledWith({
      repoPath: "/tmp/repo",
      command: { kind: "stash-staged" },
    });
  });

  test("keeps bulk actions unavailable when their scope is empty", () => {
    mocks.useGetGitSnapshotQuery.mockReturnValue({
      stagedCount: 0,
      unstageableCount: 0,
      hasMixedFile: false,
    });
    render(<AppCommandPalette open onOpenChange={() => {}} />);

    expect(actionChoice(/^Stage all/)).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: "Search Git actions" }), {
      target: { value: "stage" },
    });
    expect(actionChoice(/^Stage all/)).toBeDisabled();
    expect(actionChoice(/^Unstage all/)).toBeDisabled();
    expect(actionChoice(/^Stash staged/)).toBeDisabled();
  });

  test("disables staged stash when staged and unstaged edits share a file", () => {
    mocks.useGetGitSnapshotQuery.mockReturnValue({
      stagedCount: 1,
      unstageableCount: 1,
      hasMixedFile: true,
    });
    render(<AppCommandPalette open onOpenChange={() => {}} />);

    fireEvent.change(screen.getByRole("textbox", { name: "Search Git actions" }), {
      target: { value: "stash staged" },
    });
    expect(actionChoice(/^Stash staged/)).toBeDisabled();
    expect(actionChoice(/^Stash staged/)).toHaveTextContent("Staged path has other changes");
  });
});
