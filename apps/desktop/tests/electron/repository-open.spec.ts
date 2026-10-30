import { _electron as electron, expect, test } from "@playwright/test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const repository = process.env.OPEN_WARDEN_OPEN_REPOSITORY;

test("opens a real repository without main-process or renderer exceptions", async ({
  browserName,
}, testInfo) => {
  test.skip(browserName !== "chromium", "Electron requires Chromium.");
  test.skip(!repository, "Set OPEN_WARDEN_OPEN_REPOSITORY for a read-only real-repository check.");
  if (!repository) return;
  test.setTimeout(90000);

  const profile = await mkdtemp(path.join(os.tmpdir(), "warden-repository-open-"));
  const exceptions = path.join(profile, "main-errors.log");
  const entry = path.join(profile, "entry.cjs");
  await writeFile(exceptions, "");
  await writeFile(
    path.join(profile, "workspace-session.json"),
    JSON.stringify({
      openRepos: [repository],
      activeRepo: repository,
      recentRepos: [],
    }),
  );
  await writeFile(
    entry,
    [
      "const { app } = require('electron');",
      "const fs = require('node:fs');",
      `app.setPath('userData', ${JSON.stringify(profile)});`,
      `process.on('uncaughtExceptionMonitor', error => fs.appendFileSync(${JSON.stringify(exceptions)}, error.stack + '\\n'));`,
      `require(${JSON.stringify(process.env.OPEN_WARDEN_MAIN_PATH ?? path.resolve(".vite/build/main.cjs"))});`,
    ].join("\n"),
  );

  const env = {
    ...process.env,
    GIT_OPTIONAL_LOCKS: "0",
    VITE_DEV_SERVER_URL: process.env.OPEN_WARDEN_RENDERER_URL ?? "http://127.0.0.1:1431/#/changes",
  };
  delete env.ELECTRON_RUN_AS_NODE;
  if (process.env.OPEN_WARDEN_MAIN_PATH) delete env.VITE_DEV_SERVER_URL;
  const rendererErrors: string[] = [];
  let app: Awaited<ReturnType<typeof electron.launch>> | undefined;
  try {
    app = await electron.launch({ args: [entry], env });
    const page = await app.firstWindow();
    page.on("pageerror", (error) => rendererErrors.push(error.stack ?? error.message));
    await page.getByRole("button", { name: "Repository files", exact: true }).click();
    await expect(page.locator("file-tree-container")).toBeVisible();
    await expect(page.getByRole("treeitem").first()).toBeVisible();
    const subscription = await page.evaluate(
      (repoPath) => window.desktopBridge?.setRepositorySubscriptions([repoPath]),
      repository,
    );
    expect(subscription?.ok).toBe(true);
    await page.getByRole("button", { name: "Changes", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Commit message", exact: true })).toBeVisible();
    expect(await readFile(exceptions, "utf8")).toBe("");
    expect(rendererErrors).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath("repository-open.png"),
      animations: "disabled",
    });
  } finally {
    const mainErrors = await readFile(exceptions, "utf8");
    if (mainErrors || rendererErrors.length) console.log({ mainErrors, rendererErrors });
    if (mainErrors) app?.process().kill("SIGTERM");
    else await app?.close();
    await rm(profile, { recursive: true, force: true });
  }
});
