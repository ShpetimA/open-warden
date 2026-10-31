import { execFileSync } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test, type ElectronApplication } from "@playwright/test";

for (const theme of ["light", "dark"] as const) {
  test(`real Git entry types work across desktop diff screens in ${theme}`, async ({
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
    const beforeImage = await readFile(new URL("../fixtures/images/before.png", import.meta.url));
    const afterImage = await readFile(new URL("../fixtures/images/after.png", import.meta.url));

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
    await writeFile(path.join(repo, "image.png"), beforeImage);
    await writeFile(path.join(repo, "image-removed.png"), beforeImage);
    await writeFile(path.join(repo, "deploy.sh"), "echo deploy\n");
    await symlink("settings/development.json", path.join(repo, "active-config"));
    await mkdir(path.join(repo, "vendor/library"), { recursive: true });
    git("add", ".");
    git("update-index", "--add", "--cacheinfo", `160000,${"a".repeat(40)},vendor/library`);
    git("commit", "-m", "Base");
    git("switch", "-c", "feature/files");
    git("mv", "original.txt", "renamed.txt");
    await writeFile(path.join(repo, "asset.bin"), Buffer.from([0, 4, 5, 6]));
    await writeFile(path.join(repo, "added.bin"), Buffer.from([0, 6, 7]));
    git("rm", "removed.bin");
    git("rm", "image-removed.png");
    await writeFile(path.join(repo, "image.png"), afterImage);
    await writeFile(path.join(repo, "image-added.png"), afterImage);
    await writeFile(path.join(repo, "image-broken.png"), beforeImage.subarray(0, 33));
    await chmod(path.join(repo, "deploy.sh"), 0o755);
    await unlink(path.join(repo, "active-config"));
    await symlink("settings/staging.json", path.join(repo, "active-config"));
    git("add", ".");
    git("update-index", "--cacheinfo", `160000,${"b".repeat(40)},vendor/library`);
    git("commit", "-m", "Binary update and rename");
    git("mv", "renamed.txt", "working-name.txt");
    await writeFile(
      path.join(repo, "working-name.txt"),
      text.replace("Line 2\n", "Staged content\n"),
    );
    await writeFile(path.join(repo, "asset.bin"), Buffer.from([0, 7, 8, 9, 10]));
    await writeFile(path.join(repo, "image.png"), beforeImage);
    await chmod(path.join(repo, "deploy.sh"), 0o644);
    await unlink(path.join(repo, "active-config"));
    await symlink("settings/production.json", path.join(repo, "active-config"));
    git("add", ".");
    git("update-index", "--cacheinfo", `160000,${"c".repeat(40)},vendor/library`);

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

      await page.getByRole("treeitem", { name: "image.png", exact: true }).click();
      await expect(page.getByRole("img", { name: "Before: image.png", exact: true })).toBeVisible();
      await expect
        .poll(() =>
          page
            .getByRole("img", { name: "After: image.png", exact: true })
            .evaluate((image: HTMLImageElement) => image.naturalWidth),
        )
        .toBe(640);
      const afterPreview = page.getByRole("group", { name: "After image preview", exact: true });
      await afterPreview.getByRole("button", { name: "Actual size", exact: true }).click();
      await expect(
        afterPreview.getByRole("button", { name: "Actual size", exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      await page.screenshot({ path: testInfo.outputPath(`changes-image-${theme}.png`) });
      const imageUrl = await page
        .getByRole("img", { name: "After: image.png", exact: true })
        .getAttribute("src");
      if (!imageUrl) throw new Error("Expected an image Blob URL");

      await page.getByRole("treeitem", { name: "active-config", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Symbolic link", exact: true })).toBeVisible();
      await expect(page.getByText("settings/production.json", { exact: true })).toBeVisible();
      await expect(page.locator("diffs-container")).toHaveCount(0);
      await expect
        .poll(() =>
          page.evaluate(async (url) => {
            try {
              return (await fetch(url)).ok;
            } catch {
              return false;
            }
          }, imageUrl),
        )
        .toBe(false);
      await page.screenshot({ path: testInfo.outputPath(`changes-symlink-${theme}.png`) });

      await page.getByRole("treeitem", { name: "deploy.sh", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "File permissions changed", exact: true }),
      ).toBeVisible();
      await expect(page.getByText("Executable permission removed", { exact: true })).toBeVisible();
      await expect(page.locator("diffs-container")).toHaveCount(0);
      await page.screenshot({ path: testInfo.outputPath(`changes-permissions-${theme}.png`) });

      await page.getByRole("treeitem", { name: "library", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Submodule", exact: true })).toBeVisible();
      await expect(page.getByText("c".repeat(40), { exact: true })).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(`changes-submodule-${theme}.png`) });

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
      await page.getByRole("treeitem", { name: "deploy.sh", exact: true }).click();
      await expect(page.getByText("Executable permission added", { exact: true })).toBeVisible();
      await page.getByRole("treeitem", { name: "image.png", exact: true }).click();
      await expect
        .poll(() =>
          page
            .getByRole("img", { name: "After: image.png", exact: true })
            .evaluate((image: HTMLImageElement) => image.naturalWidth),
        )
        .toBe(800);
      await page.getByRole("treeitem", { name: "image-removed.png", exact: true }).click();
      await expect(
        page.getByRole("img", { name: "Before: image-removed.png", exact: true }),
      ).toBeVisible();
      await expect(page.getByText("Not present", { exact: true })).toBeVisible();
      await page.getByRole("treeitem", { name: "image-added.png", exact: true }).click();
      await expect(
        page.getByRole("img", { name: "After: image-added.png", exact: true }),
      ).toBeVisible();

      await page.goto("http://127.0.0.1:1420/#/review");
      await page.getByRole("treeitem", { name: "asset.bin", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Binary file", exact: true })).toBeVisible();
      await expect(page.getByText("4 bytes", { exact: true })).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(`branch-binary-${theme}.png`) });
      await page.getByRole("treeitem", { name: "library", exact: true }).click();
      await expect(page.getByText("a".repeat(40), { exact: true })).toBeVisible();
      await expect(page.getByText("b".repeat(40), { exact: true })).toBeVisible();

      await page.getByRole("button", { name: "Repository files", exact: true }).click();
      await page.getByRole("treeitem", { name: "asset.bin", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Binary file", exact: true })).toBeVisible();
      await expect(page.getByText("5 bytes", { exact: true })).toBeVisible();
      await expect(page.locator('[role="textbox"][contenteditable="true"]')).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Blame", exact: true })).toHaveCount(0);
      await page.screenshot({ path: testInfo.outputPath(`file-binary-${theme}.png`) });
      await page.getByRole("treeitem", { name: "active-config", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Symbolic link", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Blame", exact: true })).toHaveCount(0);
      await expect(page.locator('[role="textbox"][contenteditable="true"]')).toHaveCount(0);
      await page.getByRole("treeitem", { name: "vendor", exact: true }).click();
      await expect(page.getByRole("treeitem", { name: "vendor", exact: true })).toHaveAttribute(
        "aria-expanded",
        "true",
      );
      await page.getByRole("treeitem", { name: "library", exact: true }).click();
      await expect(page.getByText("Not initialized", { exact: true })).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(`file-submodule-${theme}.png`) });
      await page.getByRole("treeitem", { name: "image.png", exact: true }).click();
      await expect(page.getByRole("img", { name: "File: image.png", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Blame", exact: true })).toHaveCount(0);
      await page.screenshot({ path: testInfo.outputPath(`file-image-${theme}.png`) });
      await page.getByRole("treeitem", { name: "image-broken.png", exact: true }).click();
      await expect(
        page.getByText("The image could not be decoded. It may be damaged or unsupported.", {
          exact: true,
        }),
      ).toBeVisible();
      await expect(page.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(`file-image-error-${theme}.png`) });
    } finally {
      await app?.close();
      await rm(root, { recursive: true, force: true });
    }
  });
}
