import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

import type { Bucket, DiffStyle, HistoryNavTarget, RunningAction, SelectedFile } from './types'

type SourceControlState = {
  repos: string[]
  activeRepo: string
  historyFilter: string
  historyCommitId: string
  historyNavTarget: HistoryNavTarget
  collapseStaged: boolean
  collapseUnstaged: boolean
  activeBucket: Bucket
  activePath: string
  diffStyle: DiffStyle
  commitMessage: string
  lastCommitId: string
  runningAction: RunningAction
  error: string
  selectedFiles: SelectedFile[]
  selectionAnchor: SelectedFile | null
}

const initialState: SourceControlState = {
  repos: [],
  activeRepo: '',
  historyFilter: '',
  historyCommitId: '',
  historyNavTarget: 'commits',
  collapseStaged: false,
  collapseUnstaged: false,
  activeBucket: 'unstaged',
  activePath: '',
  diffStyle: 'split',
  commitMessage: '',
  lastCommitId: '',
  runningAction: '',
  error: '',
  selectedFiles: [],
  selectionAnchor: null,
}

const sourceControlSlice = createSlice({
  name: 'sourceControl',
  initialState,
  reducers: {
    setRepos(state, action: PayloadAction<string[]>) {
      state.repos = action.payload
    },
    addRepo(state, action: PayloadAction<string>) {
      if (!state.repos.includes(action.payload)) {
        state.repos.push(action.payload)
      }
    },
    removeRepo(state, action: PayloadAction<string>) {
      state.repos = state.repos.filter((repo) => repo !== action.payload)
      if (state.activeRepo === action.payload) {
        state.activeRepo = state.repos[state.repos.length - 1] ?? ''
      }
    },
    setActiveRepo(state, action: PayloadAction<string>) {
      if (state.activeRepo !== action.payload) {
        state.activeRepo = action.payload
      }
    },
    setHistoryFilter(state, action: PayloadAction<string>) {
      if (state.historyFilter !== action.payload) {
        state.historyFilter = action.payload
      }
    },
    setHistoryCommitId(state, action: PayloadAction<string>) {
      if (state.historyCommitId !== action.payload) {
        state.historyCommitId = action.payload
      }
    },
    setHistoryNavTarget(state, action: PayloadAction<HistoryNavTarget>) {
      if (state.historyNavTarget !== action.payload) {
        state.historyNavTarget = action.payload
      }
    },
    setCollapseStaged(state, action: PayloadAction<boolean>) {
      if (state.collapseStaged !== action.payload) {
        state.collapseStaged = action.payload
      }
    },
    setCollapseUnstaged(state, action: PayloadAction<boolean>) {
      if (state.collapseUnstaged !== action.payload) {
        state.collapseUnstaged = action.payload
      }
    },
    setActiveBucket(state, action: PayloadAction<Bucket>) {
      if (state.activeBucket !== action.payload) {
        state.activeBucket = action.payload
      }
    },
    setActivePath(state, action: PayloadAction<string>) {
      if (state.activePath !== action.payload) {
        state.activePath = action.payload
      }
    },
    setDiffStyle(state, action: PayloadAction<DiffStyle>) {
      if (state.diffStyle !== action.payload) {
        state.diffStyle = action.payload
      }
    },
    setCommitMessage(state, action: PayloadAction<string>) {
      if (state.commitMessage !== action.payload) {
        state.commitMessage = action.payload
      }
    },
    setLastCommitId(state, action: PayloadAction<string>) {
      if (state.lastCommitId !== action.payload) {
        state.lastCommitId = action.payload
      }
    },
    setRunningAction(state, action: PayloadAction<RunningAction>) {
      if (state.runningAction !== action.payload) {
        state.runningAction = action.payload
      }
    },
    setError(state, action: PayloadAction<string>) {
      if (state.error !== action.payload) {
        state.error = action.payload
      }
    },
    clearError(state) {
      if (state.error !== '') {
        state.error = ''
      }
    },
    clearDiffSelection(state) {
      if (state.activePath !== '') {
        state.activePath = ''
      }
      if (state.selectedFiles.length > 0) {
        state.selectedFiles = []
      }
      if (state.selectionAnchor !== null) {
        state.selectionAnchor = null
      }
    },
    clearHistorySelection(state) {
      if (state.historyCommitId !== '') {
        state.historyCommitId = ''
      }
      if (state.historyNavTarget !== 'commits') {
        state.historyNavTarget = 'commits'
      }
      if (state.activePath !== '') {
        state.activePath = ''
      }
      if (state.selectedFiles.length > 0) {
        state.selectedFiles = []
      }
      if (state.selectionAnchor !== null) {
        state.selectionAnchor = null
      }
    },
    setSelectedFiles(state, action: PayloadAction<SelectedFile[]>) {
      state.selectedFiles = action.payload
    },
    setSelectionAnchor(state, action: PayloadAction<SelectedFile | null>) {
      state.selectionAnchor = action.payload
    },
  },
})

export const {
  addRepo,
  clearDiffSelection,
  clearError,
  clearHistorySelection,
  removeRepo,
  setActiveBucket,
  setActivePath,
  setActiveRepo,
  setCommitMessage,
  setCollapseStaged,
  setCollapseUnstaged,
  setDiffStyle,
  setError,
  setHistoryCommitId,
  setHistoryFilter,
  setHistoryNavTarget,
  setLastCommitId,
  setSelectedFiles,
  setSelectionAnchor,
  setRunningAction,
  setRepos,
} = sourceControlSlice.actions

export const sourceControlReducer = sourceControlSlice.reducer
