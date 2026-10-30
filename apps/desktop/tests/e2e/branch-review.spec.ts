import { expect, test } from "@playwright/test";
import { createAppSettings } from "../../src/platform/desktop/appSettings";
import type { DesktopHandlers } from "../../src/platform/desktop/contracts";

if (process.env.OPEN_WARDEN_BROWSER_EXECUTABLE) {
  test.use({ launchOptions: { executablePath: process.env.OPEN_WARDEN_BROWSER_EXECUTABLE } });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ({ settings }) => {
      const files = Array.from({ length: 2400 }, (_, index) => ({
        path: `src/feature-${String(Math.floor(index / 100)).padStart(2, "0")}/file-${String(index).padStart(4, "0")}.ts`,
        previousPath: null,
        status: "modified" as const,
      }));
      const branches = [
        "main",
        "feature/current",
        ...Array.from({ length: 300 }, (_, index) => `origin/feature/branch-${index}`),
        "origin/fix/invoice-validation",
        "origin/release/very-long-branch-name-for-testing-comparison-overflow",
      ];
      const handlers: Partial<DesktopHandlers> = {
        loadWorkspaceSession: async () => ({
          openRepos: ["/projects/review"],
          activeRepo: "/projects/review",
          recentRepos: [],
        }),
        saveWorkspaceSession: async (session) => session,
        loadAppSettings: async () => settings,
        saveAppSettings: async (value) => value,
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
        getAppSettingsPath: async () => "/test/settings.json",
        getGitSnapshot: async () => ({
          repoRoot: "/projects/review",
          branch: "feature/current",
          staged: [],
          unstaged: [],
          untracked: [],
        }),
        getBranches: async () => branches,
        getCommitDetails: async (_repo, commitId) => ({
          commitId,
          shortId: commitId.slice(0, 10),
          summary: "Branch tip",
          body: "",
          author: "Test",
          authorEmail: "test@example.com",
          authoredAt: "2026-10-30T00:00:00Z",
          committer: "Test",
          committerEmail: "test@example.com",
          committedAt: "2026-10-30T00:00:00Z",
          parents: [],
        }),
        getBranchFiles: async () => files,
        getBranchFileVersions: async (_repo, base, head, path) => ({
          oldFile: { name: path, contents: `export const ref = '${base}';` },
          newFile: { name: path, contents: `export const ref = '${head}';` },
        }),
        resolveHostedRepo: async () => null,
        listProviderConnections: async () => [],
        syncLspDocument: async () => {},
        closeLspDocument: async () => {},
      };
      const bridge = Object.fromEntries(
        Object.entries(handlers).map(([method, handler]) => [
          method,
          async (...args: unknown[]) => ({ ok: true, value: await handler(...args) }),
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
    { settings: createAppSettings() },
  );
});

test("keeps selection navigation within the mounted tree for a large branch comparison", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/#/review");
  const host = page.locator("file-tree-container");
  await expect(host).toBeVisible();
  const selected = host.locator('[data-item-type="file"][aria-selected="true"]');
  await expect(selected).toHaveAttribute("aria-label", "file-0000.ts");
  await selected.click();
  await host.evaluate((element) => {
    element.dataset.addedRows = "0";
    const observer = new MutationObserver((records) => {
      const addedRows = records
        .flatMap((record) => [...record.addedNodes])
        .filter((node) => node instanceof HTMLElement && node.dataset.type === "item").length;
      element.dataset.addedRows = String(Number(element.dataset.addedRows) + addedRows);
    });
    observer.observe(element.shadowRoot!, { childList: true, subtree: true });
    element.dataset.identity = "retained";
  });
  const started = Date.now();
  for (let index = 0; index < 15; index += 1) await page.keyboard.press("j");
  await expect(selected).toHaveAttribute("aria-label", "file-0015.ts");
  const elapsedMs = Date.now() - started;
  const addedRows = Number(await host.getAttribute("data-added-rows"));
  console.log(JSON.stringify({ files: 2400, selections: 15, elapsedMs, addedRows }));
  await expect(host).toHaveAttribute("data-identity", "retained");
  expect(addedRows).toBe(0);
  expect(errors).toEqual([]);
  await testInfo.attach("navigation-cost", {
    body: JSON.stringify({ files: 2400, selections: 15, elapsedMs, addedRows }),
    contentType: "application/json",
  });
  await page.screenshot({
    path: testInfo.outputPath("branch-review-navigation.png"),
    animations: "disabled",
  });
});

for (const theme of ["light", "dark"] as const) {
  test(`searches both comparison refs, cancels and swaps in ${theme}`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/#/review");
    const base = page.getByRole("combobox", { name: "Base branch", exact: true });
    const compare = page.getByRole("combobox", { name: "Compare branch", exact: true });
    await expect(base).toHaveValue("main");
    await expect(compare).toHaveValue("feature/current");
    const selected = page.locator(
      'file-tree-container [data-item-type="file"][aria-selected="true"]',
    );
    await expect(selected).toHaveAttribute("aria-label", "file-0000.ts");

    await base.fill("invoice-validation");
    await expect(page.getByRole("option")).toHaveCount(1);
    await expect(
      page.getByRole("option", { name: "origin/fix/invoice-validation", exact: true }),
    ).toBeVisible();
    await base.press("Enter");
    await expect(base).toHaveValue("origin/fix/invoice-validation");
    await compare.fill("branch-299");
    await compare.press("Enter");
    await expect(compare).toHaveValue("origin/feature/branch-299");
    await compare.fill("no-matching-branch");
    await expect(page.getByText("No branches found.", { exact: true })).toBeVisible();
    await compare.press("Escape");
    await expect(compare).toHaveValue("origin/feature/branch-299");
    await expect(selected).toHaveAttribute("aria-label", "file-0000.ts");

    await base.fill("release/very-long");
    await expect(
      page.getByRole("option", {
        name: "origin/release/very-long-branch-name-for-testing-comparison-overflow",
        exact: true,
      }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`branch-search-${theme}-wide.png`),
      animations: "disabled",
    });
    await page.setViewportSize({ width: 1000, height: 800 });
    await page.screenshot({
      path: testInfo.outputPath(`branch-search-${theme}-narrow.png`),
      animations: "disabled",
    });
    await base.press("Enter");
    await page.getByRole("button", { name: "Swap branches", exact: true }).click();
    await expect(base).toHaveValue("origin/feature/branch-299");
    await expect(compare).toHaveValue(
      "origin/release/very-long-branch-name-for-testing-comparison-overflow",
    );
  });
}
