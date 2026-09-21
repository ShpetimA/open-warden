import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import type { RootState } from "@/app/store";
import type { GitProviderId } from "@/platform/desktop";

export type RepoWorkspace = {
  id: string;
  kind: "repo";
  repoPath: string;
};

export type PullRequestWorkspace = {
  id: string;
  kind: "pull-request";
  repoPath: string;
  providerId: GitProviderId;
  owner: string;
  repo: string;
  pullRequestNumber: number;
  title: string;
};

export type Workspace = RepoWorkspace | PullRequestWorkspace;

export type WorkspacesState = {
  locations: Record<string, string>;
  closed: Workspace[];
  items: Workspace[];
  activeWorkspaceId: string;
};

export function repoWorkspaceId(repoPath: string): string {
  return repoPath;
}

export function pullRequestWorkspaceId(input: {
  repoPath: string;
  pullRequestNumber: number;
}): string {
  return `pr:${input.repoPath}:${input.pullRequestNumber}`;
}

function createRepoWorkspace(repoPath: string): RepoWorkspace {
  return { id: repoWorkspaceId(repoPath), kind: "repo", repoPath };
}

function createPullRequestWorkspace(
  input: Omit<PullRequestWorkspace, "id" | "kind">,
): PullRequestWorkspace {
  return {
    id: pullRequestWorkspaceId(input),
    kind: "pull-request",
    ...input,
  };
}

const initialState: WorkspacesState = {
  locations: {},
  closed: [],
  items: [],
  activeWorkspaceId: "",
};

const workspacesSlice = createSlice({
  name: "workspaces",
  initialState,
  reducers: {
    workspacesHydrated(state, action: PayloadAction<{ openRepos: string[]; activeRepo?: string }>) {
      state.items = action.payload.openRepos.map((repoPath) => createRepoWorkspace(repoPath));
      state.activeWorkspaceId = action.payload.activeRepo
        ? repoWorkspaceId(action.payload.activeRepo)
        : (state.items[state.items.length - 1]?.id ?? "");
    },
    repoWorkspaceUpserted(state, action: PayloadAction<{ repoPath: string; activate?: boolean }>) {
      state.closed = state.closed.filter((item) => item.id !== action.payload.repoPath);
      const { repoPath, activate = true } = action.payload;
      if (!state.items.some((workspace) => workspace.id === repoWorkspaceId(repoPath))) {
        state.items.push(createRepoWorkspace(repoPath));
      }
      if (activate) {
        state.activeWorkspaceId = repoWorkspaceId(repoPath);
      }
    },
    pullRequestWorkspaceUpserted(
      state,
      action: PayloadAction<Omit<PullRequestWorkspace, "id" | "kind"> & { activate?: boolean }>,
    ) {
      const workspace = createPullRequestWorkspace(action.payload);
      state.closed = state.closed.filter((item) => item.id !== workspace.id);
      const existingIndex = state.items.findIndex((item) => item.id === workspace.id);
      if (existingIndex < 0) {
        state.items.push(workspace);
      } else {
        state.items[existingIndex] = workspace;
      }
      if (action.payload.activate !== false) {
        state.activeWorkspaceId = workspace.id;
      }
    },
    workspaceLocationChanged(state, action: PayloadAction<{ id: string; path: string }>) {
      state.locations[action.payload.id] = action.payload.path;
    },
    workspaceActivated(state, action: PayloadAction<{ id: string }>) {
      if (state.items.some((item) => item.id === action.payload.id)) {
        state.activeWorkspaceId = action.payload.id;
      }
    },
    workspaceRemoved(state, action: PayloadAction<{ id: string }>) {
      const index = state.items.findIndex((item) => item.id === action.payload.id);
      const closing = state.items[index];
      if (!closing) return;
      state.closed = [...state.closed.filter((item) => item.id !== closing.id), closing].slice(-20);
      const wasActive = state.activeWorkspaceId === action.payload.id;
      state.items = state.items.filter((item) => item.id !== action.payload.id);
      if (wasActive) {
        state.activeWorkspaceId = state.items[index]?.id ?? state.items[index - 1]?.id ?? "";
      }
    },
  },
});

export const workspacesReducer = workspacesSlice.reducer;
export const {
  workspacesHydrated,
  repoWorkspaceUpserted,
  pullRequestWorkspaceUpserted,
  workspaceLocationChanged,
  workspaceActivated,
  workspaceRemoved,
} = workspacesSlice.actions;

export const selectWorkspaces = (state: RootState) => state.workspaces.items;
export const selectActiveWorkspaceId = (state: RootState) => state.workspaces.activeWorkspaceId;

export const selectActiveWorkspace = (state: RootState) =>
  state.workspaces.items.find((item) => item.id === state.workspaces.activeWorkspaceId) ?? null;

export const selectWorkspaceById = (id: string) => (state: RootState) =>
  state.workspaces.items.find((item) => item.id === id) ?? null;
