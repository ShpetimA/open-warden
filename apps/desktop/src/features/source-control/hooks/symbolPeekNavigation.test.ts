import { describe, expect, it } from "vitest";

import type { RootState } from "@/app/store";
import { getNextSymbolPeekIndex } from "./symbolPeekNavigation";

function createState(overrides: Partial<RootState["sourceControl"]>): RootState {
  return {
    sourceControl: {
      repos: [],
      activeRepo: "/repo",
      recentRepos: [],
      historyFilter: "",
      historyCommitId: "",
      historyNavTarget: "commits",
      collapseStaged: false,
      collapseUnstaged: false,
      changesSidebarMode: "changes",
      activeBucket: "unstaged",
      activePath: "",
      repoTreeActivePath: "",
      diffStyle: "split",
      commitMessage: "",
      lastCommitId: "",
      runningAction: "",
      error: "",
      selectedFiles: [],
      selectionAnchor: null,
      reviewBaseRef: "",
      reviewHeadRef: "",
      reviewActivePath: "",
      diffFocusTarget: null,
      fileViewerTarget: null,
      symbolPeek: null,
      ...overrides,
    },
    comments: [],
    hostedReposApi: {} as RootState["hostedReposApi"],
    hostedRepos: {
      selectedProviderId: null,
    },
    lsp: {
      byFile: {},
    },
    settings: {
      appSettings: {
        sourceControl: {
          diffStyle: "split",
          fileTreeRenderMode: "tree",
        },
      },
      loaded: true,
      settingsPath: null,
      runningAction: "",
      error: "",
    },
    pullRequests: {
      currentReview: null,
      activeReviewTab: "files",
      filesViewMode: "review",
      activeConversationThreadId: null,
      fileJumpTarget: null,
    },
    gitApi: {} as RootState["gitApi"],
  };
}

describe("symbolPeekNavigation", () => {
  it("returns null when peek is not open", () => {
    const state = createState({});
    expect(getNextSymbolPeekIndex(state, true)).toBeNull();
    expect(getNextSymbolPeekIndex(state, false)).toBeNull();
  });

  it("navigates to next and previous filtered symbol locations", () => {
    const state = createState({
      symbolPeek: {
        kind: "references",
        locations: [
          {
            repoPath: "/repo",
            relPath: "src/a.ts",
            uri: "file:///repo/src/a.ts",
            line: 10,
            character: 0,
            endLine: 10,
            endCharacter: 5,
          },
          {
            repoPath: "/repo",
            relPath: "src/b.ts",
            uri: "file:///repo/src/b.ts",
            line: 20,
            character: 2,
            endLine: 20,
            endCharacter: 8,
          },
          {
            repoPath: "/repo",
            relPath: "src/b.ts",
            uri: "file:///repo/src/b.ts#2",
            line: 30,
            character: 4,
            endLine: 30,
            endCharacter: 9,
          },
        ],
        activeIndex: 1,
        query: "src/b.ts",
        sourceDocument: {
          repoPath: "/repo",
          relPath: "src/current.ts",
        },
        anchor: {
          lineNumber: 1,
          lineIndex: null,
        },
      },
    });

    expect(getNextSymbolPeekIndex(state, true)).toBe(2);
    expect(getNextSymbolPeekIndex(state, false)).toBe(2);
  });

  it("uses filtered first match when active item is no longer in filtered results", () => {
    const state = createState({
      symbolPeek: {
        kind: "definitions",
        locations: [
          {
            repoPath: "/repo",
            relPath: "src/a.ts",
            uri: "file:///repo/src/a.ts",
            line: 10,
            character: 0,
            endLine: 10,
            endCharacter: 5,
          },
          {
            repoPath: "/repo",
            relPath: "src/b.ts",
            uri: "file:///repo/src/b.ts",
            line: 20,
            character: 2,
            endLine: 20,
            endCharacter: 8,
          },
        ],
        activeIndex: 0,
        query: "src/b.ts",
        sourceDocument: {
          repoPath: "/repo",
          relPath: "src/current.ts",
        },
        anchor: {
          lineNumber: 1,
          lineIndex: null,
        },
      },
    });

    expect(getNextSymbolPeekIndex(state, true)).toBe(1);
  });
});
