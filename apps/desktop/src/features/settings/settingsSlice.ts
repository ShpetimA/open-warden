import type { DesktopFailure } from "@/platform/desktop/failure";
import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import { createAppSettings } from "@/platform/desktop/appSettings";
import type { AppSettings, FileTreeRenderMode } from "@/platform/desktop";

type SettingsState = {
  appSettings: AppSettings;
  error: DesktopFailure | null;
};

const initialState: SettingsState = {
  appSettings: createAppSettings(),
  error: null,
};

const settingsSlice = createSlice({
  name: "settings",
  initialState,
  reducers: {
    hydrateAppSettings(state, action: PayloadAction<AppSettings>) {
      state.appSettings = action.payload;
      state.error = null;
    },
    setFileTreeRenderMode(state, action: PayloadAction<FileTreeRenderMode>) {
      state.appSettings.sourceControl.fileTreeRenderMode = action.payload;
    },
    setSettingsError(state, action: PayloadAction<DesktopFailure>) {
      state.error = action.payload;
    },
    clearSettingsError(state) {
      if (state.error !== null) {
        state.error = null;
      }
    },
  },
});

export const { clearSettingsError, hydrateAppSettings, setFileTreeRenderMode, setSettingsError } =
  settingsSlice.actions;

export const settingsReducer = settingsSlice.reducer;
