import type { UnknownAction } from "@reduxjs/toolkit";
import { sourceControlReducer } from "@/features/source-control/sourceControlSlice";
import { pullRequestsReducer } from "@/features/pull-requests/pullRequestsSlice";
import { workspacesReducer } from "./workspacesSlice";

type SourceState = ReturnType<typeof sourceControlReducer>;
type ReviewState = ReturnType<typeof pullRequestsReducer>;
type WorkspaceView = {
  source: Omit<SourceState, "repos" | "recentRepos" | "activeRepo" | "runningAction" | "diffStyle">;
  review: ReviewState;
};
export type WorkspaceState = {
  sourceControl: SourceState;
  pullRequests: ReviewState;
  workspaces: ReturnType<typeof workspacesReducer>;
  workspaceViews: Record<string, WorkspaceView>;
};

function capture(source: SourceState, review: ReviewState): WorkspaceView {
  const { repos, recentRepos, activeRepo, runningAction, diffStyle, ...view } = source;
  return { source: view, review };
}

export function reduceWorkspaceState(
  state: WorkspaceState | undefined,
  action: UnknownAction,
): WorkspaceState {
  let sourceControl = sourceControlReducer(state?.sourceControl, action);
  let pullRequests = pullRequestsReducer(state?.pullRequests, action);
  const workspaces = workspacesReducer(state?.workspaces, action);
  let workspaceViews = state?.workspaceViews ?? {};
  const previousId = state?.workspaces.activeWorkspaceId ?? "";
  const nextId = workspaces.activeWorkspaceId;
  if (state && previousId !== nextId) {
    workspaceViews = previousId
      ? { ...workspaceViews, [previousId]: capture(state.sourceControl, state.pullRequests) }
      : workspaceViews;
    const view =
      workspaceViews[nextId] ??
      capture(
        sourceControlReducer(undefined, { type: "init" }),
        pullRequestsReducer(undefined, { type: "init" }),
      );
    sourceControl = { ...sourceControl, ...view.source, runningAction: "" };
    pullRequests = view.review;
  }
  const workspace = workspaces.items.find((item) => item.id === nextId);
  if (workspace) {
    sourceControl = {
      ...sourceControl,
      activeRepo: workspace.repoPath,
      repos: sourceControl.repos.includes(workspace.repoPath)
        ? sourceControl.repos
        : [...sourceControl.repos, workspace.repoPath],
    };
  } else if (previousId !== nextId) {
    sourceControl = { ...sourceControl, activeRepo: "" };
  }
  return { sourceControl, pullRequests, workspaces, workspaceViews };
}
