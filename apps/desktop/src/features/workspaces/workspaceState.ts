import type { UnknownAction } from "@reduxjs/toolkit";
import { sourceControlReducer } from "@/features/source-control/sourceControlSlice";
import { pullRequestsReducer } from "@/features/pull-requests/pullRequestsSlice";
import type { PersistedWorkspaceTabs } from "@/platform/desktop/workspaceTabs";
import { workspaceSessionRestored, workspacesReducer } from "./workspacesSlice";

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
  const {
    repos: _repos,
    recentRepos: _recentRepos,
    activeRepo: _activeRepo,
    runningAction: _runningAction,
    diffStyle: _diffStyle,
    ...view
  } = source;
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
  if (workspaceSessionRestored.match(action)) {
    workspaceViews = Object.fromEntries(
      Object.entries(action.payload.views).map(([id, view]) => {
        const { previewActiveFilePath, ...source } = view;
        return [
          id,
          {
            source: {
              ...capture(
                sourceControlReducer(undefined, { type: "init" }),
                pullRequestsReducer(undefined, { type: "init" }),
              ).source,
              ...source,
            },
            review: { ...pullRequestsReducer(undefined, { type: "init" }), previewActiveFilePath },
          },
        ];
      }),
    );
  }
  const previousId = state?.workspaces.activeWorkspaceId ?? "";
  const nextId = workspaces.activeWorkspaceId;
  if (state && (previousId !== nextId || workspaceSessionRestored.match(action))) {
    workspaceViews =
      previousId && !workspaceSessionRestored.match(action)
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
  if (
    workspace &&
    (sourceControl.activeRepo !== workspace.repoPath ||
      !sourceControl.repos.includes(workspace.repoPath))
  ) {
    sourceControl = {
      ...sourceControl,
      activeRepo: workspace.repoPath,
      repos: sourceControl.repos.includes(workspace.repoPath)
        ? sourceControl.repos
        : [...sourceControl.repos, workspace.repoPath],
    };
  } else if (!workspace && previousId !== nextId) {
    sourceControl = { ...sourceControl, activeRepo: "" };
  }
  return { sourceControl, pullRequests, workspaces, workspaceViews };
}

export function serializeWorkspaceTabs(state: WorkspaceState): PersistedWorkspaceTabs {
  const views = { ...state.workspaceViews };
  if (state.workspaces.activeWorkspaceId)
    views[state.workspaces.activeWorkspaceId] = capture(state.sourceControl, state.pullRequests);
  return {
    activeByProject: state.workspaces.activeByProject,
    memory: state.workspaces.memory,
    items: state.workspaces.items,
    activeWorkspaceId: state.workspaces.activeWorkspaceId,
    locations: state.workspaces.locations,
    views: Object.fromEntries(
      state.workspaces.items.flatMap((item) => {
        const view = views[item.id];
        if (!view) return [];
        const {
          activePath,
          activeBucket,
          repoTreeActivePath,
          commitMessage,
          historyCommitId,
          historyFilter,
          historySelectedCommitIds,
          historyNavTarget,
          reviewBaseRef,
          reviewHeadRef,
          reviewActivePath,
        } = view.source;
        return [
          [
            item.id,
            {
              activePath,
              activeBucket,
              repoTreeActivePath,
              commitMessage,
              historyCommitId,
              historyFilter,
              historySelectedCommitIds,
              historyNavTarget,
              reviewBaseRef,
              reviewHeadRef,
              reviewActivePath,
              previewActiveFilePath: view.review.previewActiveFilePath,
            },
          ],
        ];
      }),
    ),
  };
}
