import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

import type { Bucket, DiffStyle, HistoryNavTarget, RunningAction, ViewMode } from './types'

type SourceControlState = {
  repos: string[]
  activeRepo: string
  viewMode: ViewMode
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
}

const initialState: SourceControlState = {
  repos: [],
  activeRepo: '',
  viewMode: 'changes',
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
    setActiveRepo(state, action: PayloadAction<string>) {
      if (state.activeRepo !== action.payload) {
        state.activeRepo = action.payload
      }
    },
    setViewMode(state, action: PayloadAction<ViewMode>) {
      if (state.viewMode !== action.payload) {
        state.viewMode = action.payload
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
    },
  },
})

export const {
  addRepo,
  clearDiffSelection,
  clearError,
  clearHistorySelection,
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
  setRunningAction,
  setRepos,
  setViewMode,
} = sourceControlSlice.actions

export const sourceControlReducer = sourceControlSlice.reducer
