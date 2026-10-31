import { afterEach, expect, test, vi } from "vitest";
import { desktopHandlers } from "@/test/desktopHandlers";
import { browserDesktopApi } from "./browser";

afterEach(() => {
  delete window.desktopBridge;
  vi.unstubAllEnvs();
});

test("resolves the desktop bridge lazily and forwards typed replies", async () => {
  const { desktop } = await import("./index");
  const requests: string[] = [];
  window.desktopBridge = {
    ...browserDesktopApi,
    ...desktopHandlers({
      async selectFolder() {
        requests.push("selectFolder");
        return "/tmp/repo";
      },
      async getRepoFile(input: { repoPath: string; relPath: string }) {
        requests.push(input.relPath);
        return { name: input.relPath, contents: "source" };
      },
    }),
  };
  expect(await desktop.selectFolder()).toEqual({ ok: true, value: "/tmp/repo" });
  expect(await desktop.getRepoFile({ repoPath: "/tmp/repo", relPath: "src/app.ts" })).toEqual({
    ok: true,
    value: { name: "src/app.ts", contents: "source" },
  });
  expect(requests).toEqual(["selectFolder", "src/app.ts"]);
});

test("normalizes a disconnected bridge without exposing invoke messages", async () => {
  const { desktop } = await import("./index");
  window.desktopBridge = {
    ...browserDesktopApi,
    selectFolder: async () => {
      throw new Error("Error invoking remote method: secret diagnostic");
    },
  };
  const result = await desktop.selectFolder();
  expect(result).toMatchObject({
    ok: false,
    error: { code: "unavailable", operation: "selectFolder" },
  });
  expect(JSON.stringify(result)).not.toContain("secret diagnostic");
});
