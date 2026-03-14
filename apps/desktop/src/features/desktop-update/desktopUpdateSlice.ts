import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import type { DesktopUpdateState } from "@/platform/desktop";

export type DesktopUpdateStoreState = DesktopUpdateState & {
  hydrated: boolean;
};

const initialState: DesktopUpdateStoreState = {
  hydrated: false,
  enabled: false,
  status: "disabled",
  currentVersion: "0.0.0",
  availableVersion: null,
  downloadedVersion: null,
  checkedAt: null,
  downloadPercent: null,
  message: null,
  errorContext: null,
  canRetry: false,
  disabledReason: "Automatic updates are unavailable right now.",
};

const desktopUpdateSlice = createSlice({
  name: "desktopUpdate",
  initialState,
  reducers: {
    desktopUpdateStateReceived(_state, action: PayloadAction<DesktopUpdateState>) {
      return {
        hydrated: true,
        ...action.payload,
      };
    },
  },
});

export const { desktopUpdateStateReceived } = desktopUpdateSlice.actions;
export const desktopUpdateReducer = desktopUpdateSlice.reducer;
