import { type Action, configureStore, type ThunkAction } from "@reduxjs/toolkit";
import { setupListeners } from "@reduxjs/toolkit/query";

import { desktopUpdateReducer } from "@/features/desktop-update/desktopUpdateSlice";
import { commentsReducer } from "@/features/comments/commentsSlice";
import { gitApi } from "@/features/source-control/api";
import { sourceControlReducer } from "@/features/source-control/sourceControlSlice";

export const store = configureStore({
  reducer: {
    desktopUpdate: desktopUpdateReducer,
    sourceControl: sourceControlReducer,
    comments: commentsReducer,
    [gitApi.reducerPath]: gitApi.reducer,
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(gitApi.middleware),
});

setupListeners(store.dispatch);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
export type AppThunk<ReturnType = void> = ThunkAction<ReturnType, RootState, unknown, Action>;
