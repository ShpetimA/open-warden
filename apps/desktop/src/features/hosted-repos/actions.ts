import type { AppThunk } from "@/app/store";
import { hostedReposApi } from "@/features/hosted-repos/api";
import { preparePullRequestWorkspace } from "@/features/hosted-repos/services/hostedRepos";
import {
  clearCurrentPullRequestReview,
  createPullRequestReviewSession,
  setCurrentPullRequestReview,
  setPullRequestReviewTab,
} from "@/features/pull-requests/pullRequestsSlice";
import { openRepo, refreshActiveRepo } from "@/features/source-control/actions";
import {
  clearReviewSelection,
  resetRepoViewState,
  setChangesSidebarMode,
  setReviewBaseRef,
  setReviewHeadRef,
} from "@/features/source-control/sourceControlSlice";
import type { PreparedPullRequestWorkspace } from "@/platform/desktop";

export type OpenPullRequestReviewResult = {
  workspace: PreparedPullRequestWorkspace | null;
  errorMessage: string | null;
};

export const openPullRequestReview =
  (pullRequestNumber: number): AppThunk<Promise<OpenPullRequestReviewResult>> =>
  async (dispatch, getState) => {
    const activeRepo = getState().sourceControl.activeRepo;
    if (!activeRepo) {
      return { workspace: null, errorMessage: "No repository is currently active." };
    }

    try {
      const preparedWorkspace = await preparePullRequestWorkspace({
        repoPath: activeRepo,
        pullRequestNumber,
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
      dispatch(setPullRequestReviewTab("files"));
      dispatch(setChangesSidebarMode("pull-request"));
      return { workspace: preparedWorkspace, errorMessage: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { workspace: null, errorMessage: message };
    }
  };
