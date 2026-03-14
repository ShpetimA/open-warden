import { beforeEach, describe, expect, test, vi } from "vitest";

const existsSync = vi.fn<(path: string) => boolean>();

vi.mock("node:fs", () => ({
  existsSync,
  default: {
    existsSync,
  },
}));

describe("resolvePreloadPath", () => {
  beforeEach(() => {
    existsSync.mockReset();
  });

  test("prefers preload.cjs for the current electron-builder preload bundle", async () => {
    existsSync.mockReturnValueOnce(true);

    const { resolvePreloadPath } = await import("./preload-path");

    expect(resolvePreloadPath("/tmp/build")).toBe("/tmp/build/preload.cjs");
    expect(existsSync).toHaveBeenCalledWith("/tmp/build/preload.cjs");
  });

  test("falls back to preload.js only when the cjs preload bundle is missing", async () => {
    existsSync.mockReturnValueOnce(false);

    const { resolvePreloadPath } = await import("./preload-path");

    expect(resolvePreloadPath("/tmp/build")).toBe("/tmp/build/preload.js");
    expect(existsSync).toHaveBeenCalledWith("/tmp/build/preload.cjs");
  });
});
