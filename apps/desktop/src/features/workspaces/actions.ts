import type { AppThunk } from "@/app/store";
import { openRepo } from "@/features/source-control/actions";
import { removeRepo } from "@/features/source-control/sourceControlSlice";
import {
  pullRequestWorkspaceUpserted,
  projectRemoved,
  projectReopened,
  selectWorkspaceById,
  workspaceActivated,
  workspaceRemoved,
  type PullRequestWorkspace,
} from "./workspacesSlice";

export const selectWorkspace =
  (id: string): AppThunk =>
  (dispatch) => {
    dispatch(workspaceActivated({ id }));
  };

export const closeWorkspace =
  (id: string): AppThunk =>
  (dispatch, getState) => {
    const closing = selectWorkspaceById(id)(getState());
    if (!closing) return;
    dispatch(workspaceRemoved({ id }));
    if (!getState().workspaces.items.some((item) => item.repoPath === closing.repoPath)) {
      dispatch(removeRepo(closing.repoPath));
    }
  };

export const reopenWorkspace = (): AppThunk => (dispatch, getState) => {
  const workspace = getState().workspaces.closed.at(-1);
  if (!workspace) return;
  if (workspace.kind === "repo") dispatch(projectReopened(workspace));
  else dispatch(pullRequestWorkspaceUpserted(workspace));
};

export const openPullRequestWorkspace =
  (input: Omit<PullRequestWorkspace, "id" | "kind">): AppThunk<Promise<void>> =>
  async (dispatch, getState) => {
    if (!getState().sourceControl.repos.includes(input.repoPath)) {
      await dispatch(openRepo(input.repoPath, { workspace: "preserve" }));
    }
    if (!getState().sourceControl.repos.includes(input.repoPath)) return;
    dispatch(pullRequestWorkspaceUpserted(input));
  };

export const closeProject =
  (repoPath: string): AppThunk =>
  (dispatch) => {
    dispatch(projectRemoved({ repoPath }));
    dispatch(removeRepo(repoPath));
  };
