import { afterEach, expect, test, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

test("desktop API resolves Electron runtime lazily after import", async () => {
  vi.stubEnv("DEV", "true");
  vi.stubEnv("VITE_DESKTOP_FALLBACK", "");
  vi.stubGlobal("window", {});

  const { desktop } = await import("./index");

  const selectFolder = vi.fn().mockResolvedValue("/tmp/repo");
  window.desktopBridge = {
    selectFolder,
    confirm: vi.fn(),
    checkAppExists: vi.fn(),
    openPath: vi.fn(),
    getGitSnapshot: vi.fn(),
    getCommitHistory: vi.fn(),
    getBranches: vi.fn(),
    getBranchFiles: vi.fn(),
    getCommitFiles: vi.fn(),
    getCommitFileVersions: vi.fn(),
    getFileVersions: vi.fn(),
    getBranchFileVersions: vi.fn(),
    stageFile: vi.fn(),
    unstageFile: vi.fn(),
    stageAll: vi.fn(),
    unstageAll: vi.fn(),
    discardFile: vi.fn(),
    discardFiles: vi.fn(),
    discardAll: vi.fn(),
    commitStaged: vi.fn(),
  };

  await expect(desktop.selectFolder()).resolves.toEqual("/tmp/repo");
  expect(selectFolder).toHaveBeenCalledTimes(1);
});
