import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import { GRAPH_VISIBLE_LANES } from "./historyGraphViewport";

const slice = createSlice({
  name: "historyGraphUi",
  initialState: { commitId: "", laneStart: 0 },
  reducers: {
    selectGraphCommit(
      state,
      { payload }: PayloadAction<{ commitId: string; column: number; totalLanes: number }>,
    ) {
      state.commitId = payload.commitId;
      if (payload.column < state.laneStart) state.laneStart = payload.column;
      if (payload.column >= state.laneStart + GRAPH_VISIBLE_LANES) {
        state.laneStart = payload.column - GRAPH_VISIBLE_LANES + 1;
      }
      state.laneStart = Math.min(
        state.laneStart,
        Math.max(0, payload.totalLanes - GRAPH_VISIBLE_LANES),
      );
    },
    panGraphLanes(state, { payload }: PayloadAction<{ direction: -1 | 1; totalLanes: number }>) {
      state.laneStart = Math.max(
        0,
        Math.min(
          payload.totalLanes - GRAPH_VISIBLE_LANES,
          state.laneStart + payload.direction * (GRAPH_VISIBLE_LANES - 2),
        ),
      );
    },
  },
});

export const { selectGraphCommit, panGraphLanes } = slice.actions;
export const historyGraphUiReducer = slice.reducer;
