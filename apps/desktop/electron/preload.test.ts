import { beforeEach, describe, expect, test, vi } from "vitest";

const exposeInMainWorld = vi.fn();
const invoke = vi.fn();
const on = vi.fn();
const removeListener = vi.fn();

vi.mock("electron", () => ({
  contextBridge: {
    exposeInMainWorld,
  },
  ipcRenderer: {
    invoke,
    on,
    removeListener,
  },
}));

describe("electron preload bridge", () => {
  beforeEach(() => {
    exposeInMainWorld.mockReset();
    invoke.mockReset();
    on.mockReset();
    removeListener.mockReset();
    vi.resetModules();
  });

  test("exposes the desktop API through window.openWarden", async () => {
    invoke.mockResolvedValueOnce({
      openRepos: ["/tmp/repo"],
      activeRepo: "/tmp/repo",
      recentRepos: ["/tmp/repo"],
    });
    invoke.mockResolvedValueOnce({
      version: 1,
      sourceControl: {
        fileTreeRenderMode: "tree",
      },
    });
    invoke.mockResolvedValueOnce(["main"]);

    await import("./preload");

    expect(exposeInMainWorld).toHaveBeenCalledTimes(2);

    const desktopBridgeCall = exposeInMainWorld.mock.calls.find(
      ([name]) => name === "desktopBridge",
    );
    const openWardenCall = exposeInMainWorld.mock.calls.find(([name]) => name === "openWarden");

    expect(desktopBridgeCall).toBeTruthy();
    expect(openWardenCall).toBeTruthy();

    const [, desktopBridge] = desktopBridgeCall ?? [];
    const [, openWarden] = openWardenCall ?? [];
    expect(desktopBridge).toBeTypeOf("object");
    expect(openWarden).toBeTypeOf("object");
    expect(openWarden).toBe(desktopBridge);

    const workspaceSession = await desktopBridge.loadWorkspaceSession();
    expect(workspaceSession.activeRepo).toBe("/tmp/repo");
    expect(invoke).toHaveBeenCalledWith("desktop:invoke", "loadWorkspaceSession");

    const appSettings = await desktopBridge.loadAppSettings();
    expect(appSettings.sourceControl.fileTreeRenderMode).toBe("tree");
    expect(invoke).toHaveBeenCalledWith("desktop:invoke", "loadAppSettings");

    const branches = await desktopBridge.getBranches("/tmp/repo");
    expect(branches).toEqual(["main"]);
    expect(invoke).toHaveBeenCalledWith("desktop:invoke", "getBranches", "/tmp/repo");

    await desktopBridge.getRepoFiles("/tmp/repo");
    expect(invoke).toHaveBeenCalledWith("desktop:invoke", "getRepoFiles", "/tmp/repo");

    await desktopBridge.getLspHover({
      repoPath: "/tmp/repo",
      relPath: "src/main.ts",
      line: 3,
      character: 7,
    });
    expect(invoke).toHaveBeenCalledWith("desktop:invoke", "getLspHover", {
      repoPath: "/tmp/repo",
      relPath: "src/main.ts",
      line: 3,
      character: 7,
    });

    await desktopBridge.getLspDefinition({
      repoPath: "/tmp/repo",
      relPath: "src/main.ts",
      line: 3,
      character: 7,
    });
    expect(invoke).toHaveBeenCalledWith("desktop:invoke", "getLspDefinition", {
      repoPath: "/tmp/repo",
      relPath: "src/main.ts",
      line: 3,
      character: 7,
    });

    await desktopBridge.getLspReferences({
      repoPath: "/tmp/repo",
      relPath: "src/main.ts",
      line: 3,
      character: 7,
      includeDeclaration: false,
    });
    expect(invoke).toHaveBeenCalledWith("desktop:invoke", "getLspReferences", {
      repoPath: "/tmp/repo",
      relPath: "src/main.ts",
      line: 3,
      character: 7,
      includeDeclaration: false,
    });

    await desktopBridge.getRepoFile({
      repoPath: "/tmp/repo",
      relPath: "src/main.ts",
      revision: "HEAD",
    });
    expect(invoke).toHaveBeenCalledWith("desktop:invoke", "getRepoFile", {
      repoPath: "/tmp/repo",
      relPath: "src/main.ts",
      revision: "HEAD",
    });

    const unsubscribe = desktopBridge.onUpdateState(() => {});
    expect(on).toHaveBeenCalledWith("desktop:update-state", expect.any(Function));

    unsubscribe();
    expect(removeListener).toHaveBeenCalledWith("desktop:update-state", expect.any(Function));

    const unsubscribeLsp = desktopBridge.onLspDiagnostics(() => {});
    expect(on).toHaveBeenCalledWith("desktop:lsp-diagnostics", expect.any(Function));

    unsubscribeLsp();
    expect(removeListener).toHaveBeenCalledWith("desktop:lsp-diagnostics", expect.any(Function));

    const unsubscribeSettings = desktopBridge.onAppSettingsChanged(() => {});
    expect(on).toHaveBeenCalledWith("desktop:app-settings-changed", expect.any(Function));

    unsubscribeSettings();
    expect(removeListener).toHaveBeenCalledWith(
      "desktop:app-settings-changed",
      expect.any(Function),
    );
  });
});
