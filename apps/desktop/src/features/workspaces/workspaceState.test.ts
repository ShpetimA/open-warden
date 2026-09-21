import { describe, expect, it } from "vitest";
import { reduceWorkspaceState } from "./workspaceState";
import {
  repoWorkspaceUpserted,
  pullRequestWorkspaceUpserted,
  workspaceActivated,
  workspaceRemoved,
} from "./workspacesSlice";
import { setActivePath, setCommitMessage } from "@/features/source-control/sourceControlSlice";
import { setPullRequestPreviewActiveFilePath } from "@/features/pull-requests/pullRequestsSlice";

const pr = {
  repoPath: "/b",
  providerId: "github" as const,
  owner: "acme",
  repo: "b",
  pullRequestNumber: 1,
  title: "Fix",
};

describe("workspace transitions", () => {
  it("restores selection and drafts while synchronizing the repository for PR tabs", () => {
    let state = reduceWorkspaceState(undefined, repoWorkspaceUpserted({ repoPath: "/a" }));
    state = reduceWorkspaceState(state, setActivePath("src/a.ts"));
    state = reduceWorkspaceState(state, setCommitMessage("unfinished commit"));
    state = reduceWorkspaceState(state, pullRequestWorkspaceUpserted(pr));
    const prId = state.workspaces.activeWorkspaceId;
    expect(state.sourceControl.activeRepo).toBe("/b");
    expect(state.sourceControl.activePath).toBe("");
    state = reduceWorkspaceState(state, setPullRequestPreviewActiveFilePath("src/b.ts"));
    state = reduceWorkspaceState(state, workspaceActivated({ id: "/a" }));
    expect(state.sourceControl.activeRepo).toBe("/a");
    expect(state.sourceControl.activePath).toBe("src/a.ts");
    expect(state.sourceControl.commitMessage).toBe("unfinished commit");
    state = reduceWorkspaceState(state, workspaceActivated({ id: prId }));
    expect(state.pullRequests.previewActiveFilePath).toBe("src/b.ts");
  });

  it("closing a background tab preserves the active review and closing the active tab chooses its neighbor", () => {
    let state = reduceWorkspaceState(undefined, repoWorkspaceUpserted({ repoPath: "/a" }));
    state = reduceWorkspaceState(state, pullRequestWorkspaceUpserted(pr));
    const prId = state.workspaces.activeWorkspaceId;
    state = reduceWorkspaceState(state, setPullRequestPreviewActiveFilePath("selected.ts"));
    state = reduceWorkspaceState(state, repoWorkspaceUpserted({ repoPath: "/c", activate: false }));
    state = reduceWorkspaceState(state, workspaceRemoved({ id: "/a" }));
    expect(state.workspaces.activeWorkspaceId).toBe(prId);
    expect(state.pullRequests.previewActiveFilePath).toBe("selected.ts");
    state = reduceWorkspaceState(state, workspaceRemoved({ id: prId }));
    expect(state.workspaces.activeWorkspaceId).toBe("/c");
    expect(state.sourceControl.activeRepo).toBe("/c");
  });
});
