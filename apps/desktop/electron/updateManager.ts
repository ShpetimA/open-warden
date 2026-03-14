import { app, type BrowserWindow } from "electron";
import { autoUpdater } from "electron-updater";

import type {
  DesktopUpdateActionResult,
  DesktopUpdateState,
} from "../src/platform/desktop/contracts";
import { UPDATE_STATE_CHANNEL } from "./ipc-channels";
import {
  createInitialDesktopUpdateState,
  getAutoUpdateDisabledReason,
  markUpToDate,
  markUpdateActionFailed,
  markUpdateAvailable,
  markUpdateCheckStarted,
  markUpdateDownloadProgress,
  markUpdateDownloadStarted,
  markUpdateDownloaded,
} from "./updateState";

const AUTO_UPDATE_STARTUP_DELAY_MS = 15_000;
const AUTO_UPDATE_POLL_INTERVAL_MS = 4 * 60 * 60 * 1000;

type UpdateManagerOptions = {
  getWindow: () => BrowserWindow | null;
};

type UpdateCheckReason = "manual" | "startup" | "poll";

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function parseRepositorySlug(rawValue: string): { owner: string; repo: string } | null {
  const [owner, repo, ...rest] = rawValue.trim().split("/");
  if (!owner || !repo || rest.length > 0) {
    return null;
  }

  return {
    owner,
    repo,
  };
}

export function createUpdateManager({ getWindow }: UpdateManagerOptions) {
  let initialized = false;
  let checkInFlight = false;
  let downloadInFlight = false;
  let startupTimer: ReturnType<typeof setTimeout> | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let state: DesktopUpdateState = createInitialDesktopUpdateState("0.0.0", false, null);

  function broadcastState() {
    const window = getWindow();
    if (!window || window.isDestroyed()) {
      return;
    }

    window.webContents.send(UPDATE_STATE_CHANNEL, state);
  }

  function setState(nextState: DesktopUpdateState) {
    state = nextState;
    broadcastState();
  }

  function createActionResult(
    accepted: boolean,
    completed: boolean,
  ): DesktopUpdateActionResult {
    return {
      accepted,
      completed,
      state,
    };
  }

  function clearTimers() {
    if (startupTimer) {
      clearTimeout(startupTimer);
      startupTimer = null;
    }

    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function applyFeedOverride() {
    const rawRepository =
      process.env.OPEN_WARDEN_UPDATE_REPOSITORY?.trim() ||
      process.env.GITHUB_REPOSITORY?.trim() ||
      "";
    const repository = rawRepository ? parseRepositorySlug(rawRepository) : null;

    if (!repository) {
      return;
    }

    autoUpdater.setFeedURL({
      provider: "github",
      owner: repository.owner,
      repo: repository.repo,
      releaseType: "release",
    });
  }

  function scheduleBackgroundChecks() {
    clearTimers();

    startupTimer = setTimeout(() => {
      startupTimer = null;
      void checkForUpdates("startup");
    }, AUTO_UPDATE_STARTUP_DELAY_MS);
    startupTimer.unref();

    pollTimer = setInterval(() => {
      void checkForUpdates("poll");
    }, AUTO_UPDATE_POLL_INTERVAL_MS);
    pollTimer.unref();
  }

  function configureAutoUpdater() {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.allowPrerelease = false;
    autoUpdater.allowDowngrade = false;

    autoUpdater.on("update-available", (info) => {
      setState(markUpdateAvailable(state, info.version, new Date().toISOString()));
    });

    autoUpdater.on("update-not-available", () => {
      setState(markUpToDate(state, new Date().toISOString()));
    });

    autoUpdater.on("download-progress", (progress) => {
      setState(markUpdateDownloadProgress(state, progress.percent));
    });

    autoUpdater.on("update-downloaded", (info) => {
      setState(markUpdateDownloaded(state, info.version));
    });

    autoUpdater.on("error", (error) => {
      if (checkInFlight || downloadInFlight) {
        return;
      }

      const checkedAt = new Date().toISOString();
      const errorContext = state.downloadedVersion ? "install" : state.availableVersion ? "download" : "check";
      setState(markUpdateActionFailed(state, formatError(error), errorContext, checkedAt));
    });
  }

  async function checkForUpdates(
    reason: UpdateCheckReason,
  ): Promise<DesktopUpdateActionResult> {
    if (!state.enabled || checkInFlight || downloadInFlight || state.status === "downloaded") {
      return createActionResult(false, false);
    }

    checkInFlight = true;
    const checkedAt = new Date().toISOString();
    setState(markUpdateCheckStarted(state, checkedAt));

    try {
      await autoUpdater.checkForUpdates();
      return createActionResult(true, true);
    } catch (error) {
      setState(markUpdateActionFailed(state, formatError(error), "check", checkedAt));
      return createActionResult(reason === "manual", false);
    } finally {
      checkInFlight = false;
    }
  }

  async function downloadUpdate(): Promise<DesktopUpdateActionResult> {
    if (!state.enabled || downloadInFlight || state.status !== "available") {
      return createActionResult(false, false);
    }

    downloadInFlight = true;
    setState(markUpdateDownloadStarted(state));

    try {
      await autoUpdater.downloadUpdate();
      return createActionResult(true, true);
    } catch (error) {
      setState(
        markUpdateActionFailed(state, formatError(error), "download", new Date().toISOString()),
      );
      return createActionResult(true, false);
    } finally {
      downloadInFlight = false;
    }
  }

  async function installUpdate(): Promise<DesktopUpdateActionResult> {
    if (!state.enabled || state.status !== "downloaded") {
      return createActionResult(false, false);
    }

    try {
      autoUpdater.quitAndInstall();
      return createActionResult(true, true);
    } catch (error) {
      setState(
        markUpdateActionFailed(state, formatError(error), "install", new Date().toISOString()),
      );
      return createActionResult(true, false);
    }
  }

  return {
    initialize() {
      if (initialized) {
        return;
      }

      initialized = true;

      const disabledReason = getAutoUpdateDisabledReason({
        isPackaged: app.isPackaged,
        platform: process.platform,
        disableAutoUpdate: process.env.OPEN_WARDEN_DISABLE_AUTO_UPDATE === "1",
        appImagePath: process.env.APPIMAGE ?? "",
      });

      setState(createInitialDesktopUpdateState(app.getVersion(), !disabledReason, disabledReason));

      if (disabledReason) {
        return;
      }

      applyFeedOverride();
      configureAutoUpdater();
      scheduleBackgroundChecks();
    },
    dispose() {
      clearTimers();
    },
    getState() {
      return state;
    },
    checkForUpdates,
    downloadUpdate,
    installUpdate,
  };
}
