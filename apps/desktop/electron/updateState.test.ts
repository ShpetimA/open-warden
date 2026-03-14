import { describe, expect, test } from "vitest";

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

describe("updateState", () => {
  test("reports disabled reasons for unsupported runtimes", () => {
    expect(
      getAutoUpdateDisabledReason({
        isPackaged: false,
        platform: "win32",
        disableAutoUpdate: false,
        appImagePath: "",
      }),
    ).toContain("packaged production builds");

    expect(
      getAutoUpdateDisabledReason({
        isPackaged: true,
        platform: "darwin",
        disableAutoUpdate: false,
        appImagePath: "",
      }),
    ).toContain("macOS");

    expect(
      getAutoUpdateDisabledReason({
        isPackaged: true,
        platform: "linux",
        disableAutoUpdate: false,
        appImagePath: "",
      }),
    ).toContain("AppImage");
  });

  test("creates an enabled idle state", () => {
    expect(createInitialDesktopUpdateState("1.2.3", true, null)).toEqual({
      enabled: true,
      status: "idle",
      currentVersion: "1.2.3",
      availableVersion: null,
      downloadedVersion: null,
      checkedAt: null,
      downloadPercent: null,
      message: null,
      errorContext: null,
      canRetry: false,
      disabledReason: null,
    });
  });

  test("tracks the full update lifecycle", () => {
    const initial = createInitialDesktopUpdateState("1.2.3", true, null);
    const checking = markUpdateCheckStarted(initial, "2026-03-14T10:00:00.000Z");
    const available = markUpdateAvailable(checking, "1.2.4", "2026-03-14T10:00:01.000Z");
    const downloading = markUpdateDownloadStarted(available);
    const progress = markUpdateDownloadProgress(downloading, 54.9);
    const downloaded = markUpdateDownloaded(progress, "1.2.4");

    expect(checking.status).toBe("checking");
    expect(available.availableVersion).toBe("1.2.4");
    expect(progress.downloadPercent).toBe(54);
    expect(downloaded.status).toBe("downloaded");
    expect(downloaded.downloadPercent).toBe(100);
  });

  test("clears stale versions when no update is available", () => {
    const available = markUpdateAvailable(
      createInitialDesktopUpdateState("1.2.3", true, null),
      "1.2.4",
      "2026-03-14T10:00:01.000Z",
    );

    expect(markUpToDate(available, "2026-03-14T10:05:00.000Z")).toMatchObject({
      status: "up-to-date",
      availableVersion: null,
      downloadedVersion: null,
      canRetry: false,
    });
  });

  test("keeps retry state when a download fails", () => {
    const available = markUpdateAvailable(
      createInitialDesktopUpdateState("1.2.3", true, null),
      "1.2.4",
      "2026-03-14T10:00:01.000Z",
    );

    expect(
      markUpdateActionFailed(available, "network failed", "download", "2026-03-14T10:05:00.000Z"),
    ).toMatchObject({
      status: "error",
      errorContext: "download",
      canRetry: true,
      availableVersion: "1.2.4",
    });
  });
});
