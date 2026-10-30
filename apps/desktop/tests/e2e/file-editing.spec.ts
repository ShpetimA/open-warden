import { expect, test, type Page } from "@playwright/test";
import { createAppSettings } from "../../src/platform/desktop/appSettings";
import type { DesktopHandlers } from "../../src/platform/desktop/contracts";

if (process.env.OPEN_WARDEN_BROWSER_EXECUTABLE)
  test.use({ launchOptions: { executablePath: process.env.OPEN_WARDEN_BROWSER_EXECUTABLE } });

declare global {
  interface Window {
    editorTest: {
      files: Record<string, string>;
      trashed: string[];
      confirmations: string[];
      allowTrash: boolean;
      failTrash: boolean;
      holdTrash: boolean;
      trashRequests: number;
      filesDelayMs: number;
      directories: string[];
      writes: Array<{ path: string; contents: string }>;
      failSave: boolean;
      holdSave: boolean;
      release: () => void;
    };
  }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript((settings) => {
    const waiters: Array<() => void> = [];
    const control = {
      files: {
        "src/invoice.ts": "export const total = 1;\nexport const currency = 'EUR';\n",
        "src/validation.ts": "export const valid = true;\n",
        "README.md": "# Invoice\n",
      },
      trashed: [] as string[],
      confirmations: [] as string[],
      allowTrash: true,
      failTrash: false,
      holdTrash: false,
      trashRequests: 0,
      filesDelayMs: 0,
      directories: [] as string[],
      writes: [] as Array<{ path: string; contents: string }>,
      failSave: false,
      holdSave: false,
      release() {
        control.holdSave = false;
        control.holdTrash = false;
        for (const release of waiters.splice(0)) release();
      },
    };
    window.editorTest = control;
    const handlers: Partial<DesktopHandlers> = {
      loadWorkspaceSession: async () => ({
        openRepos: ["/projects/editor"],
        activeRepo: "/projects/editor",
        recentRepos: [],
      }),
      saveWorkspaceSession: async (session) => session,
      loadAppSettings: async () => settings,
      saveAppSettings: async (value) => value,
      getAppSettingsPath: async () => "/test/settings.json",
      getUpdateState: async () => ({
        enabled: false,
        status: "disabled",
        currentVersion: "0.0.0",
        availableVersion: null,
        downloadedVersion: null,
        checkedAt: null,
        downloadPercent: null,
        message: null,
        errorContext: null,
        canRetry: false,
        disabledReason: "Test",
      }),
      getGitSnapshot: async () => ({
        repoRoot: "/projects/editor",
        branch: "main",
        staged: [],
        unstaged: control.writes.length
          ? [{ path: "src/invoice.ts", previousPath: null, status: "modified" }]
          : [],
        untracked: [],
      }),
      getRepoFiles: async () => {
        if (control.filesDelayMs) {
          await new Promise((resolve) => setTimeout(resolve, control.filesDelayMs));
        }
        return [
          ...Object.keys(control.files),
          ...control.directories.map((directory) => `${directory}/`),
        ].map((path) => ({ path }));
      },
      createRepositoryEntry: async ({ path }) => {
        const directory = path.endsWith("/");
        const entryPath = path.replace(/\/$/, "");
        if (entryPath in window.editorTest.files || control.directories.includes(entryPath)) {
          return {
            ok: false,
            error: {
              operation: "createRepositoryEntry",
              code: "conflict",
              message: "A file or folder already exists at this path. Choose another name.",
            },
          };
        }
        if (directory) control.directories.push(entryPath);
        else window.editorTest.files[entryPath] = "";
        return { ok: true, value: { path: entryPath, kind: directory ? "directory" : "file" } };
      },
      confirm: async (message) => {
        control.confirmations.push(message);
        return control.allowTrash;
      },
      trashRepositoryEntry: async ({ path }) => {
        control.trashRequests += 1;
        if (control.holdTrash) await new Promise<void>((resolve) => waiters.push(resolve));
        if (control.failTrash)
          return {
            ok: false,
            error: {
              operation: "trashRepositoryEntry",
              code: "permission",
              message: "Couldn’t move this entry to Trash.",
            },
          };
        for (const file of Object.keys(control.files)) {
          if (file === path || file.startsWith(`${path}/`)) delete control.files[file];
        }
        control.directories = control.directories.filter(
          (directory) => directory !== path && !directory.startsWith(`${path}/`),
        );
        control.trashed.push(path);
        return { ok: true, value: undefined };
      },
      getRepoFile: async ({ relPath, revision }) => ({
        name: relPath,
        contents: revision
          ? "export const historical = true;"
          : (window.editorTest.files[relPath] ?? ""),
      }),
      getCommitHistory: async () => [
        {
          commitId: "a".repeat(40),
          shortId: "aaaaaaaa",
          summary: "Add invoice",
          author: "Alice",
          relativeTime: "1 day ago",
        },
      ],
      getCommitFiles: async () => [
        { path: "src/invoice.ts", previousPath: null, status: "modified" },
      ],
      getCommitFileVersions: async () => ({
        oldFile: { name: "src/invoice.ts", contents: "export const total = 0;" },
        newFile: { name: "src/invoice.ts", contents: "export const total = 1;" },
      }),
      updateWorktreeFileContents: async (_repo, path, contents, expected) => {
        if (control.holdSave) await new Promise<void>((resolve) => waiters.push(resolve));
        if (control.failSave) throw new Error("Disk is read only");
        if (expected.kind !== "worktree" || window.editorTest.files[path] !== expected.contents)
          throw {
            code: "conflict",
            operation: "saveWorkingFile",
            message: "This file changed on disk. Reload before saving.",
          };
        window.editorTest.files[path] = contents;
        control.writes.push({ path, contents });
      },
      getGitRepositoryState: async () => ({
        branch: "main",
        upstream: "",
        ahead: 0,
        behind: 0,
        operation: null,
        remotes: [],
        conflicts: [],
        lastCommit: null,
        stashes: [],
        branches: [],
        tags: [],
        worktrees: [],
        incoming: [],
        outgoing: [],
      }),
      getFileVersions: async (_repo, _bucket, path) => ({
        oldFile: { name: path, contents: "export const total = 1;\n" },
        newFile: { name: path, contents: window.editorTest.files[path] ?? "" },
      }),
      resolveHostedRepo: async () => null,
      listProviderConnections: async () => [],
      checkAppExists: async () => false,
      syncLspDocument: async () => {},
      closeLspDocument: async () => {},
    };
    const bridge = Object.fromEntries(
      Object.entries(handlers).map(([method, handler]) => [
        method,
        async (...args: unknown[]) => {
          try {
            const value = await handler(...args);
            return method === "createRepositoryEntry" || method === "trashRepositoryEntry"
              ? value
              : { ok: true, value };
          } catch (cause) {
            return {
              ok: false,
              error: {
                operation: method,
                code:
                  cause && typeof cause === "object" && "code" in cause
                    ? String(cause.code)
                    : method === "updateWorktreeFileContents"
                      ? "permission"
                      : "unavailable",
                message:
                  cause && typeof cause === "object" && "message" in cause
                    ? String(cause.message)
                    : "Test failed",
              },
            };
          }
        },
      ]),
    );
    Object.assign(bridge, {
      onUpdateState: () => () => {},
      onLspDiagnostics: () => () => {},
      onAppSettingsChanged: () => () => {},
      onGuidanceNavigate: () => () => {},
    });
    Object.defineProperty(window, "desktopBridge", { value: bridge });
  }, createAppSettings());
});

async function quickOpen(page: Page, query: string) {
  await expect(page.getByRole("button", { name: "Repository files", exact: true })).toBeVisible();
  await page.keyboard.press("Meta+p");
  const picker = page.getByRole("dialog", { name: "Quick Open file", exact: true });
  await expect(picker).toBeVisible();
  const input = picker.getByRole("combobox", { name: "Quick Open file", exact: true });
  await input.fill(query);
  await expect(picker.getByRole("option").first()).toBeVisible();
  await input.press("Enter");
  await expect(picker).toHaveCount(0);
  await expect(page.locator('diffs-container [role="textbox"]')).toBeVisible();
}

async function replaceText(page: Page, text: string) {
  const editor = page.locator('diffs-container [role="textbox"]');
  await editor.click();
  await page.keyboard.press("Meta+a");
  await page.keyboard.type(text);
}

for (const theme of ["light", "dark"] as const) {
  test(`opens collapsed folders and edits, retains drafts, and saves in ${theme}`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/#/changes/files");
    const folder = page.locator('file-tree-container [data-item-path="src/"]');
    await expect(folder).toBeVisible();
    await expect(folder).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator('file-tree-container [data-item-path="src/invoice.ts"]')).toHaveCount(
      0,
    );
    await page.keyboard.press("Meta+p");
    const picker = page.getByRole("dialog", { name: "Quick Open file", exact: true });
    await picker.getByRole("combobox").fill("invts");
    await expect(picker.getByRole("option").first()).toContainText("invoice.ts");
    await page.screenshot({
      path: testInfo.outputPath(`quick-open-${theme}.png`),
      animations: "disabled",
    });
    await page.keyboard.press("Escape");
    await quickOpen(page, "invoice.ts");
    const host = await page.locator("diffs-container").elementHandle();
    await replaceText(page, "export const total = 2; // jk");
    await expect(page.getByText("Unsaved", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Blame", exact: true })).toBeDisabled();
    expect(await host?.evaluate((element) => element.isConnected)).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`editor-dirty-${theme}.png`),
      animations: "disabled",
    });
    await quickOpen(page, "validation.ts");
    await expect(page.locator("diffs-container")).toContainText("valid = true");
    await quickOpen(page, "invoice.ts");
    await expect(page.locator("diffs-container")).toContainText("total = 2; // jk");
    await expect(page.getByText("Unsaved", { exact: true })).toBeVisible();
    await page.keyboard.press("Meta+s");
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => window.editorTest.writes)).toEqual([
      { path: "src/invoice.ts", contents: "export const total = 2; // jk" },
    ]);
    await expect(folder).toBeVisible();
    await page.keyboard.type("x");
    await expect(page.getByText("Unsaved", { exact: true })).toBeVisible();
    await page.keyboard.press("Meta+z");
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    await page.keyboard.press("Meta+Shift+z");
    await expect(page.getByText("Unsaved", { exact: true })).toBeVisible();
    await page.setViewportSize({ width: 900, height: 700 });
    await page.screenshot({
      path: testInfo.outputPath(`editor-narrow-${theme}.png`),
      animations: "disabled",
    });
    await page.keyboard.press("Meta+b");
    await expect(folder).not.toBeInViewport();
    await page.keyboard.press("Meta+b");
    await expect(folder).toBeInViewport();
  });
}

test("keeps edits made during a save and retries a failed save", async ({ page }) => {
  await page.goto("/#/changes/files");
  await quickOpen(page, "invoice.ts");
  await replaceText(page, "export const total = 2;");
  await page.evaluate(() => {
    window.editorTest.failSave = true;
  });
  await page.keyboard.press("Meta+s");
  await expect(page.getByText("Couldn’t save file", { exact: true })).toBeVisible();
  await expect(page.locator("diffs-container")).toContainText("total = 2");
  expect(await page.evaluate(() => window.editorTest.writes.length)).toBe(0);
  await page.evaluate(() => {
    window.editorTest.failSave = false;
    window.editorTest.holdSave = true;
  });
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByText("Saving…", { exact: true })).toBeVisible();
  await replaceText(page, "export const total = 3;");
  await page.evaluate(() => window.editorTest.release());
  await expect(page.getByText("Unsaved", { exact: true })).toBeVisible();
  await page.keyboard.press("Meta+s");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.editorTest.files["src/invoice.ts"])).toBe(
    "export const total = 3;",
  );
});

test("moves through folders with J/K and uses Enter and H/L for expansion", async ({ page }) => {
  await page.goto("/#/changes/files");
  const tree = page.locator("file-tree-container");
  const folder = tree.locator('[data-item-path="src/"]');
  await expect(folder).toBeVisible();
  await folder.click();
  await expect(folder).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Enter");
  await expect(folder).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("j");
  await expect(tree.locator('[data-item-path="README.md"]')).toHaveAttribute(
    "data-item-focused",
    "true",
  );
  await page.keyboard.press("k");
  await expect(folder).toHaveAttribute("data-item-focused", "true");
  await page.keyboard.press("l");
  await expect(folder).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("j");
  await expect(tree.locator('[data-item-path="src/invoice.ts"]')).toHaveAttribute(
    "data-item-focused",
    "true",
  );
  await page.keyboard.press("k");
  await expect(folder).toHaveAttribute("data-item-focused", "true");
  await page.keyboard.press("h");
  await expect(folder).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("Enter");
  await expect(folder).toHaveAttribute("aria-expanded", "true");
});

test("quick-opens a file at a line and keeps historical revisions read only", async ({ page }) => {
  await page.goto("/#/changes/files");
  await quickOpen(page, "invoice.ts:2");
  await expect(page.locator('diffs-container [role="textbox"]')).toBeFocused();
  await page.keyboard.press("Meta+p");
  await expect(page.getByRole("dialog", { name: "Quick Open file", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator('diffs-container [role="textbox"]')).toBeFocused();
  await page.keyboard.type("/* line two */");
  await page.keyboard.press("Meta+s");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.editorTest.files["src/invoice.ts"])).toBe(
    "export const total = 1;\n/* line two */export const currency = 'EUR';\n",
  );
  await page.getByRole("button", { name: "History", exact: true }).click();
  await page.getByRole("button", { name: "Open file viewer", exact: true }).click();
  await expect(page.getByText("Read only", { exact: true })).toBeVisible();
  await expect(page.locator("diffs-container")).toContainText("historical = true");
  await expect(page.locator('diffs-container [role="textbox"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Save/ })).toHaveCount(0);
});

test("refuses to overwrite external changes and reloads only after confirmation", async ({
  page,
}, testInfo) => {
  await page.goto("/#/changes/files");
  await quickOpen(page, "invoice.ts");
  await replaceText(page, "export const total = 2;");
  await page.evaluate(() => {
    window.editorTest.files["src/invoice.ts"] = "export const total = 99;";
  });
  await page.keyboard.press("Meta+s");
  await expect(page.getByText(/This file changed on disk/)).toBeVisible();
  expect(await page.evaluate(() => window.editorTest.writes.length)).toBe(0);
  await page.screenshot({
    path: testInfo.outputPath("editor-conflict.png"),
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Reload file from disk" }).click();
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(page.locator("diffs-container")).toContainText("total = 2");
  await page.getByRole("button", { name: "Reload file from disk" }).click();
  await page.getByRole("button", { name: "Reload file", exact: true }).click();
  await expect(page.locator("diffs-container")).toContainText("total = 99");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
});

test("creates a nested file from the tree and focuses its working editor", async ({ page }) => {
  await page.goto("/#/changes/files");
  const src = page.locator('file-tree-container [data-item-path="src/"]');
  await src.click();
  await page.keyboard.press("n");
  const input = page.getByRole("textbox", { name: "New file or folder", exact: true });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(input).toHaveValue("");
  await expect(input).toHaveAttribute("aria-description", /Relative to src\//);
  await input.fill("nested/created.ts");
  await input.press("Enter");
  await expect(input).toHaveCount(0);
  const editor = page.locator('diffs-container [role="textbox"]');
  await expect(editor).toBeFocused();
  await page.keyboard.type("new file contents");
  await page.keyboard.press("Meta+s");
  await expect
    .poll(() => page.evaluate(() => window.editorTest.files["src/nested/created.ts"]))
    .toBe("new file contents");
  await page.keyboard.press("Meta+Shift+e");
  await expect(
    page.locator('file-tree-container [data-item-path="src/nested/created.ts"]'),
  ).toBeFocused();
  await page.keyboard.press("Meta+n");
  await expect(input).toHaveValue("");
  await expect(input).toHaveAttribute("aria-description", /Relative to src\/nested\//);
  await page.keyboard.press("Escape");
});

for (const theme of ["light", "dark"] as const) {
  test(`creates and focuses empty folders, preserves existing files and restores tree focus in ${theme}`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.setViewportSize({ width: theme === "light" ? 1440 : 900, height: 900 });
    await page.goto("/#/changes/files");
    await page.locator('file-tree-container [data-item-path="src/"]').click();
    await page.getByRole("button", { name: "New file or folder", exact: true }).click();
    const input = page.getByRole("textbox", { name: "New file or folder", exact: true });
    await expect(input).toHaveValue("");
    await input.fill("invoice.ts");
    await input.press("Enter");
    await expect(input).toHaveAttribute("aria-invalid", "true");
    await expect(input).toHaveAttribute("aria-description", /already exists/);
    await page.screenshot({ path: testInfo.outputPath("create-conflict.png") });
    await input.fill("empty/nested/");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(input).toBeFocused();
    await page.screenshot({ path: testInfo.outputPath("create-folder.png") });
    await input.press("Enter");
    await expect(input).toHaveCount(0);
    const folder = page.locator('file-tree-container [data-item-path="src/empty/nested/"]');
    await expect(folder).toBeFocused();
    await page.screenshot({ path: testInfo.outputPath("created-folder-tree.png") });
    expect(await page.evaluate(() => window.editorTest.files["src/invoice.ts"])).toContain(
      "total = 1",
    );
    await page.keyboard.press("n");
    await expect(input).toHaveValue("");
    await expect(input).toHaveAttribute("aria-description", /Relative to src\/empty\/nested\//);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Meta+Shift+h");
    await expect(page).toHaveURL(/history/);
    await page.keyboard.press("Meta+Shift+e");
    await expect(page).toHaveURL(/changes\/files/);
    await expect(page.locator('file-tree-container [data-item-focused="true"]')).toBeFocused();
  });
}

test("switches sidebar sections from the editor and reveals a collapsed file tree", async ({
  page,
}) => {
  await page.goto("/#/changes/files");
  await quickOpen(page, "invoice.ts");
  await page.keyboard.press("Meta+b");
  await page.keyboard.press("Meta+Shift+e");
  await expect(page.locator('file-tree-container [data-item-focused="true"]')).toBeFocused();
  await page.keyboard.press("Meta+b");
  await page.keyboard.press("Meta+Shift+c");
  await expect(page).toHaveURL(/#\/changes$/);
  await page.keyboard.press("Meta+Shift+p");
  await expect(page).toHaveURL(/pull-requests/);
  await expect(page.getByRole("dialog", { name: "Quick Open file", exact: true })).toHaveCount(0);
  await page.keyboard.press("Meta+Shift+d");
  await expect(page).toHaveURL(/review/);
  await page.keyboard.press("Meta+Shift+e");
  await expect(page.locator('file-tree-container [data-item-focused="true"]')).toBeFocused();
});

test("creates the first file in an empty repository", async ({ page }) => {
  await page.goto("/#/changes/files");
  await expect(page.locator("file-tree-container")).toBeVisible();
  await page.evaluate(() => {
    window.editorTest.files = {};
  });
  await page.getByRole("button", { name: "Refresh repository status", exact: true }).click();
  await expect(page.getByText("No repository files found.", { exact: true })).toBeVisible();
  await page.keyboard.press("Meta+n");
  const input = page.getByRole("textbox", { name: "New file or folder", exact: true });
  await input.fill("first.ts");
  await input.press("Enter");
  await expect(page.locator('diffs-container [role="textbox"]')).toBeFocused();
  await expect(page.locator('file-tree-container [data-item-path="first.ts"]')).toBeVisible();
});

test("focuses the tree after delayed repository files arrive", async ({ page }) => {
  await page.goto("/#/history");
  await expect(page.getByRole("button", { name: "Repository files", exact: true })).toBeVisible();
  await page.evaluate(() => {
    window.editorTest.filesDelayMs = 500;
  });
  await page.keyboard.press("Meta+Shift+e");
  await expect(page.locator('file-tree-container [data-item-focused="true"]')).toBeFocused();
});

test("cancels an inline row without changing files and scopes siblings to a file's parent", async ({
  page,
}) => {
  await page.goto("/#/changes/files");
  await quickOpen(page, "invoice.ts");
  await page.keyboard.press("Meta+Shift+e");
  const invoice = page.locator('file-tree-container [data-item-path="src/invoice.ts"]');
  await expect(invoice).toBeFocused();
  await page.keyboard.press("n");
  const input = page.getByRole("textbox", { name: "New file or folder", exact: true });
  await expect(input).toHaveValue("");
  await expect(input).toHaveAttribute("aria-description", /Relative to src\//);
  await input.fill("cancelled.ts");
  await input.press("Escape");
  await expect(input).toHaveCount(0);
  await expect(invoice).toBeFocused();
  expect(await page.evaluate(() => Object.keys(window.editorTest.files))).not.toContain(
    "src/cancelled.ts",
  );
  await page.keyboard.press("n");
  await input.fill("sibling.ts");
  await input.press("Enter");
  await expect(page.locator('diffs-container [role="textbox"]')).toBeFocused();
  expect(await page.evaluate(() => Object.keys(window.editorTest.files))).toContain(
    "src/sibling.ts",
  );
});

test("keeps inline text during tree refresh and cancels when focus leaves the tree", async ({
  page,
}) => {
  await page.goto("/#/changes/files");
  await page.locator('file-tree-container [data-item-path="src/"]').click();
  await page.keyboard.press("n");
  const input = page.getByRole("textbox", { name: "New file or folder", exact: true });
  await input.fill("work-in-progress.ts");
  await page.evaluate(() => {
    window.editorTest.files["src/external.ts"] = "external";
    window.dispatchEvent(new Event("offline"));
    window.dispatchEvent(new Event("online"));
  });
  await expect(
    page.locator('file-tree-container [data-item-path="src/external.ts"]'),
  ).toBeVisible();
  await expect(input).toHaveValue("work-in-progress.ts");
  await expect(input).toBeFocused();
  const readme = page.locator('file-tree-container [data-item-path="README.md"]');
  await readme.click();
  await expect(input).toHaveCount(0);
  expect(await page.evaluate(() => Object.keys(window.editorTest.files))).not.toContain(
    "src/work-in-progress.ts",
  );
});

for (const theme of ["light", "dark"] as const) {
  test(`positions the inline input immediately under the focused file in ${theme}`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.setViewportSize({ width: theme === "light" ? 1440 : 900, height: 900 });
    await page.goto("/#/changes/files");
    await quickOpen(page, "validation.ts");
    await page.keyboard.press("Meta+Shift+e");
    for (const path of ["src/validation.ts", "README.md"]) {
      const row = page.locator(`file-tree-container [data-item-path="${path}"]`);
      await row.click();
      await page.keyboard.press("n");
      const input = page.getByRole("textbox", { name: "New file or folder", exact: true });
      await expect(input).toBeFocused();
      await expect
        .poll(async () => {
          const anchor = await row.boundingBox();
          const editor = await input.boundingBox();
          return anchor && editor ? Math.abs(editor.y - anchor.y - anchor.height) : Infinity;
        })
        .toBeLessThanOrEqual(1);
      const label = await row.locator("[data-item-section='content']").boundingBox();
      const editor = await input.boundingBox();
      expect(label && editor ? Math.abs(label.x - editor.x) : Infinity).toBeLessThanOrEqual(1);
      await page.screenshot({
        path: testInfo.outputPath(`inline-below-${path.includes("/") ? "nested" : "root"}.png`),
      });
      await input.press("Escape");
      await expect(row).toBeFocused();
    }
  });
}

test("D trashes the focused file and closes its working editor", async ({ page }) => {
  await page.goto("/#/changes/files");
  await quickOpen(page, "validation.ts");
  await page.keyboard.press("Meta+Shift+e");
  await expect(page.locator('file-tree-container [data-item-focused="true"]')).toBeFocused();
  await page.keyboard.press("d");
  await expect
    .poll(() => page.evaluate(() => window.editorTest.trashed))
    .toEqual(["src/validation.ts"]);
  await expect(
    page.locator('file-tree-container [data-item-path="src/validation.ts"]'),
  ).toHaveCount(0);
  await expect(page.getByText("Select a file from the tree.", { exact: true })).toBeVisible();
  await expect(page.locator('file-tree-container [data-item-focused="true"]')).toBeFocused();
  expect(await page.evaluate(() => window.editorTest.confirmations)).toEqual([]);
});

test("D types in editors and naming inputs; unsaved deletion can be cancelled", async ({
  page,
}) => {
  await page.goto("/#/changes/files");
  await quickOpen(page, "invoice.ts");
  await page.locator('diffs-container [role="textbox"]').click();
  await page.keyboard.type("d");
  expect(await page.evaluate(() => window.editorTest.trashed)).toEqual([]);
  await page.evaluate(() => {
    window.editorTest.allowTrash = false;
  });
  await page.keyboard.press("Meta+Shift+e");
  await expect(page.locator('file-tree-container [data-item-focused="true"]')).toBeFocused();
  await page.keyboard.press("d");
  await expect.poll(() => page.evaluate(() => window.editorTest.confirmations.length)).toBe(1);
  expect(await page.evaluate(() => window.editorTest.confirmations[0])).toContain("Unsaved edits");
  expect(await page.evaluate(() => window.editorTest.trashed)).toEqual([]);
  await page.keyboard.press("n");
  const input = page.getByRole("textbox", { name: "New file or folder", exact: true });
  await input.fill("d.ts");
  expect(await page.evaluate(() => window.editorTest.trashed)).toEqual([]);
  await input.press("Escape");
  await page.evaluate(() => {
    window.editorTest.allowTrash = true;
  });
  await page.keyboard.press("d");
  await expect
    .poll(() => page.evaluate(() => window.editorTest.trashed))
    .toEqual(["src/invoice.ts"]);
});

for (const theme of ["light", "dark"] as const) {
  test(`right-click trashes the target file and offers the same action on folders in ${theme}`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.setViewportSize({ width: theme === "light" ? 1440 : 900, height: 900 });
    await page.goto("/#/changes/files");
    await quickOpen(page, "invoice.ts");
    await page
      .locator('file-tree-container [data-item-path="src/validation.ts"]')
      .click({ button: "right" });
    const action = page.getByRole("menuitem", { name: /Move to Trash/ });
    await expect(action).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("trash-context-menu.png") });
    await action.click();
    await expect
      .poll(() => page.evaluate(() => window.editorTest.trashed))
      .toEqual(["src/validation.ts"]);
    await page.evaluate(() => {
      window.editorTest.allowTrash = false;
    });
    const folder = page.locator('file-tree-container [data-item-path="src/"]');
    await folder.click({ button: "right" });
    await action.click();
    await expect.poll(() => page.evaluate(() => window.editorTest.confirmations.length)).toBe(1);
    expect(await page.evaluate(() => window.editorTest.trashed)).toEqual(["src/validation.ts"]);
    await page.evaluate(() => {
      window.editorTest.allowTrash = true;
    });
    await folder.click();
    await page.keyboard.press("d");
    await expect
      .poll(() => page.evaluate(() => window.editorTest.trashed))
      .toEqual(["src/validation.ts", "src"]);
    await expect(folder).toHaveCount(0);
    await expect(page.locator('file-tree-container [data-item-path="README.md"]')).toBeVisible();
  });
}

test("Trash errors retain the file and allow retry", async ({ page }) => {
  await page.goto("/#/changes/files");
  await quickOpen(page, "validation.ts");
  await page.evaluate(() => {
    window.editorTest.failTrash = true;
  });
  await page.keyboard.press("Meta+Shift+e");
  await expect(page.locator('file-tree-container [data-item-focused="true"]')).toBeFocused();
  await page.keyboard.press("d");
  await expect(page.getByText("Couldn’t move this entry to Trash.", { exact: true })).toBeVisible();
  await expect(
    page.locator('file-tree-container [data-item-path="src/validation.ts"]'),
  ).toBeVisible();
  await page.evaluate(() => {
    window.editorTest.failTrash = false;
  });
  await page.keyboard.press("d");
  await expect
    .poll(() => page.evaluate(() => window.editorTest.trashed))
    .toEqual(["src/validation.ts"]);
});

test("saving and Trash cannot race to recreate a removed file", async ({ page }) => {
  await page.goto("/#/changes/files");
  await quickOpen(page, "invoice.ts");
  await replaceText(page, "edited contents");
  await page.evaluate(() => {
    window.editorTest.holdSave = true;
  });
  await page.keyboard.press("Meta+s");
  await expect(page.getByText("Saving…", { exact: true })).toBeVisible();
  await page.keyboard.press("Meta+Shift+e");
  await expect(page.locator('file-tree-container [data-item-focused="true"]')).toBeFocused();
  await page.keyboard.press("d");
  await expect(
    page.getByText("Wait for this file to finish saving before moving it to Trash.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.editorTest.trashRequests)).toBe(0);
  await page.evaluate(() => window.editorTest.release());
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await replaceText(page, "another edit");
  await page.evaluate(() => {
    window.editorTest.holdTrash = true;
  });
  await page.keyboard.press("Meta+Shift+e");
  await expect(page.locator('file-tree-container [data-item-focused="true"]')).toBeFocused();
  await page.keyboard.press("d");
  await expect.poll(() => page.evaluate(() => window.editorTest.trashRequests)).toBe(1);
  await page.keyboard.press("Meta+s");
  await page.evaluate(() => new Promise(requestAnimationFrame));
  expect(await page.evaluate(() => window.editorTest.writes.length)).toBe(1);
  await page.evaluate(() => window.editorTest.release());
  await expect
    .poll(() => page.evaluate(() => window.editorTest.trashed))
    .toEqual(["src/invoice.ts"]);
  expect(await page.evaluate(() => "src/invoice.ts" in window.editorTest.files)).toBe(false);
});
