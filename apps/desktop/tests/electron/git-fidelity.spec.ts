import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test, type ElectronApplication } from "@playwright/test";

for (const theme of ["light", "dark"] as const) {
  test(`real renamed and binary files work across desktop diff screens in ${theme}`, async ({
    playwright,
  }, testInfo) => {
    const root = await mkdtemp(path.join(os.tmpdir(), "warden-fidelity-ui-"));
    const repoDirectory = path.join(root, "repo");
    const profile = path.join(root, "profile");
    await mkdir(repoDirectory);
    await mkdir(profile);
    const repo = await realpath(repoDirectory);
    const entry = path.join(root, "entry.cjs");
    const text = Array.from({ length: 30 }, (_, index) => `Line ${index + 1}\n`).join("");

    function git(...args: string[]) {
      return execFileSync("git", args, {
        cwd: repo,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }).trim();
    }

    git("init", "--initial-branch=main");
    git("config", "user.name", "Test");
    git("config", "user.email", "test@example.com");
    await writeFile(path.join(repo, "original.txt"), text);
    await writeFile(path.join(repo, "asset.bin"), Buffer.from([0, 1, 2]));
    await writeFile(path.join(repo, "removed.bin"), Buffer.from([0, 2, 3]));
    git("add", ".");
    git("commit", "-m", "Base");
    git("switch", "-c", "feature/files");
    git("mv", "original.txt", "renamed.txt");
    await writeFile(path.join(repo, "asset.bin"), Buffer.from([0, 4, 5, 6]));
    await writeFile(path.join(repo, "added.bin"), Buffer.from([0, 6, 7]));
    git("rm", "removed.bin");
    git("add", ".");
    git("commit", "-m", "Binary update and rename");
    git("mv", "renamed.txt", "working-name.txt");
    await writeFile(
      path.join(repo, "working-name.txt"),
      text.replace("Line 2\n", "Staged content\n"),
    );
    await writeFile(path.join(repo, "asset.bin"), Buffer.from([0, 7, 8, 9, 10]));
    git("add", ".");

    await writeFile(
      path.join(profile, "workspace-session.json"),
      JSON.stringify({ openRepos: [repo], activeRepo: repo, recentRepos: [] }),
    );
    await writeFile(
      entry,
      [
        'const { app } = require("electron");',
        "",
        `app.setPath("userData", ${JSON.stringify(profile)});`,
        `require(${JSON.stringify(path.resolve(".vite/build/main.cjs"))});`,
        "",
      ].join("\n"),
    );

    const environment = { ...process.env, VITE_DEV_SERVER_URL: "http://127.0.0.1:1420/#/changes" };
    delete environment.ELECTRON_RUN_AS_NODE;
    let app: ElectronApplication | undefined;

    try {
      app = await playwright._electron.launch({ args: [entry], env: environment });
      const page = await app.firstWindow();
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.setViewportSize({ width: theme === "light" ? 1440 : 1100, height: 900 });

      await page.getByRole("treeitem", { name: "asset.bin", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Binary file", exact: true })).toBeVisible();
      await expect(page.getByText("5 bytes", { exact: true })).toBeVisible();
      await expect(page.locator("diffs-container")).toHaveCount(0);
      await page.screenshot({ path: testInfo.outputPath(`changes-binary-${theme}.png`) });

      await page
        .locator('file-tree-container [data-item-path="Staged Changes/working-name.txt"]')
        .click();
      await expect(page.locator("diffs-container")).toBeVisible();
      await expect(page.locator("diffs-container")).toContainText("Staged content");
      await page.screenshot({ path: testInfo.outputPath(`changes-rename-${theme}.png`) });

      await page.getByRole("button", { name: "History", exact: true }).click();
      await page.getByRole("treeitem", { name: "asset.bin", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Binary file", exact: true })).toBeVisible();
      await expect(page.getByText("3 bytes", { exact: true })).toBeVisible();
      await expect(page.getByText("4 bytes", { exact: true })).toBeVisible();
      await page.getByRole("treeitem", { name: "removed.bin", exact: true }).click();
      await expect(page.getByText("Not present", { exact: true })).toBeVisible();

      await page.goto("http://127.0.0.1:1420/#/review");
      await page.getByRole("treeitem", { name: "asset.bin", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Binary file", exact: true })).toBeVisible();
      await expect(page.getByText("4 bytes", { exact: true })).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(`branch-binary-${theme}.png`) });

      await page.getByRole("button", { name: "Repository files", exact: true }).click();
      await page.getByRole("treeitem", { name: "asset.bin", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Binary file", exact: true })).toBeVisible();
      await expect(page.getByText("5 bytes", { exact: true })).toBeVisible();
      await expect(page.locator('[role="textbox"][contenteditable="true"]')).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Blame", exact: true })).toHaveCount(0);
      await page.screenshot({ path: testInfo.outputPath(`file-binary-${theme}.png`) });
    } finally {
      await app?.close();
      await rm(root, { recursive: true, force: true });
    }
  });
}
