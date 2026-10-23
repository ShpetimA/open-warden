import {
  act,
  fireEvent,
  render as renderUI,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { ReactElement } from "react";

import type { PullRequestSummary } from "@/platform/desktop";
import { MemoryRouter } from "react-router";

import { AppCommandPalette } from "./AppCommandPalette";

function render(ui: ReactElement) {
  return renderUI(ui, { wrapper: MemoryRouter });
}

const mocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
  execute: vi.fn(),
  useGetGitSnapshotQuery: vi.fn(),
  useGetGitRepositoryStateQuery: vi.fn(),
  useGetGitStashPatchQuery: vi.fn(),
  useRunGitCommandMutation: vi.fn(),
  useHotkey: vi.fn(),
  browseDirectory: vi.fn(),
  selectFolder: vi.fn(),
  useListPullRequestsQuery: vi.fn(),
  useGetPullRequestConversationQuery: vi.fn(),
  useResolveHostedRepoQuery: vi.fn(),
  usePreparePullRequestCompareRefsQuery: vi.fn(),
  addComment: vi.fn(),
  submitReview: vi.fn(),
  submitDecision: vi.fn(),
  mergePullRequest: vi.fn(),
  createPullRequest: vi.fn(),
  comments: [] as unknown[],
}));

vi.mock("@tanstack/react-hotkeys", () => ({ useHotkey: mocks.useHotkey }));

vi.mock("@/app/hooks", () => ({
  useAppDispatch: () => mocks.dispatch,
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({
      sourceControl: {
        activeRepo: "/tmp/repo",
        recentRepos: ["/tmp/repo", "/tmp/other"],
        runningAction: "",
        commitMessage: "",
      },
      comments: mocks.comments,
      workspaces: { items: [], activeWorkspaceId: "" },
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
  openRepo: (path: string) => ({ type: "test/open-repo", payload: path }),
  commitAction: () => ({ type: "test/commit" }),
  stageAllAction: () => ({ type: "test/stage-all" }),
  unstageAllAction: () => ({ type: "test/unstage-all" }),
  setCommitMessageValue: (message: string) => ({ type: "test/message", payload: message }),
}));

vi.mock("@/platform/desktop", () => ({
  desktop: {
    browseDirectory: mocks.browseDirectory,
    selectFolder: mocks.selectFolder,
    confirm: vi.fn(),
  },
}));

vi.mock("@/features/hosted-repos/api", () => ({
  useListPullRequestsQuery: mocks.useListPullRequestsQuery,
  useGetPullRequestConversationQuery: mocks.useGetPullRequestConversationQuery,
  useResolveHostedRepoQuery: mocks.useResolveHostedRepoQuery,
  usePreparePullRequestCompareRefsQuery: mocks.usePreparePullRequestCompareRefsQuery,
  useAddPullRequestCommentMutation: () => [mocks.addComment],
  useSubmitPullRequestReviewCommentsMutation: () => [mocks.submitReview],
  useSubmitPullRequestReviewMutation: () => [mocks.submitReview],
  useSubmitPullRequestDecisionMutation: () => [mocks.submitDecision],
  useMergePullRequestMutation: () => [mocks.mergePullRequest],
  useCreatePullRequestMutation: () => [mocks.createPullRequest],
}));

vi.mock("@/features/hosted-repos/actions", () => ({
  openPullRequestReview: (number: number, mode: string) => ({
    type: "test/open-pr-review",
    payload: { number, mode },
  }),
}));

vi.mock("@/features/workspaces/actions", () => ({
  openPullRequestWorkspace: (input: unknown) => ({
    type: "test/open-pr-workspace",
    payload: input,
  }),
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
  tags: [],
  worktrees: [],
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

const pullRequest: PullRequestSummary = {
  id: "github:42",
  providerId: "github",
  number: 42,
  title: "Improve the composer",
  state: "open",
  isDraft: false,
  author: { login: "timi", displayName: "Timi", avatarUrl: null },
  url: "https://example.test/pull/42",
  baseRef: "main",
  headRef: "composer",
  headOwner: "team",
  headRepo: "repo",
  createdAt: "2026-09-25T00:00:00Z",
  updatedAt: "2026-09-26T00:00:00Z",
  reviewers: [],
  reviewDecision: null,
  checksState: null,
  commentCount: null,
  additions: null,
  deletions: null,
  changedFiles: null,
};

describe("AppCommandPalette", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.comments = [];
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
    mocks.browseDirectory.mockResolvedValue({
      ok: true,
      path: "/tmp",
      parentPath: "/",
      entries: [{ name: "project", path: "/tmp/project" }],
    });
    mocks.selectFolder.mockResolvedValue("/tmp/project");
    mocks.useListPullRequestsQuery.mockReturnValue({
      pullRequestPage: { pullRequests: [pullRequest], page: 1, perPage: 25, hasNextPage: false },
      loadingPullRequests: false,
      listError: null,
    });
    mocks.useGetPullRequestConversationQuery.mockReturnValue({
      currentConversation: null,
      selectedConversation: null,
    });
    mocks.useResolveHostedRepoQuery.mockReturnValue({
      hostedRepo: { providerId: "github", owner: "team", repo: "repo" },
    });
    mocks.usePreparePullRequestCompareRefsQuery.mockReturnValue({
      compareRefs: null,
      loadingCompareRefs: false,
    });
    mocks.addComment.mockReturnValue({ unwrap: () => Promise.resolve() });
    mocks.submitReview.mockReturnValue({
      unwrap: () => Promise.resolve({ submittedDraftIds: [] }),
    });
    mocks.submitDecision.mockReturnValue({ unwrap: () => Promise.resolve() });
    mocks.mergePullRequest.mockReturnValue({ unwrap: () => Promise.resolve("merged") });
    mocks.createPullRequest.mockReturnValue({ unwrap: () => Promise.resolve(pullRequest) });
    mocks.dispatch.mockImplementation((action) =>
      ["test/commit", "test/stage-all", "test/unstage-all"].includes(action.type)
        ? Promise.resolve(true)
        : action.type === "test/open-repo"
          ? Promise.resolve(true)
          : action.type === "test/open-pr-review"
            ? Promise.resolve({ errorMessage: null, repoPath: "/tmp/review" })
            : action.type === "test/open-pr-workspace"
              ? Promise.resolve()
              : undefined,
    );
  });

  test("keeps repository subscriptions unmounted while closed", () => {
    render(<AppCommandPalette open={false} onOpenChange={() => {}} />);

    expect(mocks.useGetGitSnapshotQuery).not.toHaveBeenCalled();
    expect(mocks.useGetGitRepositoryStateQuery).not.toHaveBeenCalled();
  });

  test("shows command scopes and keeps unavailable actions explained", () => {
    render(<AppCommandPalette open onOpenChange={() => {}} />);

    expect(screen.getByRole("dialog", { name: "Command composer" })).toHaveClass(
      "command-composer-dialog",
    );
    expect(screen.getByRole("textbox", { name: "Search actions" })).toHaveFocus();
    expect(actionChoice(/^Pull(?! requests)/)).toBeEnabled();
    expect(actionChoice(/^Push/)).toBeDisabled();
    expect(actionChoice(/^Commit/)).toBeEnabled();
    expect(actionChoice(/^Stage all/)).toBeEnabled();
    expect(actionChoice(/^Unstage all/)).toBeEnabled();
    expect(actionChoice(/^Stash staged/)).toBeEnabled();
    expect(actionChoice(/^Branches/)).toBeEnabled();
    expect(actionChoice(/^Fetch/)).toBeEnabled();
    expect(
      within(screen.getByRole("group", { name: "Actions" })).getAllByRole("button"),
    ).toHaveLength(17);
    expect(screen.getByText("Available now")).toBeInTheDocument();
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
    expect(screen.queryByText("Stage changes")).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "Search actions" }), {
      target: { value: "switch" },
    });
    expect(actionChoice(/^Branches/)).toBeEnabled();
  });

  test("typing narrows commands and scopes", () => {
    render(<AppCommandPalette open onOpenChange={() => {}} />);

    fireEvent.change(screen.getByRole("textbox", { name: "Search actions" }), {
      target: { value: "stage" },
    });

    expect(actionChoice(/^Stage all/)).toBeEnabled();
    expect(actionChoice(/^Stash staged/)).toBeEnabled();
    expect(screen.queryByRole("button", { name: /^Fetch/ })).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("group", { name: "Actions" })).getAllByRole("button").length,
    ).toBeLessThan(17);
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

    fireEvent.change(screen.getByRole("textbox", { name: "Search actions" }), {
      target: { value: "Pull" },
    });
    fireEvent.mouseEnter(actionChoice(/^Pull(?! requests)/));
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

      const search = screen.getByRole("textbox", { name: "Search actions" });
      fireEvent.keyDown(search, { key: "ArrowDown" });
      expect(behindKeydown).not.toHaveBeenCalled();

      fireEvent.change(search, { target: { value: "stage all" } });
      await pressHotkey("ArrowDown");
      await pressHotkey("ArrowUp");
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

    const search = screen.getByRole("textbox", { name: "Search actions" });
    fireEvent.change(search, { target: { value: "Commit" } });
    fireEvent.mouseEnter(actionChoice(/^Commit/));
    await pressHotkey("ArrowRight");
    expect(screen.getByRole("textbox", { name: "Commit message" })).toBeInTheDocument();

    await pressHotkey("ArrowLeft");
    expect(screen.getByRole("group", { name: "Actions" })).toBeInTheDocument();
  });

  test("Right advances to a commit message and Left returns to actions", async () => {
    render(<AppCommandPalette open onOpenChange={() => {}} />);

    fireEvent.change(screen.getByRole("textbox", { name: "Search actions" }), {
      target: { value: "Commit" },
    });
    fireEvent.mouseEnter(actionChoice(/^Commit/));
    await pressHotkey("ArrowRight");
    expect(screen.getByRole("textbox", { name: "Commit message" })).toBeInTheDocument();

    await pressHotkey("ArrowLeft");
    expect(screen.getByRole("group", { name: "Actions" })).toBeInTheDocument();
  });

  test.each(["ArrowLeft", "Backspace"])(
    "%s leaves an empty stash branch search and preserves a nonempty query",
    async (key) => {
      render(<AppCommandPalette open initialAction="stash-switch" onOpenChange={() => {}} />);

      const search = screen.getByRole("textbox", { name: "Search branches" });
      expect(search).toHaveFocus();
      fireEvent.change(search, { target: { value: "feature" } });
      await pressHotkey(key, search);
      expect(search).toBeInTheDocument();
      expect(search).toHaveValue("feature");

      fireEvent.change(search, { target: { value: "" } });
      await pressHotkey(key, search);
      expect(screen.getByRole("group", { name: "Actions" })).toBeInTheDocument();
    },
  );

  test("pressing the action card returns from the stash branch step", () => {
    render(<AppCommandPalette open initialAction="stash-switch" onOpenChange={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Action: Stash & switch" }));
    expect(screen.getByRole("group", { name: "Actions" })).toBeInTheDocument();
  });

  test.each(["", "feature/new"])(
    "Left returns from branch-name review with draft %j",
    async (draft) => {
      render(<AppCommandPalette open initialAction="create-branch" onOpenChange={() => {}} />);

      const name = screen.getByRole("textbox", { name: "Branch name" });
      fireEvent.change(name, { target: { value: draft } });
      await pressHotkey("ArrowLeft", name);
      expect(screen.getByRole("group", { name: "Actions" })).toBeInTheDocument();
    },
  );

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

    fireEvent.click(actionChoice(/^Pull(?! requests)/));
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

    fireEvent.change(screen.getByRole("textbox", { name: "Search actions" }), {
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

    fireEvent.click(actionChoice(/^Pull(?! requests)/));
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
    fireEvent.change(screen.getByRole("textbox", { name: "Search actions" }), {
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

    fireEvent.change(screen.getByRole("textbox", { name: "Search actions" }), {
      target: { value: "stash staged" },
    });
    expect(actionChoice(/^Stash staged/)).toBeDisabled();
    expect(actionChoice(/^Stash staged/)).toHaveTextContent("Staged path has other changes");
  });

  test("opens a recent repository directly from its choice", async () => {
    const onOpenChange = vi.fn();
    render(<AppCommandPalette open initialAction="open-repository" onOpenChange={onOpenChange} />);

    await act(async () =>
      fireEvent.click(
        within(screen.getByRole("group", { name: "Repository" })).getByRole("button", {
          name: /other/,
        }),
      ),
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(
      screen.queryByRole("button", { name: "Confirm open repository" }),
    ).not.toBeInTheDocument();
    expect(mocks.dispatch).toHaveBeenCalledWith({
      type: "test/open-repo",
      payload: "/tmp/other",
    });
  });

  test("completes a directory without opening it", async () => {
    render(<AppCommandPalette open initialAction="open-repository" onOpenChange={() => {}} />);

    const search = screen.getByRole("textbox", {
      name: "Repository name, directory path, or pull request URL",
    });
    fireEvent.change(search, { target: { value: "/tmp/" } });
    await waitFor(() => expect(mocks.browseDirectory).toHaveBeenCalledWith("/tmp/"));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /project\/tmp\/project/ })).toBeInTheDocument(),
    );
    await act(async () => fireEvent.keyDown(search, { key: "Tab" }));
    expect(search).toHaveValue("/tmp/project/");
    expect(mocks.dispatch).not.toHaveBeenCalledWith({
      type: "test/open-repo",
      payload: "/tmp/project/",
    });
  });

  test("scrolls the highlighted repository folder into view while navigating", async () => {
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
    mocks.browseDirectory.mockResolvedValue({
      ok: true,
      path: "/tmp",
      parentPath: "/",
      entries: Array.from({ length: 24 }, (_, index) => ({
        name: `folder-${String(index).padStart(2, "0")}`,
        path: `/tmp/folder-${String(index).padStart(2, "0")}`,
      })),
    });
    try {
      render(<AppCommandPalette open initialAction="open-repository" onOpenChange={() => {}} />);
      fireEvent.change(
        screen.getByRole("textbox", {
          name: "Repository name, directory path, or pull request URL",
        }),
        {
          target: { value: "/tmp/" },
        },
      );
      await waitFor(() =>
        expect(screen.getByRole("button", { name: /folder-00/ })).toBeInTheDocument(),
      );
      scrollIntoView.mockClear();

      await pressHotkey("ArrowDown");
      expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
      expect(screen.getByRole("button", { name: /Parent folder/ })).toHaveAttribute(
        "data-highlighted",
        "true",
      );
    } finally {
      if (originalScrollIntoView) HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
      else
        delete (HTMLElement.prototype as { scrollIntoView?: typeof scrollIntoView }).scrollIntoView;
    }
  });

  test("opens a pull request from the chooser without a confirmation step", async () => {
    const onOpenChange = vi.fn();
    render(<AppCommandPalette open initialAction="open-pr" onOpenChange={onOpenChange} />);

    await act(async () =>
      fireEvent.click(
        within(screen.getByRole("group", { name: "Pull request" })).getByRole("button", {
          name: /#42 Improve the composer/,
        }),
      ),
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(
      screen.queryByRole("button", { name: "Confirm open pull request" }),
    ).not.toBeInTheDocument();
    expect(mocks.dispatch).toHaveBeenCalledWith({
      type: "test/open-pr-workspace",
      payload: expect.objectContaining({ repoPath: "/tmp/repo", pullRequestNumber: 42 }),
    });
  });

  test("opens a selected pull request as a tab without checking it out", async () => {
    const onOpenChange = vi.fn();
    await act(async () =>
      render(
        <AppCommandPalette
          open
          initialAction="open-pr"
          initialPullRequest={pullRequest}
          onOpenChange={onOpenChange}
        />,
      ),
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(
      screen.queryByRole("button", { name: "Confirm open pull request" }),
    ).not.toBeInTheDocument();
    expect(mocks.dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "test/open-pr-review" }),
    );
    expect(mocks.dispatch).toHaveBeenCalledWith({
      type: "test/open-pr-workspace",
      payload: expect.objectContaining({ repoPath: "/tmp/repo", pullRequestNumber: 42 }),
    });
  });

  test("opens a selected pull request in a worktree after confirmation", async () => {
    const onOpenChange = vi.fn();
    render(
      <AppCommandPalette
        open
        initialAction="open-pr-worktree"
        initialPullRequest={pullRequest}
        onOpenChange={onOpenChange}
      />,
    );

    expect(mocks.dispatch).not.toHaveBeenCalledWith({
      type: "test/open-pr-review",
      payload: { number: 42, mode: "worktree" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm open pr in worktree" }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(mocks.dispatch).toHaveBeenCalledWith({
      type: "test/open-pr-review",
      payload: { number: 42, mode: "worktree" },
    });
    expect(mocks.dispatch).toHaveBeenCalledWith({
      type: "test/open-pr-workspace",
      payload: expect.objectContaining({ repoPath: "/tmp/review", pullRequestNumber: 42 }),
    });
  });

  test("posts a pull request comment only after writing and confirming it", async () => {
    const onOpenChange = vi.fn();
    render(
      <AppCommandPalette
        open
        initialAction="comment-pr"
        initialPullRequest={pullRequest}
        onOpenChange={onOpenChange}
      />,
    );

    const confirm = screen.getByRole("button", { name: "Confirm comment on pull request" });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: "Comment" }), {
      target: { value: "Looks good to me" },
    });
    expect(mocks.addComment).not.toHaveBeenCalled();
    fireEvent.click(confirm);
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(mocks.addComment).toHaveBeenCalledWith({
      repoPath: "/tmp/repo",
      pullRequestNumber: 42,
      body: "Looks good to me",
    });
  });

  test("copies the selected pull request URL directly", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const onOpenChange = vi.fn();
    await act(async () =>
      render(
        <AppCommandPalette
          open
          initialAction="copy-pr-link"
          initialPullRequest={pullRequest}
          onOpenChange={onOpenChange}
        />,
      ),
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(
      screen.queryByRole("button", { name: "Confirm copy pull request link" }),
    ).not.toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(pullRequest.url);
  });

  test("submits only pending comments for the selected review after confirmation", async () => {
    mocks.comments = [
      {
        id: "draft-1",
        repoPath: "/tmp/repo",
        contextKind: "review",
        baseRef: "origin/main",
        headRef: "composer",
        filePath: "src/app.ts",
        text: "Please adjust this",
        startLine: 12,
        endLine: 12,
        side: "additions",
      },
      {
        id: "other-draft",
        repoPath: "/tmp/other",
        contextKind: "review",
        baseRef: "origin/main",
        headRef: "composer",
        filePath: "src/other.ts",
        text: "Other repo",
        startLine: 3,
        endLine: 3,
        side: "additions",
      },
    ];
    mocks.usePreparePullRequestCompareRefsQuery.mockReturnValue({
      compareRefs: { compareBaseRef: "origin/main", compareHeadRef: "composer" },
      loadingCompareRefs: false,
    });
    mocks.useGetPullRequestConversationQuery.mockReturnValue({
      currentConversation: null,
      selectedConversation: { detail: { headSha: "reviewed-sha", state: "open", isDraft: false } },
    });
    mocks.submitReview.mockReturnValue({
      unwrap: () => Promise.resolve({ submittedDraftIds: ["draft-1"], failedMessage: null }),
    });
    const onOpenChange = vi.fn();
    render(
      <AppCommandPalette
        open
        initialAction="submit-review"
        initialPullRequest={pullRequest}
        onOpenChange={onOpenChange}
      />,
    );

    expect(screen.getByText(/1 pending inline comment will be published/)).toBeInTheDocument();
    expect(mocks.submitReview).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm submit review" }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(mocks.submitReview).toHaveBeenCalledWith({
      repoPath: "/tmp/repo",
      pullRequestNumber: 42,
      expectedHeadSha: "reviewed-sha",
      decision: "comment",
      body: "",
      comments: [
        expect.objectContaining({
          draftId: "draft-1",
          path: "src/app.ts",
          body: "Please adjust this",
        }),
      ],
    });
  });

  test("creates a pull request after choosing branches, writing details, and confirming", async () => {
    const onOpenChange = vi.fn();
    render(<AppCommandPalette open initialAction="create-pr" onOpenChange={onOpenChange} />);

    fireEvent.click(screen.getByRole("button", { name: /main.*Current branch/ }));
    fireEvent.click(screen.getByRole("button", { name: /feature.*Local branch/ }));
    fireEvent.change(screen.getByRole("textbox", { name: "Title" }), {
      target: { value: "Improve composer" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Description" }), {
      target: { value: "Adds PR commands" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review pull request" }));
    expect(mocks.createPullRequest).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm create pull request" }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(mocks.createPullRequest).toHaveBeenCalledWith({
      repoPath: "/tmp/repo",
      title: "Improve composer",
      body: "Adds PR commands",
      headRef: "main",
      baseRef: "feature",
    });
  });

  test("requires a review body before requesting changes", async () => {
    mocks.useGetPullRequestConversationQuery.mockReturnValue({
      currentConversation: null,
      selectedConversation: { detail: { state: "open", isDraft: false, headSha: "abc123" } },
    });
    const onOpenChange = vi.fn();
    render(
      <AppCommandPalette
        open
        initialAction="request-changes"
        initialPullRequest={pullRequest}
        onOpenChange={onOpenChange}
      />,
    );

    const confirm = screen.getByRole("button", { name: "Confirm request changes" });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: "Changes requested" }), {
      target: { value: "Please add a test" },
    });
    fireEvent.click(confirm);
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(mocks.submitDecision).toHaveBeenCalledWith({
      repoPath: "/tmp/repo",
      pullRequestNumber: 42,
      decision: "request-changes",
      body: "Please add a test",
    });
  });

  test("Bitbucket can request changes without a review note", async () => {
    mocks.useResolveHostedRepoQuery.mockReturnValue({
      hostedRepo: { providerId: "bitbucket", owner: "team", repo: "repo" },
    });
    mocks.useGetPullRequestConversationQuery.mockReturnValue({
      currentConversation: null,
      selectedConversation: { detail: { state: "open", isDraft: false, headSha: "abc123" } },
    });
    const onOpenChange = vi.fn();
    render(
      <AppCommandPalette
        open
        initialAction="request-changes"
        initialPullRequest={{ ...pullRequest, providerId: "bitbucket" }}
        onOpenChange={onOpenChange}
      />,
    );

    expect(
      screen.getByText("Bitbucket records the change request without a review note."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirm request changes" }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(mocks.submitDecision).toHaveBeenCalledWith({
      repoPath: "/tmp/repo",
      pullRequestNumber: 42,
      decision: "request-changes",
      body: "",
    });
  });

  test("pins a merge to the reviewed head commit", async () => {
    mocks.useGetPullRequestConversationQuery.mockReturnValue({
      currentConversation: null,
      selectedConversation: { detail: { state: "open", isDraft: false, headSha: "abc123" } },
    });
    const onOpenChange = vi.fn();
    render(
      <AppCommandPalette
        open
        initialAction="merge-pr"
        initialPullRequest={pullRequest}
        onOpenChange={onOpenChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /squash/i }));
    expect(mocks.mergePullRequest).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm merge pull request" }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(mocks.mergePullRequest).toHaveBeenCalledWith({
      repoPath: "/tmp/repo",
      pullRequestNumber: 42,
      method: "squash",
      expectedHeadSha: "abc123",
    });
  });
});
