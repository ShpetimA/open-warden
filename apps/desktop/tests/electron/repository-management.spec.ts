import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

test("clone, init and remote configuration cross the real desktop IPC seam", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "warden-management-ipc-"));
  const userData = path.join(root, "profile");
  const entry = path.join(root, "entry.cjs");

  await writeFile(
    entry,
    [
      'const { app } = require("electron");',
      "",
      `app.setPath("userData", ${JSON.stringify(userData)});`,
      `require(${JSON.stringify(path.resolve(".vite/build/main.cjs"))});`,
      "",
    ].join("\n"),
  );

  const environment = { ...process.env, VITE_DEV_SERVER_URL: "http://127.0.0.1:1420" };

  delete environment.ELECTRON_RUN_AS_NODE;

  let app: Awaited<ReturnType<typeof electron.launch>> | undefined;

  try {
    app = await electron.launch({ args: [entry], env: environment });
    expect(await app.evaluate(({ app }) => app.getPath("userData"))).toBe(userData);

    const page = await app.firstWindow();
    await page.waitForFunction(() => Boolean(window.desktopBridge));

    const results = await page.evaluate(async (root) => {
      const bridge = window.desktopBridge;

      if (!bridge) throw new Error("Missing desktop bridge");

      const initialized = await bridge.setupRepository({
        kind: "init",
        destination: `${root}/original`,
        initialBranch: "main",
      });

      if (!initialized.ok) throw new Error("Could not initialize temporary repository");

      const configuration = await bridge.getRepositoryConfiguration(initialized.value);

      if (!configuration.ok) throw new Error("Could not read temporary repository");

      const added = await bridge.configureRepository(initialized.value, {
        kind: "add-remote",
        name: "origin",
        url: "https://bitbucket.org/workspace/example.git",
        expectedRevision: configuration.value.revision,
      });

      const updated = await bridge.getRepositoryConfiguration(initialized.value);

      const cloned = await bridge.setupRepository({
        kind: "clone",
        source: initialized.value,
        destination: `${root}/cloned`,
      });

      const existing = await bridge.setupRepository({
        kind: "clone",
        source: initialized.value,
        destination: initialized.value,
      });

      return { initialized, added, updated, cloned, existing };
    }, root);

    expect(results.initialized.ok).toBe(true);
    expect(results.added).toEqual({ ok: true, value: undefined });
    expect(results.updated.ok && results.updated.value.remotes[0]?.name).toBe("origin");
    expect(results.cloned.ok).toBe(true);
    expect(results.existing).toMatchObject({ ok: false, error: { code: "conflict" } });
  } finally {
    await app?.close();
    await rm(root, { recursive: true, force: true });
  }
});
