import type { AppThunk } from "@/app/store";
import { hostedReposApi } from "@/features/hosted-repos/api";
import { preparePullRequestWorkspace } from "@/features/hosted-repos/services/hostedRepos";
import { desktop } from "@/platform/desktop";
import {
  clearCurrentPullRequestReview,
  createPullRequestReviewSession,
  setCurrentPullRequestReview,
} from "@/features/pull-requests/pullRequestsSlice";
import { openRepo, refreshActiveRepo } from "@/features/source-control/actions";
import {
  clearReviewSelection,
  resetRepoViewState,
  setReviewBaseRef,
  setReviewHeadRef,
} from "@/features/source-control/sourceControlSlice";
import type { PreparedPullRequestWorkspace, PullRequestOpenMode } from "@/platform/desktop";

export type OpenPullRequestReviewResult = {
  workspace: PreparedPullRequestWorkspace | null;
  errorMessage: string | null;
};

export const openPullRequestReview =
  (
    pullRequestNumber: number,
    openMode: PullRequestOpenMode = "worktree",
  ): AppThunk<Promise<OpenPullRequestReviewResult>> =>
  async (dispatch, getState) => {
    const activeRepo = getState().sourceControl.activeRepo;
    if (!activeRepo) {
      return { workspace: null, errorMessage: "No repository is currently active." };
    }

    try {
      if (openMode === "branch") {
        const snapshot = await desktop.getGitSnapshot(activeRepo);
        const hasLocalChanges =
          snapshot.unstaged.length > 0 ||
          snapshot.staged.length > 0 ||
          snapshot.untracked.length > 0;
        if (hasLocalChanges) {
          return {
            workspace: null,
            errorMessage:
              "Branch checkout needs a clean repository. Commit, stash, or discard local changes first.",
          };
        }
      }

      const preparedWorkspace = await preparePullRequestWorkspace({
        repoPath: activeRepo,
        pullRequestNumber,
        openMode,
      });

      const reopeningCurrentRepo = preparedWorkspace.repoPath === activeRepo;
      await dispatch(openRepo(preparedWorkspace.repoPath));
      if (reopeningCurrentRepo) {
        dispatch(resetRepoViewState());
        dispatch(clearCurrentPullRequestReview());
      }
      await dispatch(refreshActiveRepo());
      dispatch(
        hostedReposApi.util.invalidateTags([
          { type: "HostedRepo", id: `${preparedWorkspace.repoPath}:pull-request-workspace` },
        ]),
      );
      dispatch(clearReviewSelection());
      dispatch(setReviewBaseRef(preparedWorkspace.compareBaseRef));
      dispatch(setReviewHeadRef(preparedWorkspace.compareHeadRef));
      dispatch(setCurrentPullRequestReview(createPullRequestReviewSession(preparedWorkspace)));
      return { workspace: preparedWorkspace, errorMessage: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { workspace: null, errorMessage: message };
    }
  };
