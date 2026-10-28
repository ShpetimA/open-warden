import { failureFromUnknown } from "@/platform/desktop/failure";
import type { AppThunk } from "@/app/store";
import { preparePullRequestWorkspace } from "@/features/hosted-repos/services/hostedRepos";
import { desktop } from "@/platform/desktop";

import { openRepo, refreshActiveRepo } from "@/features/source-control/actions";
import {
  selectActiveWorkspace,
  pullRequestWorkspaceUpserted,
} from "@/features/workspaces/workspacesSlice";
import type { PullRequestOpenMode } from "@/platform/desktop";

export type OpenPullRequestReviewResult = {
  errorMessage: string | null;
  repoPath: string | null;
};

export const openPullRequestReview =
  (
    pullRequestNumber: number,
    openMode: PullRequestOpenMode = "worktree",
  ): AppThunk<Promise<OpenPullRequestReviewResult>> =>
  async (dispatch, getState) => {
    const activeRepo = getState().sourceControl.activeRepo;
    const workspace = selectActiveWorkspace(getState());
    if (!activeRepo) {
      return { errorMessage: "No repository is currently active.", repoPath: null };
    }

    try {
      if (openMode === "branch") {
        const result = await desktop.getGitSnapshot(activeRepo);
        if (!result.ok) return { errorMessage: result.error.message, repoPath: null };
        const snapshot = result.value;
        const hasLocalChanges =
          snapshot.unstaged.length > 0 ||
          snapshot.staged.length > 0 ||
          snapshot.untracked.length > 0;
        if (hasLocalChanges) {
          return {
            errorMessage:
              "Branch checkout needs a clean repository. Commit, stash, or discard local changes first.",
            repoPath: null,
          };
        }
      }

      const prepared = await preparePullRequestWorkspace({
        repoPath: activeRepo,
        pullRequestNumber,
        openMode,
      });

      if (!prepared.ok) return { errorMessage: prepared.error.message, repoPath: null };
      const preparedWorkspace = prepared.value;
      await dispatch(openRepo(preparedWorkspace.repoPath, { workspace: "preserve" }));
      if (workspace?.kind === "pull-request") {
        dispatch(
          pullRequestWorkspaceUpserted({ ...workspace, repoPath: preparedWorkspace.repoPath }),
        );
      }
      await dispatch(refreshActiveRepo());
      return { errorMessage: null, repoPath: preparedWorkspace.repoPath };
    } catch (error) {
      const message = failureFromUnknown(error, "repositoryAction").message;
      return { errorMessage: message, repoPath: null };
    }
  };
