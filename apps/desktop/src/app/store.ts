import { type Action, configureStore, type ThunkAction } from '@reduxjs/toolkit'

import { commentsReducer } from '@/features/comments/commentsSlice'
import { gitApi } from '@/features/source-control/api'
import { sourceControlReducer } from '@/features/source-control/sourceControlSlice'

export const store = configureStore({
  reducer: {
    sourceControl: sourceControlReducer,
    comments: commentsReducer,
    [gitApi.reducerPath]: gitApi.reducer,
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(gitApi.middleware),
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
export type AppThunk<ReturnType = void> = ThunkAction<ReturnType, RootState, unknown, Action>
