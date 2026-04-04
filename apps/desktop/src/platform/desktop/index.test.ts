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
    loadWorkspaceSession: vi.fn().mockResolvedValue({
      openRepos: [],
      activeRepo: "",
      recentRepos: [],
    }),
    saveWorkspaceSession: vi.fn().mockResolvedValue({
      openRepos: [],
      activeRepo: "",
      recentRepos: [],
    }),
    confirm: vi.fn(),
    checkAppExists: vi.fn(),
    openPath: vi.fn(),
    getGitSnapshot: vi.fn(),
    getRepoFiles: vi.fn(),
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
    getRepoFile: vi.fn(),
    syncLspDocument: vi.fn(),
    closeLspDocument: vi.fn(),
    getLspHover: vi.fn(),
    getLspDefinition: vi.fn(),
    getLspReferences: vi.fn(),
    getUpdateState: vi.fn(),
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    installUpdate: vi.fn(),
    onUpdateState: vi.fn(() => () => {}),
    onLspDiagnostics: vi.fn(() => () => {}),
  };

  await expect(desktop.selectFolder()).resolves.toEqual("/tmp/repo");
  expect(selectFolder).toHaveBeenCalledTimes(1);

  await desktop.getLspHover({
    repoPath: "/tmp/repo",
    relPath: "src/app.ts",
    line: 5,
    character: 9,
  });
  expect(window.desktopBridge.getLspHover).toHaveBeenCalledWith({
    repoPath: "/tmp/repo",
    relPath: "src/app.ts",
    line: 5,
    character: 9,
  });

  await desktop.getRepoFile({
    repoPath: "/tmp/repo",
    relPath: "src/app.ts",
    revision: "HEAD",
  });
  expect(window.desktopBridge.getRepoFile).toHaveBeenCalledWith({
    repoPath: "/tmp/repo",
    relPath: "src/app.ts",
    revision: "HEAD",
  });

  await desktop.getLspDefinition({
    repoPath: "/tmp/repo",
    relPath: "src/app.ts",
    line: 5,
    character: 9,
  });
  expect(window.desktopBridge.getLspDefinition).toHaveBeenCalledWith({
    repoPath: "/tmp/repo",
    relPath: "src/app.ts",
    line: 5,
    character: 9,
  });

  await desktop.getLspReferences({
    repoPath: "/tmp/repo",
    relPath: "src/app.ts",
    line: 5,
    character: 9,
    includeDeclaration: false,
  });
  expect(window.desktopBridge.getLspReferences).toHaveBeenCalledWith({
    repoPath: "/tmp/repo",
    relPath: "src/app.ts",
    line: 5,
    character: 9,
    includeDeclaration: false,
  });

  await desktop.getRepoFiles("/tmp/repo");
  expect(window.desktopBridge.getRepoFiles).toHaveBeenCalledWith("/tmp/repo");
});
