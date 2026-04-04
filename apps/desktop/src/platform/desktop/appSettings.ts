import type { AppSettings, FileTreeRenderMode } from "./contracts";

export const DEFAULT_APP_SETTINGS: AppSettings = {
  version: 1,
  sourceControl: {
    fileTreeRenderMode: "tree",
  },
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function resolveFileTreeRenderMode(value: unknown): FileTreeRenderMode {
  return value === "list" ? "list" : "tree";
}

export function createAppSettings(settings?: unknown): AppSettings {
  if (!isObject(settings)) {
    return DEFAULT_APP_SETTINGS;
  }

  const sourceControl = isObject(settings.sourceControl) ? settings.sourceControl : {};

  return {
    version: 1,
    sourceControl: {
      fileTreeRenderMode: resolveFileTreeRenderMode(sourceControl.fileTreeRenderMode),
    },
  };
}
