import { describe, expect, it } from "vitest";

import {
  addRecentRepo,
  createWorkspaceSession,
  mergeRecentRepos,
  normalizeRepoPaths,
} from "@/platform/desktop/workspaceSession";

describe("workspaceSession helpers", () => {
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
