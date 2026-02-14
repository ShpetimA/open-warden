import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

import type { CommentItem } from '@/features/source-control/types'

type CommentsState = CommentItem[]

const initialState: CommentsState = []

const commentsSlice = createSlice({
  name: 'comments',
  initialState,
  reducers: {
    addComment(state, action: PayloadAction<CommentItem>) {
      state.push(action.payload)
    },
    removeComment(state, action: PayloadAction<string>) {
      return state.filter((comment) => comment.id !== action.payload)
    },
    updateComment(state, action: PayloadAction<{ id: string; text: string }>) {
      const target = state.find((comment) => comment.id === action.payload.id)
      if (target) {
        target.text = action.payload.text
      }
    },
  },
})

export const { addComment, removeComment, updateComment } = commentsSlice.actions
export const commentsReducer = commentsSlice.reducer
