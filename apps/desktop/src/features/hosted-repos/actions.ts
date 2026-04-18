import type { AppThunk } from "@/app/store";
import { preparePullRequestWorkspace } from "@/features/hosted-repos/services/hostedRepos";
import { desktop } from "@/platform/desktop";
import { clearCurrentPullRequestReview } from "@/features/pull-requests/pullRequestsSlice";
import { openRepo, refreshActiveRepo } from "@/features/source-control/actions";
import { resetRepoViewState } from "@/features/source-control/sourceControlSlice";
import type { PullRequestOpenMode } from "@/platform/desktop";

export type OpenPullRequestReviewResult = {
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
      return { errorMessage: "No repository is currently active." };
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
      return { errorMessage: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { errorMessage: message };
    }
  };
