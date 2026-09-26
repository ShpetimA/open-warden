import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import type { PersistedWorkspaceTabs } from "@/platform/desktop/workspaceTabs";
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
  activeByProject: Record<string, string>;
  closedProjects: Record<string, Workspace[]>;
  memory: Record<string, Record<string, number>>;
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
  providerId: GitProviderId;
  owner: string;
  repo: string;
  pullRequestNumber: number;
}): string {
  return `pr:${input.repoPath}:${input.providerId}:${input.owner}/${input.repo}:${input.pullRequestNumber}`;
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
    repoPath: input.repoPath,
    providerId: input.providerId,
    owner: input.owner,
    repo: input.repo,
    pullRequestNumber: input.pullRequestNumber,
    title: input.title,
  };
}

const initialState: WorkspacesState = {
  activeByProject: {},
  closedProjects: {},
  memory: {},
  locations: {},
  closed: [],
  items: [],
  activeWorkspaceId: "",
};

function removeProject(state: WorkspacesState, repoPath: string) {
  const closing = state.items.filter((item) => item.repoPath === repoPath);
  const parent = closing.find((item) => item.kind === "repo");
  if (!parent) return;
  state.closedProjects[repoPath] = closing;
  state.closed = [...state.closed.filter((item) => item.repoPath !== repoPath), parent].slice(-20);
  const projects = state.items.filter((item) => item.kind === "repo");
  const index = projects.findIndex((item) => item.id === parent.id);
  const wasActive = closing.some((item) => item.id === state.activeWorkspaceId);
  state.items = state.items.filter((item) => item.repoPath !== repoPath);
  if (wasActive) {
    const next = projects[index + 1] ?? projects[index - 1];
    state.activeWorkspaceId = next ? (state.activeByProject[next.repoPath] ?? next.id) : "";
    if (!state.items.some((item) => item.id === state.activeWorkspaceId))
      state.activeWorkspaceId = next?.id ?? "";
  }
}

const workspacesSlice = createSlice({
  name: "workspaces",
  initialState,
  reducers: {
    workspaceMemoryChanged(
      state,
      action: PayloadAction<{ key: string; value: Record<string, number> }>,
    ) {
      state.memory[action.payload.key] = action.payload.value;
    },
    workspaceSessionRestored(state, action: PayloadAction<PersistedWorkspaceTabs>) {
      state.items = [...action.payload.items];
      state.activeByProject = { ...action.payload.activeByProject };
      for (const item of action.payload.items) {
        if (
          !state.items.some((parent) => parent.kind === "repo" && parent.repoPath === item.repoPath)
        )
          state.items.push(createRepoWorkspace(item.repoPath));
      }
      state.activeWorkspaceId = action.payload.activeWorkspaceId;
      const active = state.items.find((item) => item.id === state.activeWorkspaceId);
      if (active) state.activeByProject[active.repoPath] = active.id;
      state.locations = action.payload.locations;
      state.memory = action.payload.memory;
    },
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
        state.activeByProject[repoPath] = state.activeWorkspaceId;
      }
    },
    pullRequestWorkspaceUpserted(
      state,
      action: PayloadAction<Omit<PullRequestWorkspace, "id" | "kind"> & { activate?: boolean }>,
    ) {
      const workspace = createPullRequestWorkspace(action.payload);
      if (!state.items.some((item) => item.kind === "repo" && item.repoPath === workspace.repoPath))
        state.items.push(createRepoWorkspace(workspace.repoPath));
      const matches = (item: Workspace) =>
        item.kind === "pull-request" && pullRequestWorkspaceId(item) === workspace.id;
      const existingIndex = state.items.findIndex(matches);
      const previous = state.items[existingIndex] ?? state.closed.find(matches);
      state.closed = state.closed.filter((item) => !matches(item));
      if (previous) workspace.id = previous.id;
      if (existingIndex < 0) {
        state.items.push(workspace);
      } else {
        state.items[existingIndex] = workspace;
      }
      if (action.payload.activate !== false) {
        state.activeWorkspaceId = workspace.id;
        state.activeByProject[workspace.repoPath] = workspace.id;
      }
    },
    workspaceLocationChanged(state, action: PayloadAction<{ id: string; path: string }>) {
      state.locations[action.payload.id] = action.payload.path;
    },
    workspaceActivated(state, action: PayloadAction<{ id: string }>) {
      if (state.items.some((item) => item.id === action.payload.id)) {
        state.activeWorkspaceId = action.payload.id;
        const item = state.items.find((item) => item.id === action.payload.id);
        if (item) state.activeByProject[item.repoPath] = item.id;
      }
    },
    projectActivated(state, action: PayloadAction<{ repoPath: string }>) {
      const { repoPath } = action.payload;
      const previous = state.items.find((item) => item.id === state.activeWorkspaceId);
      if (previous) state.activeByProject[previous.repoPath] = previous.id;
      const saved = state.activeByProject[repoPath];
      const target =
        state.items.find((item) => item.repoPath === repoPath && item.id === saved) ??
        state.items.find((item) => item.repoPath === repoPath);
      if (target) state.activeWorkspaceId = target.id;
    },
    projectRemoved(state, action: PayloadAction<{ repoPath: string }>) {
      removeProject(state, action.payload.repoPath);
    },
    projectForgotten(state, action: PayloadAction<{ repoPath: string }>) {
      const { repoPath } = action.payload;
      const affected = [
        ...state.items.filter((item) => item.repoPath === repoPath),
        ...(state.closedProjects[repoPath] ?? []),
        ...state.closed.filter((item) => item.repoPath === repoPath),
      ];
      removeProject(state, repoPath);
      state.closed = state.closed.filter((item) => item.repoPath !== repoPath);
      delete state.closedProjects[repoPath];
      delete state.activeByProject[repoPath];
      for (const workspace of affected) delete state.locations[workspace.id];
    },
    projectReopened(state, action: PayloadAction<{ repoPath: string }>) {
      const { repoPath } = action.payload;
      const items = state.closedProjects[repoPath] ?? [createRepoWorkspace(repoPath)];
      for (const item of items)
        if (!state.items.some((open) => open.id === item.id)) state.items.push(item);
      state.closed = state.closed.filter((item) => item.repoPath !== repoPath);
      delete state.closedProjects[repoPath];
      const saved = state.activeByProject[repoPath];
      state.activeWorkspaceId =
        state.items.find((item) => item.id === saved && item.repoPath === repoPath)?.id ?? repoPath;
    },
    workspaceRemoved(state, action: PayloadAction<{ id: string }>) {
      const index = state.items.findIndex((item) => item.id === action.payload.id);
      const closing = state.items[index];
      if (!closing) return;
      if (closing.kind === "repo") {
        removeProject(state, closing.repoPath);
        return;
      }
      state.closed = [...state.closed.filter((item) => item.id !== closing.id), closing].slice(-20);
      const wasActive = state.activeWorkspaceId === action.payload.id;
      state.items = state.items.filter((item) => item.id !== action.payload.id);
      if (wasActive) {
        state.activeWorkspaceId =
          state.items.find((item) => item.repoPath === closing.repoPath && item.kind === "repo")
            ?.id ??
          state.items[index]?.id ??
          state.items[index - 1]?.id ??
          "";
        if (state.activeWorkspaceId === closing.repoPath)
          state.locations[closing.repoPath] = "/pull-requests";
        const active = state.items.find((item) => item.id === state.activeWorkspaceId);
        if (active) state.activeByProject[active.repoPath] = active.id;
      }
    },
  },
});

export const workspacesReducer = workspacesSlice.reducer;
export const {
  projectActivated,
  projectRemoved,
  projectForgotten,
  projectReopened,
  workspaceMemoryChanged,
  workspaceSessionRestored,
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
