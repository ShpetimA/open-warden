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

    const branches = await desktopBridge.getBranches("/tmp/repo");
    expect(branches).toEqual(["main"]);
    expect(invoke).toHaveBeenCalledWith("desktop:invoke", "getBranches", "/tmp/repo");

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

    const unsubscribe = desktopBridge.onUpdateState(() => {});
    expect(on).toHaveBeenCalledWith("desktop:update-state", expect.any(Function));

    unsubscribe();
    expect(removeListener).toHaveBeenCalledWith("desktop:update-state", expect.any(Function));

    const unsubscribeLsp = desktopBridge.onLspDiagnostics(() => {});
    expect(on).toHaveBeenCalledWith("desktop:lsp-diagnostics", expect.any(Function));

    unsubscribeLsp();
    expect(removeListener).toHaveBeenCalledWith("desktop:lsp-diagnostics", expect.any(Function));
  });
});
