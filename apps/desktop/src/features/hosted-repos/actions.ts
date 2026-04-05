import type { AppThunk } from "@/app/store";
import { preparePullRequestWorkspace } from "@/features/hosted-repos/services/hostedRepos";
import {
  createPullRequestReviewSession,
  setCurrentPullRequestReview,
  setPullRequestReviewTab,
} from "@/features/pull-requests/pullRequestsSlice";
import { openRepo } from "@/features/source-control/actions";
import {
  clearError,
  clearReviewSelection,
  setChangesSidebarMode,
  setReviewBaseRef,
  setReviewHeadRef,
  setError,
} from "@/features/source-control/sourceControlSlice";
import type { PreparedPullRequestWorkspace } from "@/platform/desktop";

export const openPullRequestReview =
  (pullRequestNumber: number): AppThunk<Promise<PreparedPullRequestWorkspace | null>> =>
  async (dispatch, getState) => {
    const activeRepo = getState().sourceControl.activeRepo;
    if (!activeRepo) {
      dispatch(setError("No repository is currently active."));
      return null;
    }

    try {
      const preparedWorkspace = await preparePullRequestWorkspace({
        repoPath: activeRepo,
        pullRequestNumber,
      });

      await dispatch(openRepo(preparedWorkspace.repoPath));
      dispatch(clearReviewSelection());
      dispatch(setReviewBaseRef(preparedWorkspace.compareBaseRef));
      dispatch(setReviewHeadRef(preparedWorkspace.compareHeadRef));
      dispatch(setCurrentPullRequestReview(createPullRequestReviewSession(preparedWorkspace)));
      dispatch(setPullRequestReviewTab("files"));
      dispatch(setChangesSidebarMode("pull-request"));
      dispatch(clearError());
      return preparedWorkspace;
    } catch (error) {
      dispatch(setError(error instanceof Error ? error.message : String(error)));
      return null;
    }
  };
