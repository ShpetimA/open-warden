import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import { createAppSettings } from "@/platform/desktop/appSettings";
import type { AppSettings, FileTreeRenderMode } from "@/platform/desktop";

type SettingsState = {
  appSettings: AppSettings;
  error: string;
};

const initialState: SettingsState = {
  appSettings: createAppSettings(),
  error: "",
};

const settingsSlice = createSlice({
  name: "settings",
  initialState,
  reducers: {
    hydrateAppSettings(state, action: PayloadAction<AppSettings>) {
      state.appSettings = action.payload;
      state.error = "";
    },
    setFileTreeRenderMode(state, action: PayloadAction<FileTreeRenderMode>) {
      state.appSettings.sourceControl.fileTreeRenderMode = action.payload;
    },
    setSettingsError(state, action: PayloadAction<string>) {
      state.error = action.payload;
    },
    clearSettingsError(state) {
      if (state.error !== "") {
        state.error = "";
      }
    },
  },
});

export const { clearSettingsError, hydrateAppSettings, setFileTreeRenderMode, setSettingsError } =
  settingsSlice.actions;

export const settingsReducer = settingsSlice.reducer;
