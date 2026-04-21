import { configureStore } from "@reduxjs/toolkit";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { commentsReducer } from "@/features/comments/commentsSlice";
import { pullRequestsReducer } from "@/features/pull-requests/pullRequestsSlice";
import { settingsReducer } from "@/features/settings/settingsSlice";
import { desktop } from "@/platform/desktop";

import {
  closeRepo,
  navigateBackToDiffFromFileViewer,
  openRepo,
  restoreWorkspaceSession,
} from "./actions";
import {
  hydrateWorkspaceSession,
  openFileViewer,
  setActivePath,
  setCommitMessage,
  setHistoryFilter,
  setReviewBaseRef,
  setReviewHeadRef,
  setSelectedFiles,
  sourceControlReducer,
} from "./sourceControlSlice";

vi.mock("@/platform/desktop", () => ({
  desktop: {
    selectFolder: vi.fn(),
    loadWorkspaceSession: vi.fn(),
    saveWorkspaceSession: vi.fn(),
    loadAppSettings: vi.fn(),
    saveAppSettings: vi.fn(),
    getAppSettingsPath: vi.fn(),
    confirm: vi.fn(),
    checkAppExists: vi.fn(),
    openPath: vi.fn(),
    getGitSnapshot: vi.fn(),
    getRepoFiles: vi.fn(),
    getCommitHistory: vi.fn(),
    getBranches: vi.fn(),
    getBranchFiles: vi.fn(),
    getCommitFiles: vi.fn(),
    getCommitFileVersions: vi.fn(),
    getFileVersions: vi.fn(),
    getBranchFileVersions: vi.fn(),
    stageFile: vi.fn(),
    unstageFile: vi.fn(),
    stageAll: vi.fn(),
    unstageAll: vi.fn(),
    discardFile: vi.fn(),
    discardFiles: vi.fn(),
    discardAll: vi.fn(),
    commitStaged: vi.fn(),
    getUpdateState: vi.fn(),
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    installUpdate: vi.fn(),
    onUpdateState: vi.fn(() => () => {}),
    onLspDiagnostics: vi.fn(() => () => {}),
    onAppSettingsChanged: vi.fn(() => () => {}),
  },
}));

function createTestStore() {
  return configureStore({
    reducer: {
      settings: settingsReducer,
      sourceControl: sourceControlReducer,
      pullRequests: pullRequestsReducer,
      comments: commentsReducer,
    },
  });
}

describe("source control workspace actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(desktop.saveWorkspaceSession).mockImplementation(async (session) => session);
  });

  it("restores a saved session, drops invalid repos, and persists the sanitized state", async () => {
    const store = createTestStore();

    vi.mocked(desktop.loadWorkspaceSession).mockResolvedValue({
      openRepos: ["/repo/a", "/missing"],
      activeRepo: "/repo/a",
      recentRepos: ["/missing", "/repo/b"],
    });
    vi.mocked(desktop.getGitSnapshot).mockImplementation(async (repoPath: string) => {
      if (repoPath === "/repo/a") {
        return {
          repoRoot: "/repo/a",
          branch: "main",
          staged: [],
          unstaged: [],
          untracked: [],
        };
      }

      if (repoPath === "/repo/b") {
        return {
          repoRoot: "/repo/b",
          branch: "main",
          staged: [],
          unstaged: [],
          untracked: [],
        };
      }

      throw new Error("missing repo");
    });

    await store.dispatch(restoreWorkspaceSession());

    expect(store.getState().sourceControl.repos).toEqual(["/repo/a"]);
    expect(store.getState().sourceControl.activeRepo).toBe("/repo/a");
    expect(store.getState().sourceControl.recentRepos).toEqual(["/repo/a", "/repo/b"]);
    expect(desktop.saveWorkspaceSession).toHaveBeenCalledWith({
      openRepos: ["/repo/a"],
      activeRepo: "/repo/a",
      recentRepos: ["/repo/a", "/repo/b"],
    });
  });

  it("does not clear selection when reopening the current active repo", async () => {
    const store = createTestStore();

    store.dispatch(
      hydrateWorkspaceSession({
        openRepos: ["/repo/a"],
        activeRepo: "/repo/a",
        recentRepos: ["/repo/b", "/repo/a"],
      }),
    );
    store.dispatch(setActivePath("src/file.ts"));
    store.dispatch(setSelectedFiles([{ bucket: "unstaged", path: "src/file.ts" }]));

    vi.mocked(desktop.getGitSnapshot).mockResolvedValue({
      repoRoot: "/repo/a",
      branch: "main",
      staged: [],
      unstaged: [],
      untracked: [],
    });

    await store.dispatch(openRepo("/repo/a"));

    expect(store.getState().sourceControl.activePath).toBe("src/file.ts");
    expect(store.getState().sourceControl.selectedFiles).toEqual([
      { bucket: "unstaged", path: "src/file.ts" },
    ]);
    expect(store.getState().sourceControl.recentRepos).toEqual(["/repo/a", "/repo/b"]);
  });

  it("resets repo-scoped tab state when closing the active repo", async () => {
    const store = createTestStore();

    store.dispatch(
      hydrateWorkspaceSession({
        openRepos: ["/repo/a", "/repo/b"],
        activeRepo: "/repo/b",
        recentRepos: ["/repo/b", "/repo/a"],
      }),
    );
    store.dispatch(setActivePath("src/file.ts"));
    store.dispatch(setSelectedFiles([{ bucket: "unstaged", path: "src/file.ts" }]));
    store.dispatch(setHistoryFilter("needle"));
    store.dispatch(setCommitMessage("wip"));
    store.dispatch(setReviewBaseRef("main"));
    store.dispatch(setReviewHeadRef("feature"));

    await store.dispatch(closeRepo("/repo/b"));

    expect(store.getState().sourceControl.activeRepo).toBe("/repo/a");
    expect(store.getState().sourceControl.activePath).toBe("");
    expect(store.getState().sourceControl.selectedFiles).toEqual([]);
    expect(store.getState().sourceControl.historyFilter).toBe("");
    expect(store.getState().sourceControl.commitMessage).toBe("");
    expect(store.getState().sourceControl.reviewBaseRef).toBe("");
    expect(store.getState().sourceControl.reviewHeadRef).toBe("");
  });

  it("returns from file viewer to changes diff and restores origin focus", async () => {
    const store = createTestStore();

    store.dispatch(
      openFileViewer({
        repoPath: "/repo/a",
        relPath: "src/target.ts",
        line: 5,
        column: 1,
        focusKey: 7,
        returnToDiff: {
          kind: "changes",
          repoPath: "/repo/a",
          path: "src/origin.ts",
          bucket: "unstaged",
          lineNumber: 41,
          lineIndex: "40,0",
        },
      }),
    );

    await store.dispatch(navigateBackToDiffFromFileViewer());
    const state = store.getState();

    expect(state.sourceControl.changesSidebarMode).toBe("files");
    expect(state.sourceControl.fileViewerTarget).toBeNull();
    expect(state.sourceControl.activeBucket).toBe("unstaged");
    expect(state.sourceControl.activePath).toBe("src/origin.ts");
    expect(state.sourceControl.diffFocusTarget).toEqual(
      expect.objectContaining({
        kind: "changes",
        path: "src/origin.ts",
        lineNumber: 41,
        lineIndex: "40,0",
        focusKey: expect.any(Number),
      }),
    );
  });

  it("returns from file viewer to pull request diff and restores jump target", async () => {
    const store = createTestStore();

    store.dispatch(
      openFileViewer({
        repoPath: "/repo/a",
        relPath: "src/target.ts",
        line: 5,
        column: 1,
        focusKey: 7,
        returnToDiff: {
          kind: "pull-request",
          repoPath: "/repo/a",
          path: "src/pr-origin.ts",
          lineNumber: 24,
          lineIndex: "23,1",
        },
      }),
    );

    await store.dispatch(navigateBackToDiffFromFileViewer());
    const state = store.getState();

    expect(state.sourceControl.changesSidebarMode).toBe("pull-request");
    expect(state.sourceControl.fileViewerTarget).toBeNull();
    expect(state.sourceControl.reviewActivePath).toBe("src/pr-origin.ts");
    expect(state.pullRequests.activeReviewTab).toBe("files");
    expect(state.pullRequests.filesViewMode).toBe("review");
    expect(state.pullRequests.fileJumpTarget).toEqual(
      expect.objectContaining({
        path: "src/pr-origin.ts",
        lineNumber: 24,
        lineIndex: "23,1",
        threadId: null,
        focusKey: expect.any(Number),
      }),
    );
  });
});
