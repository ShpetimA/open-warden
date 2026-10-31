import type { RootState } from "@/app/store";

export const selectReviewFilePath = (state: RootState) => state.sourceControl.reviewActivePath;
export const selectHistoryFilePath = (state: RootState) => state.sourceControl.activePath;
export const selectRepoFilePath = (state: RootState) => state.sourceControl.repoTreeActivePath;
export const selectPullRequestFilePath = (state: RootState) =>
  state.pullRequests.previewActiveFilePath;
