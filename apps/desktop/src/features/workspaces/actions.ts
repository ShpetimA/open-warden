import type { AppThunk } from "@/app/store";
import { openRepo } from "@/features/source-control/actions";
import { removeRepo, setRecentRepos } from "@/features/source-control/sourceControlSlice";
import {
  pullRequestWorkspaceUpserted,
  projectRemoved,
  projectForgotten,
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
  (
    input: Omit<PullRequestWorkspace, "id" | "kind">,
    options: { canActivate?: () => boolean } = {},
  ): AppThunk<Promise<boolean>> =>
  async (dispatch, getState) => {
    if (!getState().sourceControl.repos.includes(input.repoPath)) {
      await dispatch(
        openRepo(input.repoPath, { workspace: "preserve", canActivate: options.canActivate }),
      );
    }
    if (!getState().sourceControl.repos.includes(input.repoPath)) return false;
    if (options.canActivate && !options.canActivate()) return false;
    dispatch(pullRequestWorkspaceUpserted(input));
    return true;
  };

export const closeProject =
  (repoPath: string): AppThunk =>
  (dispatch) => {
    dispatch(projectRemoved({ repoPath }));
    dispatch(removeRepo(repoPath));
  };

export const forgetProject =
  (repoPath: string): AppThunk =>
  (dispatch, getState) => {
    dispatch(projectForgotten({ repoPath }));
    dispatch(removeRepo(repoPath));
    dispatch(
      setRecentRepos(getState().sourceControl.recentRepos.filter((item) => item !== repoPath)),
    );
  };
