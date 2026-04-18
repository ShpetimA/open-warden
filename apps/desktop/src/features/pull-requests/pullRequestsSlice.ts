import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import type { GitProviderId } from "@/platform/desktop";

export type PullRequestReviewTab = "files" | "conversation" | "checks";
export type PullRequestFilesViewMode = "review" | "files";

export type PullRequestReviewSession = {
  providerId: GitProviderId;
  owner: string;
  repo: string;
  pullRequestNumber: number;
  title: string;
  baseRef: string;
  headRef: string;
  compareBaseRef: string;
  compareHeadRef: string;
  repoPath: string;
  worktreePath: string;
};

export type PullRequestFileJumpTarget = {
  path: string;
  lineNumber: number | null;
  lineIndex: string | null;
  focusKey: number;
  threadId: string | null;
};

type PullRequestsState = {
  currentReview: PullRequestReviewSession | null;
  activeReviewTab: PullRequestReviewTab;
  filesViewMode: PullRequestFilesViewMode;
  activeConversationThreadId: string | null;
  fileJumpTarget: PullRequestFileJumpTarget | null;
  previewActiveFilePath: string;
};

const initialState: PullRequestsState = {
  currentReview: null,
  activeReviewTab: "files",
  filesViewMode: "review",
  activeConversationThreadId: null,
  fileJumpTarget: null,
  previewActiveFilePath: "",
};

const pullRequestsSlice = createSlice({
  name: "pullRequests",
  initialState,
  reducers: {
    setCurrentPullRequestReview(state, action: PayloadAction<PullRequestReviewSession>) {
      state.currentReview = action.payload;
      state.activeReviewTab = "files";
      state.filesViewMode = "review";
      state.activeConversationThreadId = null;
      state.fileJumpTarget = null;
      state.previewActiveFilePath = "";
    },
    clearCurrentPullRequestReview(state) {
      state.currentReview = null;
      state.activeReviewTab = "files";
      state.filesViewMode = "review";
      state.activeConversationThreadId = null;
      state.fileJumpTarget = null;
      state.previewActiveFilePath = "";
    },
    setPullRequestReviewTab(state, action: PayloadAction<PullRequestReviewTab>) {
      state.activeReviewTab = action.payload;
    },
    setPullRequestFilesViewMode(state, action: PayloadAction<PullRequestFilesViewMode>) {
      state.filesViewMode = action.payload;
    },
    setActiveConversationThreadId(state, action: PayloadAction<string | null>) {
      state.activeConversationThreadId = action.payload;
    },
    setPullRequestFileJumpTarget(state, action: PayloadAction<PullRequestFileJumpTarget>) {
      state.fileJumpTarget = action.payload;
      state.activeConversationThreadId = action.payload.threadId;
    },
    clearPullRequestFileJumpTarget(state) {
      state.fileJumpTarget = null;
    },
    setPullRequestPreviewActiveFilePath(state, action: PayloadAction<string>) {
      if (state.previewActiveFilePath !== action.payload) {
        state.previewActiveFilePath = action.payload;
      }
    },
  },
});

export const {
  clearCurrentPullRequestReview,
  clearPullRequestFileJumpTarget,
  setActiveConversationThreadId,
  setPullRequestFileJumpTarget,
  setCurrentPullRequestReview,
  setPullRequestPreviewActiveFilePath,
  setPullRequestReviewTab,
  setPullRequestFilesViewMode,
} = pullRequestsSlice.actions;

export function createPullRequestReviewSession(workspace: {
  providerId: GitProviderId;
  owner: string;
  repo: string;
  pullRequestNumber: number;
  title: string;
  baseRef: string;
  headRef: string;
  compareBaseRef: string;
  compareHeadRef: string;
  repoPath: string;
  worktreePath: string;
}): PullRequestReviewSession {
  return {
    providerId: workspace.providerId,
    owner: workspace.owner,
    repo: workspace.repo,
    pullRequestNumber: workspace.pullRequestNumber,
    title: workspace.title,
    baseRef: workspace.baseRef,
    headRef: workspace.headRef,
    compareBaseRef: workspace.compareBaseRef,
    compareHeadRef: workspace.compareHeadRef,
    repoPath: workspace.repoPath,
    worktreePath: workspace.worktreePath,
  };
}

export const pullRequestsReducer = pullRequestsSlice.reducer;
