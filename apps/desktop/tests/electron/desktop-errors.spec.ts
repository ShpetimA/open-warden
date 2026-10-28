import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

import type { DesktopBridge } from "../../src/platform/desktop/contracts";

test("structured failures survive the real main/preload/renderer IPC boundary", async () => {
  const userData = await mkdtemp(path.join(os.tmpdir(), "open-warden-ipc-errors-"));
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => name !== "ELECTRON_RUN_AS_NODE"),
  );
  const app = await electron.launch({
    args: [path.resolve(".vite/build/main.cjs"), `--user-data-dir=${userData}`],
    env: environment,
  });
  try {
    const window = await app.firstWindow();
    await window.waitForFunction(() => Boolean(window.desktopBridge));
    const results = await window.evaluate(async () => {
      const bridge: DesktopBridge | undefined = window.desktopBridge;
      if (!bridge) throw new Error("Missing preload bridge");
      return {
        history: await bridge.getCommitHistory("/missing-open-warden-ipc-test-repo"),
        command: await bridge.runGitCommand("", { kind: "pull" }),
        update: await bridge.getUpdateState(),
      };
    });
    expect(results.history).toMatchObject({
      ok: false,
      error: { operation: "getCommitHistory", code: "not-found" },
    });
    expect(results.command).toMatchObject({
      ok: false,
      error: { operation: "runGitCommand", code: "invalid-input" },
    });
    expect(results.update.ok).toBe(true);
    expect(JSON.stringify(results)).not.toMatch(/Error invoking|fatal:|spawn git/);

    const graph = await window.evaluate(
      (repoPath) => window.desktopBridge?.getHistoryGraph(repoPath),
      path.resolve("../.."),
    );
    expect(graph?.ok).toBe(true);
    if (graph?.ok) {
      expect(graph.value.commits.length).toBeGreaterThan(0);
      expect(graph.value.commits[0]?.parents).toBeInstanceOf(Array);
      expect(graph.value.commits[0]?.refs).toBeInstanceOf(Array);
    }

    await app.evaluate(({ ipcMain }) => ipcMain.removeHandler("desktop:invoke"));
    const disconnected = await window.evaluate(() =>
      window.desktopBridge?.getCommitHistory("/missing"),
    );
    expect(disconnected).toMatchObject({
      ok: false,
      error: { operation: "getCommitHistory", code: "unavailable" },
    });
    expect(JSON.stringify(disconnected)).not.toContain("Error invoking");
  } finally {
    await app.close();
    await rm(userData, { recursive: true, force: true });
  }
});
