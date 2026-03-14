import { beforeEach, describe, expect, test, vi } from "vitest";

const exposeInMainWorld = vi.fn();
const invoke = vi.fn();

vi.mock("electron", () => ({
  contextBridge: {
    exposeInMainWorld,
  },
  ipcRenderer: {
    invoke,
  },
}));

describe("electron preload bridge", () => {
  beforeEach(() => {
    exposeInMainWorld.mockReset();
    invoke.mockReset();
    vi.resetModules();
  });

  test("exposes the desktop API through window.openWarden", async () => {
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

    const branches = await desktopBridge.getBranches("/tmp/repo");
    expect(branches).toEqual(["main"]);
    expect(invoke).toHaveBeenCalledWith("desktop:invoke", "getBranches", "/tmp/repo");
  });
});
