import { describe, expect, it } from "vitest";

import {
  addRecentRepo,
  createWorkspaceSession,
  mergeRecentRepos,
  normalizeRepoPaths,
  storedWorkspaceSessionSchema,
} from "@/platform/desktop/workspaceSession";

describe("workspaceSession helpers", () => {
  it("keeps both versions of editor drafts and rejects incomplete saved drafts", () => {
    const draft = {
      repoPath: "/repo",
      relPath: "file.ts",
      baseContents: "base\n",
      contents: "draft\n",
    };
    const session = {
      openRepos: ["/repo"],
      activeRepo: "/repo",
      recentRepos: [],
      fileEditorDrafts: [draft],
    };

    expect(createWorkspaceSession(session).fileEditorDrafts).toEqual([draft]);
    expect(
      storedWorkspaceSessionSchema.safeParse({
        ...session,
        fileEditorDrafts: [{ ...draft, baseContents: null }],
      }).success,
    ).toBe(false);
  });

  it("normalizes repo path arrays", () => {
    expect(normalizeRepoPaths([" /repo/a ", "", "/repo/a", "/repo/b"])).toEqual([
      "/repo/a",
      "/repo/b",
    ]);
  });

  it("keeps active and open repos in the recent list", () => {
    expect(
      createWorkspaceSession({
        openRepos: ["/repo/a", "/repo/b"],
        activeRepo: "/repo/b",
        recentRepos: ["/repo/c", "/repo/a"],
      }),
    ).toEqual({
      openRepos: ["/repo/a", "/repo/b"],
      activeRepo: "/repo/b",
      recentRepos: ["/repo/b", "/repo/a", "/repo/c"],
    });
  });

  it("moves the newest repo to the front of recents", () => {
    expect(addRecentRepo(["/repo/b", "/repo/a"], "/repo/c")).toEqual([
      "/repo/c",
      "/repo/b",
      "/repo/a",
    ]);
    expect(mergeRecentRepos(["/repo/b", "/repo/a"], ["/repo/c"], "/repo/c")).toEqual([
      "/repo/c",
      "/repo/b",
      "/repo/a",
    ]);
  });
});
