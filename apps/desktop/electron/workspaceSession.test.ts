import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { rmSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

let userDataPath = "";

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(() => userDataPath),
  },
}));

describe("electron workspace session persistence", () => {
  beforeEach(async () => {
    userDataPath = await mkdtemp(path.join(os.tmpdir(), "open-warden-workspace-session-"));
    vi.resetModules();
  });

  afterEach(() => {
    if (userDataPath) {
      rmSync(userDataPath, { recursive: true, force: true });
    }
  });

  test("saves and loads a normalized workspace session", async () => {
    const { loadWorkspaceSession, saveWorkspaceSession } = await import("./workspaceSession");

    await saveWorkspaceSession({
      openRepos: ["/repo/a", "/repo/a", "/repo/b"],
      activeRepo: "/repo/b",
      recentRepos: ["/repo/c", "/repo/a"],
    });

    const rawFile = await readFile(path.join(userDataPath, "workspace-session.json"), "utf8");
    expect(JSON.parse(rawFile)).toEqual({
      openRepos: ["/repo/a", "/repo/b"],
      activeRepo: "/repo/b",
      recentRepos: ["/repo/b", "/repo/a", "/repo/c"],
    });

    await expect(loadWorkspaceSession()).resolves.toEqual({
      ok: true,
      value: {
        openRepos: ["/repo/a", "/repo/b"],
        activeRepo: "/repo/b",
        recentRepos: ["/repo/b", "/repo/a", "/repo/c"],
      },
    });
  });

  test("reports invalid saved data without silently emptying the session", async () => {
    const sessionPath = path.join(userDataPath, "workspace-session.json");
    await writeFile(sessionPath, "{not json", "utf8");

    const { loadWorkspaceSession } = await import("./workspaceSession");

    await expect(loadWorkspaceSession()).resolves.toMatchObject({
      ok: false,
      error: { code: "storage-failed" },
    });
    expect(await readFile(sessionPath, "utf8")).toBe("{not json");
  });
});
