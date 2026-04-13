import { watch } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";

import { app } from "electron";

import type { AppSettings } from "../src/platform/desktop/contracts";
import { createAppSettings } from "../src/platform/desktop/appSettings";

const APP_SETTINGS_FILE_NAME = "settings.json";

function resolveAppSettingsPath() {
  return path.join(app.getPath("userData"), APP_SETTINGS_FILE_NAME);
}

function isMissingFileError(error: unknown): boolean {
  return (
    error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

async function readStoredAppSettings(): Promise<AppSettings> {
  const rawSettings = await fs.readFile(resolveAppSettingsPath(), "utf8");
  return createAppSettings(JSON.parse(rawSettings));
}

export async function loadAppSettings(): Promise<AppSettings> {
  try {
    return await readStoredAppSettings();
  } catch (error) {
    if (isMissingFileError(error) || error instanceof SyntaxError) {
      return createAppSettings();
    }

    throw error;
  }
}

export async function saveAppSettings(settings: AppSettings): Promise<AppSettings> {
  const normalizedSettings = createAppSettings(settings);
  const settingsPath = resolveAppSettingsPath();

  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(settingsPath, JSON.stringify(normalizedSettings, null, 2), "utf8");

  return normalizedSettings;
}

export async function getAppSettingsPath(): Promise<string> {
  const settingsPath = resolveAppSettingsPath();
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  return settingsPath;
}

export async function watchAppSettings(options: {
  onChange(settings: AppSettings): void;
  onError?(error: unknown): void;
}): Promise<() => void> {
  const settingsPath = await getAppSettingsPath();
  const settingsDirectory = path.dirname(settingsPath);
  const settingsFileName = path.basename(settingsPath);
  let disposed = false;
  let reloadTimer: ReturnType<typeof setTimeout> | null = null;

  const scheduleReload = () => {
    if (reloadTimer !== null) {
      clearTimeout(reloadTimer);
    }

    reloadTimer = setTimeout(() => {
      void (async () => {
        try {
          const settings = await readStoredAppSettings();
          if (!disposed) {
            options.onChange(settings);
          }
        } catch (error) {
          if (isMissingFileError(error)) {
            if (!disposed) {
              options.onChange(createAppSettings());
            }
            return;
          }

          if (error instanceof SyntaxError) {
            return;
          }

          options.onError?.(error);
        }
      })();
    }, 50);
  };

  await fs.mkdir(settingsDirectory, { recursive: true });

  const watcher = watch(settingsDirectory, (_eventType, fileName) => {
    if (fileName && fileName !== settingsFileName) {
      return;
    }

    scheduleReload();
  });

  return () => {
    disposed = true;
    if (reloadTimer !== null) {
      clearTimeout(reloadTimer);
      reloadTimer = null;
    }
    watcher.close();
  };
}
