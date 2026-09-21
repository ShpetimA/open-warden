import { describe, expect, it } from "vitest";

import {
  pullRequestWorkspaceUpserted,
  repoWorkspaceUpserted,
  selectActiveWorkspace,
  selectWorkspaces,
  workspacesHydrated,
  workspaceActivated,
  workspaceRemoved,
  workspacesReducer,
} from "./workspacesSlice";

describe("workspacesSlice", () => {
  it("hydrates repo workspaces in order with active repo", () => {
    const next = workspacesReducer(
      undefined,
      workspacesHydrated({ openRepos: ["/repo/a", "/repo/b"], activeRepo: "/repo/b" }),
    );

    expect(selectWorkspaces({ workspaces: next } as never)).toEqual([
      { id: "/repo/a", kind: "repo", repoPath: "/repo/a" },
      { id: "/repo/b", kind: "repo", repoPath: "/repo/b" },
    ]);
    expect(next.activeWorkspaceId).toBe("/repo/b");
  });

  it("upserts and activates repo workspace idempotently", () => {
    let next = workspacesReducer(undefined, repoWorkspaceUpserted({ repoPath: "/repo/a" }));
    next = workspacesReducer(next, repoWorkspaceUpserted({ repoPath: "/repo/a" }));

    expect(next.items).toHaveLength(1);
    expect(next.activeWorkspaceId).toBe("/repo/a");
  });

  it("upserts pull request workspaces without losing repo order", () => {
    let next = workspacesReducer(undefined, workspacesHydrated({ openRepos: ["/repo/a"] }));
    next = workspacesReducer(
      next,
      pullRequestWorkspaceUpserted({
        repoPath: "/repo/a",
        providerId: "github",
        owner: "acme",
        repo: "bo-ui",
        pullRequestNumber: 41,
        title: "Design polish",
      }),
    );

    expect(next.items.map((item) => item.kind)).toEqual(["repo", "pull-request"]);

    next = workspacesReducer(
      next,
      pullRequestWorkspaceUpserted({
        repoPath: "/repo/a",
        providerId: "github",
        owner: "acme",
        repo: "bo-ui",
        pullRequestNumber: 41,
        title: "Design polish updated",
      }),
    );
    expect(next.items).toHaveLength(2);
    expect(next.items[1]?.title).toBe("Design polish updated");
  });

  it("falls back to the last workspace when removing the active one", () => {
    let next = workspacesReducer(
      undefined,
      workspacesHydrated({ openRepos: ["/repo/a", "/repo/b"] }),
    );
    next = workspacesReducer(next, workspaceActivated({ id: "/repo/b" }));
    next = workspacesReducer(next, workspaceRemoved({ id: "/repo/b" }));

    expect(next.activeWorkspaceId).toBe("/repo/a");

    next = workspacesReducer(next, workspaceRemoved({ id: "/repo/a" }));
    expect(next.activeWorkspaceId).toBe("");
  });

  it("exposes the active workspace via selector", () => {
    let next = workspacesReducer(undefined, workspacesHydrated({ openRepos: ["/repo/a"] }));
    next = workspacesReducer(next, workspaceActivated({ id: "/repo/a" }));

    const active = selectActiveWorkspace({ workspaces: next } as never);
    expect(active?.kind).toBe("repo");
  });
});
