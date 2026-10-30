import {
  type Action,
  type UnknownAction,
  combineReducers,
  configureStore,
  type ThunkAction,
} from "@reduxjs/toolkit";
import { setupListeners } from "@reduxjs/toolkit/query";

import { commentsClipboardReducer } from "@/features/comments/commentsClipboardSlice";
import { desktopUpdateReducer } from "@/features/desktop-update/desktopUpdateSlice";
import { hostedReposApi } from "@/features/hosted-repos/api";
import { hostedReadDeadlinesReducer } from "@/features/hosted-repos/readDeadlinesSlice";
import { lspReducer } from "@/features/lsp/lspSlice";
import { commentsReducer } from "@/features/comments/commentsSlice";
import { pullRequestsReducer } from "@/features/pull-requests/pullRequestsSlice";
import { settingsReducer } from "@/features/settings/settingsSlice";
import { gitApi } from "@/features/source-control/api";
import { sourceControlReducer } from "@/features/source-control/sourceControlSlice";
import { historyGraphUiReducer } from "@/features/source-control/historyGraphUiSlice";
import { fileEditorReducer } from "@/features/source-control/fileEditorSlice";
import { workspacesReducer } from "@/features/workspaces/workspacesSlice";

import { repositorySetupReducer } from "@/features/repository-setup/repositorySetupSlice";

import { reduceWorkspaceState } from "@/features/workspaces/workspaceState";

const combinedReducer = combineReducers({
  settings: settingsReducer,
  repositorySetup: repositorySetupReducer,
  desktopUpdate: desktopUpdateReducer,
  lsp: lspReducer,
  sourceControl: sourceControlReducer,
  historyGraphUi: historyGraphUiReducer,
  fileEditor: fileEditorReducer,
  workspaces: workspacesReducer,
  workspaceViews: (state: ReturnType<typeof reduceWorkspaceState>["workspaceViews"] = {}) => state,
  pullRequests: pullRequestsReducer,
  comments: commentsReducer,
  commentsClipboard: commentsClipboardReducer,
  [gitApi.reducerPath]: gitApi.reducer,
  [hostedReposApi.reducerPath]: hostedReposApi.reducer,
  hostedReadDeadlines: hostedReadDeadlinesReducer,
});

export function rootReducer(
  state: ReturnType<typeof combinedReducer> | undefined,
  action: UnknownAction,
) {
  return { ...combinedReducer(state, action), ...reduceWorkspaceState(state, action) };
}

export const store = configureStore({
  reducer: rootReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(gitApi.middleware, hostedReposApi.middleware),
});

setupListeners(store.dispatch);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
export type AppThunk<ReturnType = void> = ThunkAction<ReturnType, RootState, unknown, Action>;
