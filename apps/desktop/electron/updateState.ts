import type {
  DesktopUpdateErrorContext,
  DesktopUpdateState,
} from "../src/platform/desktop/contracts";

type AutoUpdateAvailabilityInput = {
  isPackaged: boolean;
  platform: NodeJS.Platform;
  disableAutoUpdate: boolean;
  appImagePath: string;
};

function createBaseState(currentVersion: string): DesktopUpdateState {
  return {
    enabled: false,
    status: "disabled",
    currentVersion,
    availableVersion: null,
    downloadedVersion: null,
    checkedAt: null,
    downloadPercent: null,
    message: null,
    errorContext: null,
    canRetry: false,
    disabledReason: null,
  };
}

function clampPercent(percent: number): number {
  if (!Number.isFinite(percent)) {
    return 0;
  }

  if (percent < 0) {
    return 0;
  }

  if (percent > 100) {
    return 100;
  }

  return Math.floor(percent);
}

export function getAutoUpdateDisabledReason({
  isPackaged,
  platform,
  disableAutoUpdate,
  appImagePath,
}: AutoUpdateAvailabilityInput): string | null {
  if (disableAutoUpdate) {
    return "Automatic updates are disabled by OPEN_WARDEN_DISABLE_AUTO_UPDATE.";
  }

  if (!isPackaged) {
    return "Automatic updates are only available in packaged production builds.";
  }

  if (platform === "darwin") {
    return "Automatic updates are disabled on macOS until signed builds are available.";
  }

  if (platform === "linux" && appImagePath.trim().length === 0) {
    return "Automatic updates on Linux require running the AppImage build.";
  }

  return null;
}

export function createInitialDesktopUpdateState(
  currentVersion: string,
  enabled: boolean,
  disabledReason: string | null,
): DesktopUpdateState {
  const state = createBaseState(currentVersion);

  if (!enabled) {
    return {
      ...state,
      disabledReason,
    };
  }

  return {
    ...state,
    enabled: true,
    status: "idle",
  };
}

export function markUpdateCheckStarted(
  state: DesktopUpdateState,
  checkedAt: string,
): DesktopUpdateState {
  return {
    ...state,
    status: "checking",
    checkedAt,
    message: null,
    errorContext: null,
    canRetry: false,
    downloadPercent: null,
  };
}

export function markUpdateAvailable(
  state: DesktopUpdateState,
  version: string,
  checkedAt: string,
): DesktopUpdateState {
  return {
    ...state,
    status: "available",
    checkedAt,
    availableVersion: version,
    downloadedVersion: null,
    downloadPercent: null,
    message: null,
    errorContext: null,
    canRetry: false,
  };
}

export function markUpToDate(state: DesktopUpdateState, checkedAt: string): DesktopUpdateState {
  return {
    ...state,
    status: "up-to-date",
    checkedAt,
    availableVersion: null,
    downloadedVersion: null,
    downloadPercent: null,
    message: null,
    errorContext: null,
    canRetry: false,
  };
}

export function markUpdateDownloadStarted(state: DesktopUpdateState): DesktopUpdateState {
  return {
    ...state,
    status: "downloading",
    downloadPercent: 0,
    message: null,
    errorContext: null,
    canRetry: false,
  };
}

export function markUpdateDownloadProgress(
  state: DesktopUpdateState,
  percent: number,
): DesktopUpdateState {
  return {
    ...state,
    status: "downloading",
    downloadPercent: clampPercent(percent),
    message: null,
    errorContext: null,
    canRetry: false,
  };
}

export function markUpdateDownloaded(
  state: DesktopUpdateState,
  version: string,
): DesktopUpdateState {
  return {
    ...state,
    status: "downloaded",
    availableVersion: version,
    downloadedVersion: version,
    downloadPercent: 100,
    message: null,
    errorContext: null,
    canRetry: false,
  };
}

export function markUpdateActionFailed(
  state: DesktopUpdateState,
  message: string,
  errorContext: Exclude<DesktopUpdateErrorContext, null>,
  checkedAt: string,
): DesktopUpdateState {
  const canRetry =
    errorContext === "install"
      ? state.downloadedVersion !== null
      : errorContext === "download"
        ? state.availableVersion !== null
        : true;

  return {
    ...state,
    status: "error",
    checkedAt,
    message,
    errorContext,
    canRetry,
  };
}
