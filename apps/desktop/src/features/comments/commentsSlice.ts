import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import type { CommentItem } from "@/features/source-control/types";

type CommentsState = CommentItem[];

const initialState: CommentsState = [];

const commentsSlice = createSlice({
  name: "comments",
  initialState,
  reducers: {
    restoreComments(state, action: PayloadAction<CommentItem[]>) {
      const existing = new Set(state.map((comment) => comment.id));
      state.push(...action.payload.filter((comment) => !existing.has(comment.id)));
    },
    addComment(state, action: PayloadAction<CommentItem>) {
      state.push(action.payload);
    },
    removeComment(state, action: PayloadAction<string>) {
      return state.filter((comment) => comment.id !== action.payload);
    },
    updateComment(state, action: PayloadAction<{ id: string; text: string }>) {
      const target = state.find((comment) => comment.id === action.payload.id);
      if (target) {
        target.text = action.payload.text;
      }
    },
    removeCommentsForRepo(state, action: PayloadAction<string>) {
      return state.filter((comment) => comment.repoPath !== action.payload);
    },
    removeCommentsByIds(state, action: PayloadAction<string[]>) {
      if (action.payload.length === 0) return state;
      const idSet = new Set(action.payload);
      return state.filter((comment) => !idSet.has(comment.id));
    },
    acknowledgePublishedComments(
      state,
      action: PayloadAction<ReadonlyArray<Pick<CommentItem, "id" | "text">>>,
    ) {
      const published = new Map(action.payload.map((comment) => [comment.id, comment.text]));

      return state.filter((comment) => published.get(comment.id) !== comment.text);
    },
  },
});

export const {
  restoreComments,
  addComment,
  acknowledgePublishedComments,
  removeComment,
  removeCommentsByIds,
  removeCommentsForRepo,
  updateComment,
} = commentsSlice.actions;
export const commentsReducer = commentsSlice.reducer;
