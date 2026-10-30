import { expect, test } from "@playwright/test";
import { createAppSettings } from "../../src/platform/desktop/appSettings";
import type { DesktopHandlers } from "../../src/platform/desktop/contracts";

declare global {
  interface Window {
    changesRefreshTest: {
      snapshotReads: number;
      fileReads: number;
      stageCalls: string[];
      unstageCalls: string[];
      holdSnapshots: boolean;
      holdFiles: boolean;
      holdStages: boolean;
      failSnapshot: boolean;
      failStageAt: number;
      published: boolean;
      release: () => void;
    };
  }
}

if (process.env.OPEN_WARDEN_BROWSER_EXECUTABLE) {
  test.use({ launchOptions: { executablePath: process.env.OPEN_WARDEN_BROWSER_EXECUTABLE } });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript((settings) => {
    const files = ["a", "b", "c"].flatMap((group) =>
      Array.from({ length: group === "c" ? 80 : 6 }, (_, index) => ({
        path: `src/group-${group}/file-${String(index).padStart(2, "0")}.ts`,
        previousPath: null,
        status: "modified" as const,
      })),
    );
    const staged = new Set<string>();
    const waiters: Array<() => void> = [];
    const control = {
      snapshotReads: 0,
      fileReads: 0,
      stageCalls: [] as string[],
      unstageCalls: [] as string[],
      holdSnapshots: false,
      holdFiles: false,
      holdStages: false,
      failSnapshot: false,
      failStageAt: 0,
      published: false,
      release() {
        control.holdSnapshots = false;
        control.holdFiles = false;
        control.holdStages = false;
        for (const release of waiters.splice(0)) release();
      },
    };
    window.changesRefreshTest = control;

    async function stage(path: string) {
      control.stageCalls.push(path);
      if (control.holdStages) await new Promise<void>((resolve) => waiters.push(resolve));
      await new Promise((resolve) => setTimeout(resolve, 35));

      if (control.failStageAt === control.stageCalls.length) {
        throw new Error("Couldn’t stage this file");
      }

      staged.add(path);
    }

    async function unstage(path: string) {
      control.unstageCalls.push(path);
      await new Promise((resolve) => setTimeout(resolve, 35));
      staged.delete(path);
    }

    const handlers: Partial<DesktopHandlers> = {
      loadWorkspaceSession: async () => ({
        openRepos: ["/projects/changes"],
        activeRepo: "/projects/changes",
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
      getGitSnapshot: async () => {
        control.snapshotReads += 1;
        if (control.holdSnapshots) await new Promise<void>((resolve) => waiters.push(resolve));
        if (control.failSnapshot) throw new Error("Repository temporarily busy");
        return {
          repoRoot: "/projects/changes",
          branch: "main",
          staged: [
            { path: "docs/readme.md", previousPath: null, status: "modified" },
            ...files.filter((file) => staged.has(file.path)),
          ],
          unstaged: files.filter((file) => !staged.has(file.path)),
          untracked: [],
        };
      },
      getRepoFiles: async () => {
        control.fileReads += 1;
        if (control.holdFiles) await new Promise<void>((resolve) => waiters.push(resolve));
        return files.map((file) => ({ path: file.path, status: "modified" as const }));
      },
      getFileVersions: async (_repo, path) => ({
        oldFile: { name: path, contents: "const value = 1;" },
        newFile: { name: path, contents: "const value = 2;" },
      }),
      stageFile: async (_repo, path) => {
        await stage(path);
      },
      unstageFile: async (_repo, path) => {
        await unstage(path);
      },
      stageFiles: async (_repo, paths) => {
        for (const path of paths) await stage(path);
      },
      unstageFiles: async (_repo, paths) => {
        for (const path of paths) await unstage(path);
      },
      getGitRepositoryState: async () => ({
        branch: "main",
        upstream: "origin/main",
        ahead: 0,
        behind: 0,
        remotes: ["origin"],
        operation: null,
        conflicts: [],
        lastCommit: control.published
          ? { id: "a".repeat(40), message: "Published commit", published: true }
          : null,
        branches: [],
        tags: [],
        stashes: [],
        worktrees: [],
        incoming: [],
        outgoing: [],
      }),
      resolveHostedRepo: async () => null,
      listProviderConnections: async () => [],
      syncLspDocument: async () => {},
      closeLspDocument: async () => {},
    };
    const bridge = Object.fromEntries(
      Object.entries(handlers).map(([method, handler]) => [
        method,
        async (...args: unknown[]) => {
          try {
            return { ok: true, value: await handler(...args) };
          } catch (cause) {
            return {
              ok: false,
              error: {
                operation: method,
                code: "busy",
                message: cause instanceof Error ? cause.message : "Repository busy",
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
  await page.setViewportSize({ width: 1440, height: 1000 });
});

for (const theme of ["light", "dark"] as const) {
  test(`retains changes geometry, scroll and selection during refresh in ${theme}`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.goto("/#/changes");
    const tree = page.locator("file-tree-container");
    const frame = page.locator('[data-slot="retained-file-list"]');
    await expect(tree).toBeVisible();
    const scroll = tree.locator('[data-file-tree-virtualized-scroll="true"]');
    await scroll.evaluate((element) => {
      element.scrollTop = 380;
    });
    const file = tree.locator('[data-item-path="Changes/src/group-c/file-02.ts"]');
    await file.click();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    const selected = tree.locator('[data-item-type="file"][aria-selected="true"]');
    const path = await selected.getAttribute("data-item-path");
    const bounds = await frame.boundingBox();
    const rowBounds = await selected.boundingBox();
    const offset = await scroll.evaluate((element) => element.scrollTop);
    const host = await tree.elementHandle();
    await page.evaluate(() => {
      window.changesRefreshTest.holdSnapshots = true;
    });
    const refresh = page.getByRole("button", { name: "Refresh repository status", exact: true });
    await refresh.click();
    await expect(frame).toHaveAttribute("aria-busy", "true");
    await expect(refresh).toHaveAttribute("aria-busy", "true");
    await expect(page.getByText("Refreshing changes…", { exact: true })).toHaveCount(0);
    expect(await frame.boundingBox()).toEqual(bounds);
    expect(await selected.boundingBox()).toEqual(rowBounds);
    expect(await scroll.evaluate((element) => element.scrollTop)).toBe(offset);
    await page.screenshot({
      path: testInfo.outputPath(`refreshing-${theme}.png`),
      animations: "disabled",
    });
    await page.evaluate(() => window.changesRefreshTest.release());
    await expect(frame).toHaveAttribute("aria-busy", "false");
    expect(await selected.getAttribute("data-item-path")).toBe(path);
    expect(await host?.evaluate((element) => element.isConnected)).toBe(true);
    expect(await frame.boundingBox()).toEqual(bounds);
    await page.evaluate(() => {
      window.changesRefreshTest.failSnapshot = true;
    });
    await refresh.click();
    await expect(page.getByRole("status").filter({ hasText: "Couldn’t refresh" })).toBeVisible();
    expect(await frame.boundingBox()).toEqual(bounds);
    expect(await selected.boundingBox()).toEqual(rowBounds);
    await page.evaluate(() => {
      window.changesRefreshTest.failSnapshot = false;
    });
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Couldn’t refresh" })).toHaveCount(0);
    expect(await frame.boundingBox()).toEqual(bounds);
  });
}

test("stages and unstages a folder with one refresh per completed group", async ({ page }) => {
  await page.goto("/#/changes");
  const tree = page.locator("file-tree-container");
  await expect(tree).toBeVisible();
  const folder = tree.locator('[data-item-path="Changes/src/group-a/"]');
  const frame = page.locator('[data-slot="retained-file-list"]');
  const bounds = await frame.boundingBox();
  const reads = await page.evaluate(() => {
    window.changesRefreshTest.holdSnapshots = true;
    return window.changesRefreshTest.snapshotReads;
  });
  await folder.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Stage folder", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.changesRefreshTest.stageCalls.length)).toBe(6);
  await expect(frame).toHaveAttribute("aria-busy", "true");
  expect(await page.evaluate(() => window.changesRefreshTest.snapshotReads)).toBe(reads + 1);
  expect(await frame.boundingBox()).toEqual(bounds);
  await expect(folder).toBeVisible();
  await page.evaluate(() => window.changesRefreshTest.release());
  const stagedFolder = tree.locator('[data-item-path="Staged Changes/src/group-a/"]');
  await expect(stagedFolder).toBeVisible();
  await expect(folder).toHaveCount(0);
  const nextReads = await page.evaluate(() => {
    window.changesRefreshTest.holdSnapshots = true;
    return window.changesRefreshTest.snapshotReads;
  });
  await stagedFolder.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Unstage folder", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.changesRefreshTest.unstageCalls.length))
    .toBe(6);
  await expect(frame).toHaveAttribute("aria-busy", "true");
  expect(await page.evaluate(() => window.changesRefreshTest.snapshotReads)).toBe(nextReads + 1);
  expect(await frame.boundingBox()).toEqual(bounds);
  await page.evaluate(() => window.changesRefreshTest.release());
  await expect(folder).toBeVisible();
});

test("refreshes partial staging results after a group failure", async ({ page }) => {
  await page.goto("/#/changes");
  const tree = page.locator("file-tree-container");
  await expect(tree).toBeVisible();
  const reads = await page.evaluate(() => {
    window.changesRefreshTest.failStageAt = 3;
    return window.changesRefreshTest.snapshotReads;
  });
  await tree.locator('[data-item-path="Changes/src/group-a/"]').click({ button: "right" });
  await page.getByRole("menuitem", { name: "Stage folder", exact: true }).click();
  await expect(page.getByText(/Failed to stage files/)).toBeVisible();
  await expect(
    tree.locator('[data-item-path="Staged Changes/src/group-a/file-01.ts"]'),
  ).toBeVisible();
  await expect(tree.locator('[data-item-path="Changes/src/group-a/file-02.ts"]')).toBeVisible();
  expect(await page.evaluate(() => window.changesRefreshTest.stageCalls.length)).toBe(3);
  expect(await page.evaluate(() => window.changesRefreshTest.snapshotReads)).toBe(reads + 1);
});

test("keeps repository files in place on initial load and background refetch", async ({
  page,
}, testInfo) => {
  await page.goto("/#/changes");
  await expect(page.locator("file-tree-container")).toBeVisible();
  await page.evaluate(() => {
    window.changesRefreshTest.holdFiles = true;
  });
  await page.getByRole("button", { name: "Repository files", exact: true }).click();
  await expect(
    page.getByRole("status", { name: "Loading repository files…", exact: true }),
  ).toBeVisible();
  const frame = page.locator('[data-slot="retained-file-list"]');
  const bounds = await frame.boundingBox();
  await page.screenshot({
    path: testInfo.outputPath("initial-file-loading.png"),
    animations: "disabled",
  });
  await page.evaluate(() => window.changesRefreshTest.release());
  const tree = page.locator("file-tree-container");
  await expect(tree).toBeVisible();
  expect(await frame.boundingBox()).toEqual(bounds);
  const host = await tree.elementHandle();
  await page.evaluate(() => {
    window.changesRefreshTest.holdFiles = true;
    window.dispatchEvent(new Event("focus"));
  });
  await expect(frame).toHaveAttribute("aria-busy", "true");
  await expect(tree).toBeVisible();
  expect(await frame.boundingBox()).toEqual(bounds);
  await expect(page.getByText("Refreshing files…", { exact: true })).toHaveCount(0);
  await page.evaluate(() => window.changesRefreshTest.release());
  await expect(frame).toHaveAttribute("aria-busy", "false");
  expect(await host?.evaluate((element) => element.isConnected)).toBe(true);
});

test("keeps the commit composer footprint stable when published status arrives", async ({
  page,
}) => {
  await page.goto("/#/changes");
  await expect(page.locator("file-tree-container")).toBeVisible();
  const frame = page.locator('[data-slot="retained-file-list"]');
  const bounds = await frame.boundingBox();
  await page.evaluate(() => {
    window.changesRefreshTest.published = true;
  });
  await page.getByRole("button", { name: "Refresh repository status", exact: true }).click();
  const undo = page.getByRole("button", { name: "Undo commit", exact: true });
  await expect(undo).toHaveAttribute("aria-description", /Last commit is published/);
  expect(await frame.boundingBox()).toEqual(bounds);
  await undo.locator("..").hover();
  await expect(page.getByRole("tooltip")).toContainText("Use Revert in History");
});

test("staging advances in rendered order only after success and skips a collapsed next group", async ({
  page,
}) => {
  await page.goto("/#/changes");
  const tree = page.locator("file-tree-container");
  await expect(tree.locator('[data-item-path="Changes/src/group-a/file-05.ts"]')).toBeVisible();
  await tree.locator('[data-item-path="Changes/src/group-b/"]').click();
  await tree.locator('[data-item-path="Changes/src/group-a/file-05.ts"]').click();
  await page.evaluate(() => {
    window.changesRefreshTest.failStageAt = 1;
  });
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(page.getByText(/Failed to stage file/)).toBeVisible();
  await expect(tree.locator('[data-item-path="Changes/src/group-a/file-05.ts"]')).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.evaluate(() => {
    window.changesRefreshTest.failStageAt = 0;
  });
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(tree.locator('[data-item-path="Changes/src/group-c/file-00.ts"]')).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(tree.locator('[data-item-path="Changes/src/group-b/"]')).toHaveAttribute(
    "aria-expanded",
    "false",
  );
});

test("staging completion uses current expansion and preserves a newer folder focus", async ({
  page,
}) => {
  await page.goto("/#/changes");
  const tree = page.locator("file-tree-container");
  const selected = tree.locator('[data-item-path="Changes/src/group-a/file-05.ts"]');
  await selected.click();
  await page.evaluate(() => {
    window.changesRefreshTest.holdStages = true;
  });
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect.poll(() => page.evaluate(() => window.changesRefreshTest.stageCalls.length)).toBe(1);
  const collapsed = tree.locator('[data-item-path="Changes/src/group-b/"]');
  await collapsed.click();
  await expect(collapsed).toHaveAttribute("aria-expanded", "false");
  await expect(collapsed).toBeFocused();
  await page.evaluate(() => window.changesRefreshTest.release());
  await expect(tree.locator('[data-item-path="Changes/src/group-c/file-00.ts"]')).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(collapsed).toHaveAttribute("aria-expanded", "false");
  await expect(collapsed).toBeFocused();
});
