import { expect, test, type Locator, type Page } from "@playwright/test";
import { createAppSettings } from "../../src/platform/desktop/appSettings";
import type { DesktopHandlers } from "../../src/platform/desktop/contracts";

if (process.env.OPEN_WARDEN_BROWSER_EXECUTABLE) {
  test.use({ launchOptions: { executablePath: process.env.OPEN_WARDEN_BROWSER_EXECUTABLE } });
}

declare global {
  interface Window {
    blameTest: { fail: boolean; hold: boolean; release: () => void };
  }
}

const blameLines = Array.from({ length: 3000 }, (_, index) => {
  const line = index + 1;
  const id =
    line === 1 ? "a" : line < 13 ? "b" : line < 17 ? "0" : line < 200 ? "c" : line % 2 ? "a" : "b";
  return {
    line,
    commitId: id.repeat(40),
    author: index ? "Shpetim Alimi" : "Arsim Kosumi",
    authoredAt: "2026-10-27T12:00:00Z",
    summary: index
      ? "Preserve incoming behavior and simplify invoice validation without changing the mobile layout"
      : "Add invoice translations",
  };
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ({ settings, blameLines }) => {
      const waits: Array<() => void> = [];
      window.blameTest = {
        fail: false,
        hold: false,
        release() {
          window.blameTest.hold = false;
          for (const release of waits.splice(0)) release();
        },
      };
      const handlers: Partial<DesktopHandlers> = {
        loadWorkspaceSession: async () => ({
          openRepos: ["/projects/blame"],
          activeRepo: "/projects/blame",
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
          repoRoot: "/projects/blame",
          branch: "main",
          staged: [],
          unstaged: [],
          untracked: [],
        }),
        getRepoFiles: async () => [{ path: "src/invoice.ts" }],
        getRepoFile: async () => ({
          name: "src/invoice.ts",
          contents: Array.from(
            { length: 3000 },
            (_, index) => `export const invoice${index + 1} = 'Invoice ${index + 1}';`,
          ).join("\n"),
        }),
        getGitBlame: async () => {
          if (window.blameTest.hold) await new Promise<void>((resolve) => waits.push(resolve));
          if (window.blameTest.fail) throw new Error("Blame temporarily unavailable");
          return {
            truncated: false,
            lines: blameLines,
          };
        },
        getCommitDetails: async (_repo, id) => ({
          commitId: id,
          summary:
            "Preserve incoming behavior and simplify invoice validation without changing the mobile layout",
          body:
            "Keep the incoming invoice flow unchanged.\n\n" +
            "The validation follows the existing contract and preserves mobile behavior. ".repeat(
              30,
            ),
          author: "Shpetim Alimi",
          authorEmail: "shpetim@example.com",
          authoredAt: "2026-10-27T12:00:00Z",
          committer: "Shpetim Alimi",
          committerEmail: "shpetim@example.com",
          committedAt: "2026-10-27T12:00:00Z",
          parents: ["c".repeat(40)],
        }),
        getCommitHistory: async () => [
          {
            commitId: "b".repeat(40),
            shortId: "bbbbbbbb",
            author: "Shpetim Alimi",
            summary: "Preserve incoming behavior",
            relativeTime: "2 days ago",
          },
        ],
        getCommitFiles: async () => [
          { path: "aaa.ts", status: "modified", previousPath: null },
          { path: "src/invoice.ts", status: "modified", previousPath: null },
        ],
        getCommitFileVersions: async () => ({
          oldFile: { name: "src/invoice.ts", contents: "const invoice = 1;" },
          newFile: { name: "src/invoice.ts", contents: "const invoice = 2;" },
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
              return { ok: true, value: await handler(...args) };
            } catch (cause) {
              return {
                ok: false,
                error: {
                  operation: method,
                  code: "unavailable",
                  message: cause instanceof Error ? cause.message : "Test operation failed",
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
    },
    { settings: createAppSettings(), blameLines },
  );
});

async function openFile(page: Page) {
  await page.goto("/#/changes");
  await page.getByRole("button", { name: "Repository files", exact: true }).click();
  await page.locator('file-tree-container [data-item-path="src/"]').click();
  await page.locator('file-tree-container [data-item-path="src/invoice.ts"]').click();
  await expect(page.getByRole("button", { name: "Blame", exact: true })).toBeVisible();
  await expect(page.locator('diffs-container [data-line="1"]')).toBeVisible();
}

async function expectAligned(attribution: Locator, code: Locator) {
  const [attributionBounds, codeBounds] = await Promise.all([
    attribution.boundingBox(),
    code.boundingBox(),
  ]);
  if (!attributionBounds || !codeBounds)
    throw new Error("Both attribution and code must be rendered");
  expect(Math.abs(attributionBounds.y - codeBounds.y)).toBeLessThan(2);
}

for (const theme of ["light", "dark"] as const) {
  test(`groups attribution next to code with one scroll owner in ${theme}`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 900 });
    await openFile(page);
    const host = await page.locator("diffs-container").elementHandle();
    await page.getByRole("button", { name: "Blame", exact: true }).click();
    const gutter = page.getByRole("complementary", { name: "Line attribution" });
    const group = gutter.locator('[data-blame-start="2"]');
    await expect(group).toHaveAttribute("data-blame-end", "12");
    await expect(gutter.getByRole("button", { name: /^Lines 2–12:/ })).toHaveCount(1);
    const line = page.locator('diffs-container [data-line="2"]');
    await expectAligned(group, line);
    expect(await host?.evaluate((element) => element.isConnected)).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`blame-${theme}-wide.png`),
      animations: "disabled",
    });
    await group.getByRole("button").click();
    const details = page.getByRole("dialog", { name: "Blame commit details" });
    await expect(details.getByText(/shpetim@example.com/)).toBeVisible();
    await expect(page.locator('diffs-container [data-line="2"][data-selected-line]')).toBeVisible();
    await expect(
      page.locator('diffs-container [data-line="12"][data-selected-line]'),
    ).toBeVisible();
    await expect(page.locator('diffs-container [data-line="1"][data-selected-line]')).toHaveCount(
      0,
    );
    const cardBounds = await details.boundingBox();
    const groupBounds = await group.boundingBox();

    if (!cardBounds || !groupBounds) throw new Error("Card and selected lines must be rendered");

    expect(
      cardBounds.y + cardBounds.height <= groupBounds.y ||
        cardBounds.y >= groupBounds.y + groupBounds.height,
    ).toBe(true);
    await expect(details.locator("details")).not.toHaveAttribute("open", "");
    await details.locator("summary").click();
    await expect(details.getByText(/The validation follows/)).toBeVisible();
    await expect(
      details.getByRole("button", { name: "Open commit", exact: true }),
    ).toBeInViewport();
    await page.screenshot({
      path: testInfo.outputPath(`blame-${theme}-details.png`),
      animations: "disabled",
    });
    await page.keyboard.press("Escape");
    await expect(group.getByRole("button")).toBeFocused();
    await expect(page.locator("diffs-container [data-selected-line]")).toHaveCount(0);
    const scroll = page.locator(".file-viewer-scroll");
    await scroll.evaluate((element) => {
      element.scrollTop = 10000;
    });
    const laterGroup = gutter.locator('[data-blame-start="510"]');
    await expect(laterGroup).toBeVisible();
    const laterLine = page.locator('diffs-container [data-line="510"]');
    await expect(laterLine).toBeVisible();
    await expectAligned(laterGroup, laterLine);
    expect(await gutter.locator("[data-blame-start]").count()).toBeLessThan(80);
    await page.setViewportSize({ width: 900, height: 700 });
    const contents = page.getByRole("region", { name: "File contents", exact: true });
    await contents.focus();
    await expect(contents).toBeFocused();
    await page.screenshot({
      path: testInfo.outputPath(`blame-${theme}-narrow.png`),
      animations: "disabled",
    });
    await page.getByRole("button", { name: "Blame", exact: true }).click();
    await expect(gutter).toHaveCount(0);
    expect(await scroll.evaluate((element) => element.scrollTop)).toBe(10000);
    expect(await host?.evaluate((element) => element.isConnected)).toBe(true);
  });
}

test("keeps a viewport-sized blame range readable beside its code", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1100, height: 700 });
  await openFile(page);
  await page.getByRole("button", { name: "Blame", exact: true }).click();
  await page.locator(".file-viewer-scroll").evaluate((element) => {
    element.scrollTop = 1000;
  });
  await page.getByRole("button", { name: /^Lines 17–199:/ }).click();
  const details = page.getByRole("dialog", { name: "Blame commit details" });
  await expect(details.getByRole("button", { name: "Open commit", exact: true })).toBeInViewport();
  await expect(details).toHaveAttribute("data-side", "left");
  const card = await details.boundingBox();
  const code = await page.locator("diffs-container").boundingBox();

  if (!card || !code) throw new Error("Blame card and code must be rendered");

  expect(card.x).toBeGreaterThanOrEqual(12);
  expect(card.x + card.width).toBeLessThanOrEqual(code.x + 1);
  await page.screenshot({
    path: testInfo.outputPath("blame-long-range.png"),
    animations: "disabled",
  });
});

test("opens commit details deliberately and distinguishes working-tree lines", async ({ page }) => {
  await openFile(page);
  await page.getByRole("button", { name: "Blame", exact: true }).click();
  await page.getByRole("button", { name: /^Lines 13–16: Working tree/ }).click();
  const details = page.getByRole("dialog", { name: "Blame commit details" });
  await expect(details.getByText("These lines have not been committed yet.")).toBeVisible();
  await expect(details.getByRole("button", { name: "Open commit" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /^Lines 2–12:/ }).click();
  await details.getByRole("button", { name: "Open commit", exact: true }).click();
  await expect(page).toHaveURL(/history\?commit=b{40}/);
  await expect(page.getByRole("complementary", { name: "Line attribution" })).toHaveCount(0);
  await expect(
    page.locator('file-tree-container [data-item-path="src/invoice.ts"][aria-selected="true"]'),
  ).toBeVisible();
  await expect(page.locator(".diff-viewport-scroll")).toContainText("const invoice = 2;");
});

test("keeps code usable while blame loads and recovers a blame failure", async ({ page }) => {
  await openFile(page);
  await page.evaluate(() => {
    window.blameTest.hold = true;
  });
  await page.getByRole("button", { name: "Blame", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Loading attribution" })).toBeVisible();
  const line = page.locator('diffs-container [data-line="1"]');
  const bounds = await line.boundingBox();
  await expect(line).toBeVisible();
  await page.evaluate(() => {
    window.blameTest.fail = true;
    window.blameTest.release();
  });
  await expect(page.getByText("Couldn’t load attribution", { exact: true })).toBeVisible();
  expect(await line.boundingBox()).toEqual(bounds);
  await page.evaluate(() => {
    window.blameTest.fail = false;
  });
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Lines 2–12:/ })).toBeVisible();
  expect(await line.boundingBox()).toEqual(bounds);
});
