import type { AppThunk, RootState } from "@/app/store";
import { desktop } from "@/platform/desktop";
import { createAppSettings } from "@/platform/desktop/appSettings";
import type { FileTreeRenderMode } from "@/platform/desktop";

import {
  clearSettingsError,
  hydrateAppSettings,
  setFileTreeRenderMode,
  setSettingsError,
} from "./settingsSlice";

function buildUpdatedSettings(state: RootState, mode: FileTreeRenderMode) {
  return createAppSettings({
    ...state.settings.appSettings,
    sourceControl: {
      ...state.settings.appSettings.sourceControl,
      fileTreeRenderMode: mode,
    },
  });
}

export const restoreAppSettings = (): AppThunk<Promise<void>> => async (dispatch) => {
  try {
    const settings = await desktop.loadAppSettings();
    dispatch(hydrateAppSettings(settings));
  } catch (error) {
    dispatch(hydrateAppSettings(createAppSettings()));
    dispatch(setSettingsError(error instanceof Error ? error.message : String(error)));
  }
};

export const updateFileTreeRenderMode =
  (mode: FileTreeRenderMode): AppThunk<Promise<void>> =>
  async (dispatch, getState) => {
    const previousSettings = getState().settings.appSettings;
    const nextSettings = buildUpdatedSettings(getState(), mode);

    dispatch(setFileTreeRenderMode(mode));
    dispatch(clearSettingsError());

    try {
      const savedSettings = await desktop.saveAppSettings(nextSettings);
      dispatch(hydrateAppSettings(savedSettings));
    } catch (error) {
      dispatch(hydrateAppSettings(previousSettings));
      dispatch(setSettingsError(error instanceof Error ? error.message : String(error)));
      throw error;
    }
  };
