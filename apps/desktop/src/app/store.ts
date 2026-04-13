import { type Action, configureStore, type ThunkAction } from "@reduxjs/toolkit";
import { setupListeners } from "@reduxjs/toolkit/query";

import { commentsClipboardReducer } from "@/features/comments/commentsClipboardSlice";
import { desktopUpdateReducer } from "@/features/desktop-update/desktopUpdateSlice";
import { hostedReposApi } from "@/features/hosted-repos/api";
import { lspReducer } from "@/features/lsp/lspSlice";
import { commentsReducer } from "@/features/comments/commentsSlice";
import { pullRequestsReducer } from "@/features/pull-requests/pullRequestsSlice";
import { settingsReducer } from "@/features/settings/settingsSlice";
import { gitApi } from "@/features/source-control/api";
import { sourceControlReducer } from "@/features/source-control/sourceControlSlice";

export const store = configureStore({
  reducer: {
    settings: settingsReducer,
    desktopUpdate: desktopUpdateReducer,
    lsp: lspReducer,
    sourceControl: sourceControlReducer,
    pullRequests: pullRequestsReducer,
    comments: commentsReducer,
    commentsClipboard: commentsClipboardReducer,
    [gitApi.reducerPath]: gitApi.reducer,
    [hostedReposApi.reducerPath]: hostedReposApi.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(gitApi.middleware, hostedReposApi.middleware),
});

setupListeners(store.dispatch);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
export type AppThunk<ReturnType = void> = ThunkAction<ReturnType, RootState, unknown, Action>;
