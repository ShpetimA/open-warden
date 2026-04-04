import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import type { WorkspaceSession } from "@/platform/desktop";

import type {
  Bucket,
  ChangesSidebarMode,
  DiffStyle,
  FileViewerTarget,
  FileBrowserMode,
  HistoryNavTarget,
  RunningAction,
  SelectedFile,
  SymbolPeekState,
} from "./types";

type SourceControlState = {
  repos: string[];
  activeRepo: string;
  recentRepos: string[];
  historyFilter: string;
  historyCommitId: string;
  historyNavTarget: HistoryNavTarget;
  fileBrowserMode: FileBrowserMode;
  collapseStaged: boolean;
  collapseUnstaged: boolean;
  changesSidebarMode: ChangesSidebarMode;
  activeBucket: Bucket;
  activePath: string;
  repoTreeActivePath: string;
  diffStyle: DiffStyle;
  commitMessage: string;
  lastCommitId: string;
  runningAction: RunningAction;
  error: string;
  selectedFiles: SelectedFile[];
  selectionAnchor: SelectedFile | null;
  reviewBaseRef: string;
  reviewHeadRef: string;
  reviewActivePath: string;
  fileViewerTarget: FileViewerTarget | null;
  symbolPeek: SymbolPeekState | null;
};

const initialState: SourceControlState = {
  repos: [],
  activeRepo: "",
  recentRepos: [],
  historyFilter: "",
  historyCommitId: "",
  historyNavTarget: "commits",
  fileBrowserMode: "tree",
  collapseStaged: false,
  collapseUnstaged: false,
  changesSidebarMode: "changes",
  activeBucket: "unstaged",
  activePath: "",
  repoTreeActivePath: "",
  diffStyle: "split",
  commitMessage: "",
  lastCommitId: "",
  runningAction: "",
  error: "",
  selectedFiles: [],
  selectionAnchor: null,
  reviewBaseRef: "",
  reviewHeadRef: "",
  reviewActivePath: "",
  fileViewerTarget: null,
  symbolPeek: null,
};

const sourceControlSlice = createSlice({
  name: "sourceControl",
  initialState,
  reducers: {
    hydrateWorkspaceSession(state, action: PayloadAction<WorkspaceSession>) {
      state.repos = action.payload.openRepos;
      state.activeRepo = action.payload.activeRepo;
      state.recentRepos = action.payload.recentRepos;
    },
    setRepos(state, action: PayloadAction<string[]>) {
      state.repos = action.payload;
    },
    addRepo(state, action: PayloadAction<string>) {
      if (!state.repos.includes(action.payload)) {
        state.repos.push(action.payload);
      }
    },
    removeRepo(state, action: PayloadAction<string>) {
      state.repos = state.repos.filter((repo) => repo !== action.payload);
      if (state.activeRepo === action.payload) {
        state.activeRepo = state.repos[state.repos.length - 1] ?? "";
      }
    },
    setActiveRepo(state, action: PayloadAction<string>) {
      if (state.activeRepo !== action.payload) {
        state.activeRepo = action.payload;
      }
    },
    setRecentRepos(state, action: PayloadAction<string[]>) {
      state.recentRepos = action.payload;
    },
    setHistoryFilter(state, action: PayloadAction<string>) {
      if (state.historyFilter !== action.payload) {
        state.historyFilter = action.payload;
      }
    },
    setHistoryCommitId(state, action: PayloadAction<string>) {
      if (state.historyCommitId !== action.payload) {
        state.historyCommitId = action.payload;
      }
    },
    setHistoryNavTarget(state, action: PayloadAction<HistoryNavTarget>) {
      if (state.historyNavTarget !== action.payload) {
        state.historyNavTarget = action.payload;
      }
    },
    setFileBrowserMode(state, action: PayloadAction<FileBrowserMode>) {
      if (state.fileBrowserMode !== action.payload) {
        state.fileBrowserMode = action.payload;
      }
    },
    setCollapseStaged(state, action: PayloadAction<boolean>) {
      if (state.collapseStaged !== action.payload) {
        state.collapseStaged = action.payload;
      }
    },
    setCollapseUnstaged(state, action: PayloadAction<boolean>) {
      if (state.collapseUnstaged !== action.payload) {
        state.collapseUnstaged = action.payload;
      }
    },
    setChangesSidebarMode(state, action: PayloadAction<ChangesSidebarMode>) {
      if (state.changesSidebarMode !== action.payload) {
        state.changesSidebarMode = action.payload;
      }
    },
    setActiveBucket(state, action: PayloadAction<Bucket>) {
      if (state.activeBucket !== action.payload) {
        state.activeBucket = action.payload;
      }
    },
    setActivePath(state, action: PayloadAction<string>) {
      if (state.activePath !== action.payload) {
        state.activePath = action.payload;
      }
    },
    setDiffStyle(state, action: PayloadAction<DiffStyle>) {
      if (state.diffStyle !== action.payload) {
        state.diffStyle = action.payload;
      }
    },
    setCommitMessage(state, action: PayloadAction<string>) {
      if (state.commitMessage !== action.payload) {
        state.commitMessage = action.payload;
      }
    },
    setLastCommitId(state, action: PayloadAction<string>) {
      if (state.lastCommitId !== action.payload) {
        state.lastCommitId = action.payload;
      }
    },
    setRunningAction(state, action: PayloadAction<RunningAction>) {
      if (state.runningAction !== action.payload) {
        state.runningAction = action.payload;
      }
    },
    setError(state, action: PayloadAction<string>) {
      if (state.error !== action.payload) {
        state.error = action.payload;
      }
    },
    clearError(state) {
      if (state.error !== "") {
        state.error = "";
      }
    },
    resetRepoViewState(state) {
      state.historyFilter = "";
      state.historyCommitId = "";
      state.historyNavTarget = "commits";
      state.activeBucket = "unstaged";
      state.changesSidebarMode = "changes";
      state.activePath = "";
      state.repoTreeActivePath = "";
      state.commitMessage = "";
      state.lastCommitId = "";
      state.runningAction = "";
      state.error = "";
      state.selectedFiles = [];
      state.selectionAnchor = null;
      state.reviewBaseRef = "";
      state.reviewHeadRef = "";
      state.reviewActivePath = "";
      state.fileViewerTarget = null;
      state.symbolPeek = null;
    },
    clearDiffSelection(state) {
      if (state.activePath !== "") {
        state.activePath = "";
      }
      if (state.selectedFiles.length > 0) {
        state.selectedFiles = [];
      }
      if (state.selectionAnchor !== null) {
        state.selectionAnchor = null;
      }
    },
    clearHistorySelection(state) {
      if (state.historyCommitId !== "") {
        state.historyCommitId = "";
      }
      if (state.historyNavTarget !== "commits") {
        state.historyNavTarget = "commits";
      }
      if (state.activePath !== "") {
        state.activePath = "";
      }
      if (state.selectedFiles.length > 0) {
        state.selectedFiles = [];
      }
      if (state.selectionAnchor !== null) {
        state.selectionAnchor = null;
      }
    },
    setSelectedFiles(state, action: PayloadAction<SelectedFile[]>) {
      state.selectedFiles = action.payload;
    },
    setRepoTreeActivePath(state, action: PayloadAction<string>) {
      if (state.repoTreeActivePath !== action.payload) {
        state.repoTreeActivePath = action.payload;
      }
    },
    setSelectionAnchor(state, action: PayloadAction<SelectedFile | null>) {
      state.selectionAnchor = action.payload;
    },
    setReviewBaseRef(state, action: PayloadAction<string>) {
      if (state.reviewBaseRef !== action.payload) {
        state.reviewBaseRef = action.payload;
      }
    },
    setReviewHeadRef(state, action: PayloadAction<string>) {
      if (state.reviewHeadRef !== action.payload) {
        state.reviewHeadRef = action.payload;
      }
    },
    setReviewActivePath(state, action: PayloadAction<string>) {
      if (state.reviewActivePath !== action.payload) {
        state.reviewActivePath = action.payload;
      }
    },
    clearReviewSelection(state) {
      if (state.reviewActivePath !== "") {
        state.reviewActivePath = "";
      }
    },
    openFileViewer(state, action: PayloadAction<FileViewerTarget>) {
      state.changesSidebarMode = "files";
      state.repoTreeActivePath = action.payload.relPath;
      state.fileViewerTarget = action.payload;
      state.symbolPeek = null;
    },
    closeFileViewer(state) {
      if (state.fileViewerTarget !== null) {
        state.fileViewerTarget = null;
      }
    },
    openSymbolPeek(state, action: PayloadAction<SymbolPeekState>) {
      state.symbolPeek = action.payload;
    },
    closeSymbolPeek(state) {
      if (state.symbolPeek !== null) {
        state.symbolPeek = null;
      }
    },
    setSymbolPeekActiveIndex(state, action: PayloadAction<number>) {
      if (state.symbolPeek === null) {
        return;
      }

      const nextIndex = Math.max(0, Math.min(action.payload, state.symbolPeek.locations.length - 1));
      if (state.symbolPeek.activeIndex !== nextIndex) {
        state.symbolPeek.activeIndex = nextIndex;
      }
    },
    setSymbolPeekQuery(state, action: PayloadAction<string>) {
      if (state.symbolPeek === null) {
        return;
      }

      if (state.symbolPeek.query !== action.payload) {
        state.symbolPeek.query = action.payload;
      }
    },
  },
});

export const {
  addRepo,
  clearDiffSelection,
  clearError,
  closeFileViewer,
  clearHistorySelection,
  clearReviewSelection,
  hydrateWorkspaceSession,
  removeRepo,
  resetRepoViewState,
  setActiveBucket,
  setActivePath,
  setActiveRepo,
  setCommitMessage,
  setCollapseStaged,
  setCollapseUnstaged,
  setChangesSidebarMode,
  setDiffStyle,
  setFileBrowserMode,
  setError,
  setHistoryCommitId,
  setHistoryFilter,
  setHistoryNavTarget,
  setLastCommitId,
  setRecentRepos,
  setRepoTreeActivePath,
  setSelectedFiles,
  setSelectionAnchor,
  setRunningAction,
  setRepos,
  setReviewActivePath,
  setReviewBaseRef,
  setReviewHeadRef,
  openFileViewer,
  openSymbolPeek,
  closeSymbolPeek,
  setSymbolPeekActiveIndex,
  setSymbolPeekQuery,
} = sourceControlSlice.actions;

export const sourceControlReducer = sourceControlSlice.reducer;
