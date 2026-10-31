import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import type { AppThunk } from "@/app/store";
import { desktop } from "@/platform/desktop";
import type { PullRequestLink } from "@/platform/desktop/pullRequestLink";
import {
  prepareLinkedPullRequest,
  type LinkedPullRequestWorkspace,
  type RepositorySetupStage,
} from "./prepareLinkedPullRequest";

type SetupProgress =
  | { stage: RepositorySetupStage }
  | { stage: "ready"; workspace: LinkedPullRequestWorkspace }
  | { stage: "error"; failedStage: RepositorySetupStage | "opening"; message: string };

export type RepositorySetup = {
  link: PullRequestLink;
  visible: boolean;
  progress: SetupProgress;
};

const initialState: { items: RepositorySetup[] } = { items: [] };
const slice = createSlice({
  name: "repositorySetup",
  initialState,
  reducers: {
    setupStarted(state, action: PayloadAction<PullRequestLink>) {
      const existing = state.items.find((item) => item.link.url === action.payload.url);
      if (existing) {
        existing.visible = true;
        if (existing.progress.stage === "error") existing.progress = { stage: "locating" };
      } else {
        state.items.push({ link: action.payload, visible: true, progress: { stage: "locating" } });
      }
    },
    setupProgressed(state, action: PayloadAction<{ url: string; progress: SetupProgress }>) {
      const setup = state.items.find((item) => item.link.url === action.payload.url);
      if (setup) setup.progress = action.payload.progress;
    },
    setupClosed(state, action: PayloadAction<string>) {
      const setup = state.items.find((item) => item.link.url === action.payload);
      if (setup) setup.visible = false;
    },
  },
});

export const repositorySetupReducer = slice.reducer;
export const { setupClosed, setupProgressed } = slice.actions;

export function repositorySetupPath(url: string) {
  return `/repository-setup?url=${encodeURIComponent(url)}`;
}

export const startRepositorySetup =
  (link: PullRequestLink): AppThunk<Promise<void>> =>
  async (dispatch, getState) => {
    const existing = getState().repositorySetup.items.find((item) => item.link.url === link.url);
    dispatch(slice.actions.setupStarted(link));
    if (existing && existing.progress.stage !== "error") return;
    const { repos, recentRepos } = getState().sourceControl;
    const result = await prepareLinkedPullRequest(
      desktop,
      link,
      [...repos, ...recentRepos],
      (stage) => {
        dispatch(setupProgressed({ url: link.url, progress: { stage } }));
      },
    );
    dispatch(
      setupProgressed({
        url: link.url,
        progress: result.ok
          ? { stage: "ready", workspace: result.workspace }
          : { stage: "error", failedStage: result.stage, message: result.message },
      }),
    );
  };
