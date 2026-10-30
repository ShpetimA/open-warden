import { expect, test } from "@playwright/test";
import { createAppSettings } from "../../src/platform/desktop/appSettings";

if (process.env.OPEN_WARDEN_BROWSER_EXECUTABLE)
  test.use({ launchOptions: { executablePath: process.env.OPEN_WARDEN_BROWSER_EXECUTABLE } });

test.beforeEach(async ({ page }) => {
  await page.addInitScript((settings) => {
    const repo = "/projects/conflict";
    const original =
      "before\n<<<<<<< HEAD\ncurrent choice\n=======\nincoming choice\n>>>>>>> incoming\nafter\n";
    const control = {
      contents: original,
      failRead: location.search.includes("failRead"),
      failWrite: false,
      writes: 0,
    };
    Object.assign(window, { conflictTest: control });
    const fail = (code: string) => {
      throw {
        operation: "conflict-test",
        code,
        message:
          code === "conflict"
            ? "The file changed. Reload before applying."
            : "This file could not be accessed.",
      };
    };
    const handlers: Record<string, (...args: unknown[]) => unknown> = {
      loadWorkspaceSession: () =>
        JSON.parse(localStorage.getItem("test-session") ?? "null") ?? {
          openRepos: [repo],
          activeRepo: repo,
          recentRepos: [],
        },
      saveWorkspaceSession: (value) => {
        localStorage.setItem("test-session", JSON.stringify(value));
        return value;
      },
      loadAppSettings: () => settings,
      saveAppSettings: (value) => value,
      getAppSettingsPath: () => "/test/settings.json",
      getGitSnapshot: () => ({
        repoRoot: repo,
        branch: "main",
        staged: [],
        untracked: [],
        unstaged: [{ path: "file.txt", previousPath: null, status: "unmerged" }],
      }),
      getGitRepositoryState: () => ({
        branch: "main",
        upstream: "",
        ahead: 0,
        behind: 0,
        remotes: [],
        branches: [],
        tags: [],
        worktrees: [],
        operation: "merge",
        conflicts: ["file.txt"],
        lastCommit: null,
        stashes: [],
        incoming: [],
        outgoing: [],
      }),
      getRepoFile: () =>
        control.failRead ? fail("permission") : { name: "file.txt", contents: control.contents },
      getRepoFiles: () => [{ path: "file.txt" }],
      getFileVersions: () => ({ oldFile: null, newFile: null }),
      updateWorktreeFileContents: (_repo, _path, contents, expected) => {
        if (control.failWrite) fail("permission");
        if (
          !expected ||
          typeof expected !== "object" ||
          !("contents" in expected) ||
          expected.contents !== control.contents
        )
          fail("conflict");
        control.contents = String(contents);
        control.writes += 1;
      },
      listProviderConnections: () => [],
      resolveHostedRepo: () => null,
      syncLspDocument: () => {},
      closeLspDocument: () => {},
      getUpdateState: () => ({
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
    };
    const bridge = Object.fromEntries(
      Object.entries(handlers).map(([method, handler]) => [
        method,
        async (...args: unknown[]) => {
          try {
            return { ok: true, value: await handler(...args) };
          } catch (error) {
            return { ok: false, error };
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

async function openConflict(page: import("@playwright/test").Page) {
  await page.locator('file-tree-container [data-item-type="file"]').first().click();
}

for (const theme of ["light", "dark"] as const) {
  test(`retains a failed resolution and supports retry in ${theme}`, async ({ page }, info) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.setViewportSize({ width: theme === "light" ? 1280 : 1600, height: 900 });
    await page.goto("/#/changes");
    await openConflict(page);
    await page.getByTitle("Preview incoming", { exact: true }).click();
    await page.evaluate(() => {
      (window as unknown as { conflictTest: { failWrite: boolean } }).conflictTest.failWrite = true;
    });
    await page.getByRole("button", { name: "Apply", exact: true }).first().click();
    await expect(page.getByText("Conflict resolution wasn’t saved")).toBeVisible();
    await expect(page.getByText("Preview mode · incoming")).toBeVisible();
    await page.screenshot({
      path: info.outputPath(`conflict-error-${theme}.png`),
      animations: "disabled",
    });
    await page.evaluate(() => {
      (window as unknown as { conflictTest: { failWrite: boolean } }).conflictTest.failWrite =
        false;
    });
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(
      page.getByText("All conflict markers are resolved.", { exact: false }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => (window as unknown as { conflictTest: { contents: string } }).conflictTest.contents,
      ),
    ).toBe("before\nincoming choice\nafter\n");
  });
}

test("read failures have recovery instead of appearing as missing conflict content", async ({
  page,
}) => {
  await page.goto("/?failRead=1#/changes");
  await openConflict(page);
  await expect(page.getByText("Couldn’t load this conflict")).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as { conflictTest: { failRead: boolean } }).conflictTest.failRead = false;
  });
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByTitle("Preview current", { exact: true })).toBeVisible();
});

test("an external edit is preserved and the previous choice remains visible after reloading", async ({
  page,
}, info) => {
  await page.goto("/#/changes");
  await openConflict(page);
  await page.getByTitle("Preview incoming", { exact: true }).click();
  await page.evaluate(() => {
    (window as unknown as { conflictTest: { contents: string } }).conflictTest.contents =
      "external edit\n<<<<<<< HEAD\nnew current\n=======\nnew incoming\n>>>>>>> incoming\n";
  });
  await page.getByRole("button", { name: "Apply", exact: true }).first().click();
  await expect(page.getByText("Conflict resolution wasn’t saved")).toBeVisible();
  await page.getByRole("button", { name: "Reload file", exact: true }).click();
  await expect(page.getByText("Your previous preview is kept", { exact: false })).toBeVisible();
  await expect(page.getByText("Preview mode · incoming")).toBeVisible();
  await expect(page.getByRole("button", { name: "Apply", exact: true }).last()).toBeDisabled();
  expect(
    await page.evaluate(
      () => (window as unknown as { conflictTest: { writes: number } }).conflictTest.writes,
    ),
  ).toBe(0);
  await page.screenshot({ path: info.outputPath("conflict-stale.png"), animations: "disabled" });
});

test("commit drafts survive a renderer restart", async ({ page }) => {
  await page.goto("/#/changes");
  await page
    .getByRole("textbox", { name: "Commit message", exact: true })
    .fill("Keep this unfinished commit message");
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem("test-session") ?? "{}").workspaceTabs?.views,
      ),
    )
    .toBeTruthy();
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.stringify(
          JSON.parse(localStorage.getItem("test-session") ?? "{}").workspaceTabs?.views,
        ),
      ),
    )
    .toContain("Keep this unfinished commit message");
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Commit message", exact: true })).toHaveValue(
    "Keep this unfinished commit message",
  );
});

for (const scenario of [
  {
    label: "a previously empty file",
    oldContents: "",
    newContents: "added\n",
    bucket: "unstaged",
    action: "Stage hunk",
  },
  {
    label: "a file emptied without deletion",
    oldContents: "before\n",
    newContents: "",
    bucket: "unstaged",
    action: "Stage hunk",
  },
  {
    label: "a newly staged file",
    oldContents: null,
    newContents: "added\n",
    bucket: "staged",
    action: "Unstage hunk",
  },
] as const) {
  test(`hunk writes preserve absence versus empty contents for ${scenario.label}`, async ({
    page,
  }) => {
    await page.addInitScript(({ oldContents, newContents, bucket }) => {
      const bridge = window.desktopBridge!;
      const file = { path: "file.txt", previousPath: null, status: "modified" as const };
      bridge.getGitSnapshot = async () => ({
        ok: true,
        value: {
          repoRoot: "/projects/conflict",
          branch: "main",
          staged: bucket === "staged" ? [file] : [],
          unstaged: bucket === "unstaged" ? [file] : [],
          untracked: [],
        },
      });
      bridge.getFileVersions = async () => ({
        ok: true,
        value: {
          oldFile: oldContents === null ? null : { name: "file.txt", contents: oldContents },
          newFile: { name: "file.txt", contents: newContents },
        },
      });
      bridge.updateIndexFileContents = async (_repo, _path, _contents, expected) => {
        localStorage.setItem("hunk-expected", JSON.stringify(expected));
        return { ok: true, value: undefined };
      };
    }, scenario);
    await page.goto("/#/changes");
    await page.getByRole("treeitem", { name: "file.txt", exact: true }).click();
    await page.getByRole("button", { name: scenario.action, exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("hunk-expected")))
      .not.toBeNull();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("hunk-expected")!))).toEqual({
      kind: "diff",
      bucket: scenario.bucket,
      oldContents: scenario.oldContents,
      newContents: scenario.newContents,
    });
  });
}
