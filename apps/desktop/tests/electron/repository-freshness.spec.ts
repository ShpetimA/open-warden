import { _electron as electron, expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test("native repository events refresh mounted file trees and history without losing tree identity", async () => {
  test.setTimeout(120000);
  const directory = await mkdtemp(path.join(os.tmpdir(), "warden-native-freshness-"));
  const root = path.join(directory, "repo");
  const profile = path.join(directory, "profile");
  await mkdir(root);
  await mkdir(profile);
  const repo = await realpath(root);
  const git = (args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
  git(["init", "-q"]);
  git(["config", "user.name", "Test"]);
  git(["config", "user.email", "test@example.com"]);
  await writeFile(path.join(repo, "existing.txt"), "base\n");
  git(["add", "."]);
  git(["commit", "-qm", "Original commit"]);
  await writeFile(
    path.join(profile, "workspace-session.json"),
    JSON.stringify({ openRepos: [repo], activeRepo: repo, recentRepos: [] }),
  );
  const entry = path.join(directory, "entry.cjs");
  await writeFile(
    entry,
    `const { app } = require('electron');\napp.setPath('userData', ${JSON.stringify(profile)});\nrequire(${JSON.stringify(path.resolve(".vite/build/main.cjs"))});\n`,
  );
  const env = {
    ...process.env,
    VITE_DEV_SERVER_URL:
      process.env.OPEN_WARDEN_RENDERER_URL ?? "http://127.0.0.1:1420/#/changes/files",
  };
  delete env.ELECTRON_RUN_AS_NODE;
  let app: Awaited<ReturnType<typeof electron.launch>> | undefined;
  const events: string[] = [];
  try {
    app = await electron.launch({ args: [entry], env });
    const page = await app.firstWindow();
    page.on("console", (message) => {
      if (message.text().startsWith("repository-change:")) events.push(message.text());
    });
    await page.evaluate(() => {
      window.desktopBridge?.onRepositoryChanged((event) =>
        console.log("repository-change:" + JSON.stringify(event)),
      );
    });
    await page.getByRole("button", { name: "Repository files", exact: true }).click();
    await expect(page.getByRole("treeitem", { name: "existing.txt", exact: true })).toBeVisible();
    await page.locator("file-tree-container").evaluate((tree) => {
      tree.setAttribute("data-native-retained", "yes");
    });
    await page.getByRole("treeitem", { name: "existing.txt", exact: true }).click();
    await writeFile(path.join(repo, "external.txt"), "external\n");
    await expect(page.getByRole("treeitem", { name: "external.txt", exact: true })).toBeVisible();
    await expect(page.locator("file-tree-container")).toHaveAttribute(
      "data-native-retained",
      "yes",
    );
    await expect(page.getByRole("treeitem", { name: "existing.txt", exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await writeFile(path.join(repo, "existing.txt"), "changed from external editor\n");
    await expect(
      page.getByText("changed from external editor", { exact: false }).first(),
    ).toBeVisible();
    await rm(path.join(repo, "external.txt"));
    await expect(page.getByRole("treeitem", { name: "external.txt", exact: true })).toHaveCount(0);
    const created = await page.evaluate(
      (repoPath) => window.desktopBridge?.createRepositoryEntry({ repoPath, path: "created.txt" }),
      repo,
    );
    expect(created?.ok).toBe(true);
    await expect(page.getByRole("treeitem", { name: "created.txt", exact: true })).toBeVisible();
    // Discarding this untracked file exercises mutation completion through IPC without OS Trash.
    const discarded = await page.evaluate(
      (repoPath) => window.desktopBridge?.discardFile(repoPath, "created.txt", "untracked"),
      repo,
    );
    expect(discarded?.ok).toBe(true);
    await expect(page.getByRole("treeitem", { name: "created.txt", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "History", exact: true }).click();
    await expect(page.getByText("Original commit", { exact: true }).first()).toBeVisible();
    git(["add", "."]);
    git(["commit", "-qm", "External commit arrives"]);
    await expect(page.getByText("External commit arrives", { exact: true }).first()).toBeVisible();
    expect(await readFile(path.join(repo, "existing.txt"), "utf8")).toBe(
      "changed from external editor\n",
    );
  } catch (cause) {
    console.log({ repositoryEvents: events });
    throw cause;
  } finally {
    await app?.close();
    await rm(directory, { recursive: true, force: true });
  }
});
