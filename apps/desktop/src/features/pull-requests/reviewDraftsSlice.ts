import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import type { ReviewDraft } from "@/platform/desktop/reviewDrafts";

type ReviewTarget = Pick<ReviewDraft, "repoPath" | "pullRequestNumber">;

function matches(draft: ReviewTarget, target: ReviewTarget) {
  return draft.repoPath === target.repoPath && draft.pullRequestNumber === target.pullRequestNumber;
}

const initialState: ReviewDraft[] = [];

const reviewDraftsSlice = createSlice({
  name: "reviewDrafts",
  initialState,
  reducers: {
    reviewDraftsRestored: (_state, action: PayloadAction<ReviewDraft[]>) => action.payload,
    reviewDraftSaved(state, action: PayloadAction<ReviewDraft>) {
      const index = state.findIndex((draft) => matches(draft, action.payload));

      if (index < 0) state.push(action.payload);
      else state[index] = action.payload;
    },
    reviewDraftRemoved: (state, action: PayloadAction<ReviewTarget>) =>
      state.filter((draft) => !matches(draft, action.payload)),
  },
});

export const { reviewDraftsRestored, reviewDraftSaved, reviewDraftRemoved } =
  reviewDraftsSlice.actions;
export const reviewDraftsReducer = reviewDraftsSlice.reducer;
