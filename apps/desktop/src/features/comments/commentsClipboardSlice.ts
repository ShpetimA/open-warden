import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

type CommentsClipboardState = {
  lastCopiedPayload: string;
};

const initialState: CommentsClipboardState = {
  lastCopiedPayload: "",
};

const commentsClipboardSlice = createSlice({
  name: "commentsClipboard",
  initialState,
  reducers: {
    setLastCopiedPayload(state, action: PayloadAction<string>) {
      state.lastCopiedPayload = action.payload;
    },
    clearLastCopiedPayload(state) {
      state.lastCopiedPayload = "";
    },
  },
});

export const { setLastCopiedPayload, clearLastCopiedPayload } = commentsClipboardSlice.actions;
export const commentsClipboardReducer = commentsClipboardSlice.reducer;
