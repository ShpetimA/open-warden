import { describe, expect, it } from "vitest";
import { reduceWorkspaceState, serializeWorkspaceTabs } from "./workspaceState";
import {
  repoWorkspaceUpserted,
  pullRequestWorkspaceUpserted,
  workspaceActivated,
  workspaceRemoved,
  workspaceSessionRestored,
  workspaceCommitDraftReplaced,
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

  it("closing a background tab preserves the active review and closing the active review returns to its project", () => {
    let state = reduceWorkspaceState(undefined, repoWorkspaceUpserted({ repoPath: "/a" }));
    state = reduceWorkspaceState(state, pullRequestWorkspaceUpserted(pr));
    const prId = state.workspaces.activeWorkspaceId;
    state = reduceWorkspaceState(state, setPullRequestPreviewActiveFilePath("selected.ts"));
    state = reduceWorkspaceState(state, repoWorkspaceUpserted({ repoPath: "/c", activate: false }));
    state = reduceWorkspaceState(state, workspaceRemoved({ id: "/a" }));
    expect(state.workspaces.activeWorkspaceId).toBe(prId);
    expect(state.pullRequests.previewActiveFilePath).toBe("selected.ts");
    state = reduceWorkspaceState(state, workspaceRemoved({ id: prId }));
    expect(state.workspaces.activeWorkspaceId).toBe("/b");
    expect(state.sourceControl.activeRepo).toBe("/b");
  });
});

it("round trips tab order, PR identity, active tab and drafts through session storage", () => {
  let state = reduceWorkspaceState(undefined, repoWorkspaceUpserted({ repoPath: "/a" }));
  state = reduceWorkspaceState(state, setCommitMessage("keep this draft"));
  state = reduceWorkspaceState(state, pullRequestWorkspaceUpserted(pr));
  state = reduceWorkspaceState(state, setPullRequestPreviewActiveFilePath("review.ts"));
  const saved = serializeWorkspaceTabs(state);
  const restored = reduceWorkspaceState(
    reduceWorkspaceState(undefined, { type: "init" }),
    workspaceSessionRestored(saved),
  );
  expect(restored.workspaces.items).toEqual(state.workspaces.items);
  expect(restored.workspaces.activeWorkspaceId).toBe(state.workspaces.activeWorkspaceId);
  expect(restored.pullRequests.previewActiveFilePath).toBe("review.ts");
  const repo = reduceWorkspaceState(restored, workspaceActivated({ id: "/a" }));
  expect(repo.sourceControl.commitMessage).toBe("keep this draft");
});

it("never clears the repository while switching between a project and its PR", () => {
  let state = reduceWorkspaceState(undefined, repoWorkspaceUpserted({ repoPath: "/b" }));
  state = reduceWorkspaceState(state, pullRequestWorkspaceUpserted(pr));
  expect(state.sourceControl.activeRepo).toBe("/b");
  state = reduceWorkspaceState(state, workspaceActivated({ id: "/b" }));
  expect(state.sourceControl.activeRepo).toBe("/b");
  state = reduceWorkspaceState(
    state,
    workspaceActivated({
      id: state.workspaces.items.find((item) => item.kind === "pull-request")!.id,
    }),
  );
  expect(state.sourceControl.activeRepo).toBe("/b");
});

it("keeps a closed project's commit draft through serialization and reopening after restart", () => {
  let state = reduceWorkspaceState(undefined, repoWorkspaceUpserted({ repoPath: "/a" }));
  state = reduceWorkspaceState(state, setCommitMessage("Closed project draft"));
  state = reduceWorkspaceState(state, workspaceRemoved({ id: "/a" }));
  const saved = serializeWorkspaceTabs(state);
  expect(saved.items).toEqual([]);
  expect(saved.views["/a"].commitMessage).toBe("Closed project draft");
  const restored = reduceWorkspaceState(undefined, workspaceSessionRestored(saved));
  const reopened = reduceWorkspaceState(restored, repoWorkspaceUpserted({ repoPath: "/a" }));
  expect(reopened.sourceControl.commitMessage).toBe("Closed project draft");
});

it("retains separate closed repo and review drafts without restoring unrelated closed views", () => {
  let state = reduceWorkspaceState(undefined, repoWorkspaceUpserted({ repoPath: "/b" }));
  state = reduceWorkspaceState(state, setCommitMessage("Repository draft"));
  state = reduceWorkspaceState(state, pullRequestWorkspaceUpserted(pr));
  const reviewId = state.workspaces.activeWorkspaceId;
  state = reduceWorkspaceState(state, setCommitMessage("Review workspace draft"));
  state = reduceWorkspaceState(state, repoWorkspaceUpserted({ repoPath: "/empty" }));
  state = reduceWorkspaceState(state, workspaceRemoved({ id: "/empty" }));
  state = reduceWorkspaceState(state, workspaceRemoved({ id: "/b" }));
  const saved = serializeWorkspaceTabs(state);
  expect(saved.views["/empty"]).toBeUndefined();
  let restored = reduceWorkspaceState(undefined, workspaceSessionRestored(saved));
  restored = reduceWorkspaceState(restored, repoWorkspaceUpserted({ repoPath: "/b" }));
  expect(restored.sourceControl.commitMessage).toBe("Repository draft");
  restored = reduceWorkspaceState(restored, pullRequestWorkspaceUpserted(pr));
  expect(restored.workspaces.activeWorkspaceId).toBe(reviewId);
  expect(restored.sourceControl.commitMessage).toBe("Review workspace draft");
  restored = reduceWorkspaceState(restored, setCommitMessage(""));
  restored = reduceWorkspaceState(restored, workspaceRemoved({ id: reviewId }));
  expect(serializeWorkspaceTabs(restored).views[reviewId]).toBeUndefined();
});

it("a completed commit consumes only the original draft in its owning workspace", () => {
  let state = reduceWorkspaceState(undefined, repoWorkspaceUpserted({ repoPath: "/a" }));
  state = reduceWorkspaceState(state, setCommitMessage("Submitted message"));
  state = reduceWorkspaceState(state, repoWorkspaceUpserted({ repoPath: "/b" }));
  state = reduceWorkspaceState(state, setCommitMessage("Other repository draft"));
  state = reduceWorkspaceState(state, workspaceRemoved({ id: "/a" }));
  state = reduceWorkspaceState(
    state,
    workspaceCommitDraftReplaced({
      workspaceId: "/a",
      expectedMessage: "Submitted message",
      message: "",
    }),
  );
  expect(state.sourceControl.commitMessage).toBe("Other repository draft");
  expect(serializeWorkspaceTabs(state).views["/a"]).toBeUndefined();
  state = reduceWorkspaceState(state, repoWorkspaceUpserted({ repoPath: "/a" }));
  expect(state.sourceControl.commitMessage).toBe("");
});

it("a newer draft survives asynchronous commit, amend, or undo completion", () => {
  let state = reduceWorkspaceState(undefined, repoWorkspaceUpserted({ repoPath: "/a" }));
  state = reduceWorkspaceState(state, setCommitMessage("Submitted message"));
  state = reduceWorkspaceState(state, setCommitMessage("New work in progress"));
  for (const message of ["", "Message from undone commit"]) {
    state = reduceWorkspaceState(
      state,
      workspaceCommitDraftReplaced({
        workspaceId: "/a",
        expectedMessage: "Submitted message",
        message,
      }),
    );
    expect(state.sourceControl.commitMessage).toBe("New work in progress");
  }
  state = reduceWorkspaceState(state, repoWorkspaceUpserted({ repoPath: "/b" }));
  state = reduceWorkspaceState(
    state,
    workspaceCommitDraftReplaced({
      workspaceId: "/a",
      expectedMessage: "Submitted message",
      message: "",
    }),
  );
  state = reduceWorkspaceState(state, repoWorkspaceUpserted({ repoPath: "/a" }));
  expect(state.sourceControl.commitMessage).toBe("New work in progress");
});
