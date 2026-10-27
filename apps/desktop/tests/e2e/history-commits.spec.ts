import { expect, test } from "@playwright/test";

import { createAppSettings } from "../../src/platform/desktop/appSettings";
import type { DesktopBridge, HistoryCommit } from "../../src/platform/desktop/contracts";

if (process.env.OPEN_WARDEN_BROWSER_EXECUTABLE) {
  test.use({ launchOptions: { executablePath: process.env.OPEN_WARDEN_BROWSER_EXECUTABLE } });
}

const commits: HistoryCommit[] = [
  {
    commitId: "newest123",
    shortId: "newest123",
    summary: "Update invoice state URLs and split the onboarding flow",
    author: "Alice",
    relativeTime: "21 minutes ago",
  },
  {
    commitId: "middle123",
    shortId: "middle123",
    summary: "Store signup steps in the database",
    author: "Bob",
    relativeTime: "40 minutes ago",
  },
  {
    commitId: "oldest123",
    shortId: "oldest123",
    summary: "Type mock bodies and derive response contracts",
    author: "Alice",
    relativeTime: "47 minutes ago",
  },
  ...Array.from({ length: 30 }, (_, index) => ({
    commitId: `earlier${index}`,
    shortId: `earlier${index}`,
    summary: `Earlier invoice change ${index}`,
    author: "Carol",
    relativeTime: "2 days ago",
  })),
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ({ commits, settings }) => {
      const bridge: Partial<DesktopBridge> = {
        loadWorkspaceSession: async () => ({
          openRepos: ["/projects/invoice"],
          activeRepo: "/projects/invoice",
          recentRepos: [],
        }),
        saveWorkspaceSession: async (session) => session,
        loadAppSettings: async () => settings,
        saveAppSettings: async (value) => value,
        getAppSettingsPath: async () => "/test/settings.json",
        onUpdateState: () => () => {},
        onLspDiagnostics: () => () => {},
        onAppSettingsChanged: () => () => {},
        onGuidanceNavigate: () => () => {},
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
          repoRoot: "/projects/invoice",
          branch: "main",
          staged: [],
          unstaged: [],
          untracked: [],
        }),
        getCommitHistory: async () => commits,
        getCommitFiles: async () => [
          { path: "src/invoice.ts", previousPath: null, status: "modified" },
        ],
        getCommitFileVersions: async (_repo, commitId, path) => ({
          oldFile: { name: path, contents: "export const revision = 'parent';" },
          newFile: { name: path, contents: `export const revision = '${commitId}';` },
        }),
        getBranchFiles: async () => [
          { path: "src/combined.ts", previousPath: null, status: "modified" },
        ],
        getBranchFileVersions: async (_repo, base, head, path) => ({
          oldFile: { name: path, contents: `export const range = '${base}';` },
          newFile: { name: path, contents: `export const range = '${base}..${head}';` },
        }),
        getCommitDetails: async (_repo, commitId) => ({
          commitId,
          summary: commits.find((commit) => commit.commitId === commitId)?.summary ?? commitId,
          body: "Keep invoice navigation stable while splitting the onboarding flow.",
          author: "Alice",
          authorEmail: "alice@example.com",
          authoredAt: "2026-10-25T18:00:00+02:00",
          committer: "Alice",
          committerEmail: "alice@example.com",
          committedAt: "2026-10-25T18:00:00+02:00",
          parents: ["parent123"],
        }),
        resolveHostedRepo: async () => null,
        listProviderConnections: async () => [],
        syncLspDocument: async () => {},
        closeLspDocument: async () => {},
      };
      Object.defineProperty(window, "desktopBridge", { value: bridge });
    },
    { commits, settings: createAppSettings() },
  );
});

for (const theme of ["light", "dark"] as const) {
  test(`shares the compact commit design and preserves history comparison in ${theme}`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/#/history");
    const pane = page.getByRole("complementary", { name: "History commits", exact: true });
    const rows = pane.locator('[data-slot="commit-row"]');
    const newest = pane.getByRole("button", { name: /Update invoice state URLs/ });
    const middle = pane.getByRole("button", { name: /Store signup steps/ });
    await expect(newest).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByText("export const revision = 'newest123';", { exact: true }),
    ).toBeVisible();
    expect((await rows.first().boundingBox())?.height).toBeLessThanOrEqual(48);
    const firstBounds = await rows.nth(0).boundingBox();
    const secondBounds = await rows.nth(1).boundingBox();
    if (!firstBounds || !secondBounds) throw new Error("Missing commit row bounds");
    expect(secondBounds.y).toBe(firstBounds.y + firstBounds.height);
    await page.screenshot({
      path: testInfo.outputPath(`history-${theme}-wide.png`),
      animations: "disabled",
    });

    const newestCheck = pane.getByRole("checkbox", { name: /Include Update invoice state URLs/ });
    const middleCheck = pane.getByRole("checkbox", { name: /Include Store signup steps/ });
    const oldestCheck = pane.getByRole("checkbox", { name: /Include Type mock bodies/ });
    await newestCheck.check();
    await expect(pane.getByRole("status")).toHaveText("Select one more commit to combine");
    await middleCheck.check();
    await expect(pane.getByRole("status")).toHaveText("Showing combined changes");
    await expect(newestCheck).toBeChecked();
    await expect(middleCheck).toBeChecked();
    await expect(oldestCheck).toBeDisabled();
    await expect(
      page.getByText("export const range = 'middle123^..newest123';", { exact: true }),
    ).toBeVisible();
    await page.setViewportSize({ width: 1000, height: 740 });
    await page.screenshot({
      path: testInfo.outputPath(`history-${theme}-comparison-narrow.png`),
      animations: "disabled",
    });
    await middleCheck.uncheck();
    await expect(oldestCheck).toBeEnabled();
    await pane.getByRole("button", { name: "Clear", exact: true }).click();
    await expect(pane.getByRole("status")).toHaveCount(0);
    await expect(newestCheck).not.toBeChecked();

    await middle.click({ button: "right" });
    await expect(page.getByRole("menuitem", { name: "Revert commit…" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Cherry-pick commit…" })).toBeVisible();
    await page.keyboard.press("Escape");
    await newest.click();
    await page.keyboard.press("h");
    await expect(newest).toBeFocused();
    await page.keyboard.press("j");
    await expect(middle).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("/");
    const filter = pane.getByRole("textbox", { name: "Filter commits", exact: true });
    await expect(filter).toBeFocused();
    await filter.fill("Bob");
    await expect(rows).toHaveCount(1);
    await expect(middle).toBeVisible();
    await filter.fill("no matching commit");
    await expect(pane.getByText("No matching commits.")).toBeVisible();
    await filter.clear();

    const filterTop = (await filter.boundingBox())?.y;
    await pane.locator('[data-nav-region="history-commits"]').evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    expect((await filter.boundingBox())?.y).toBe(filterTop);
    await expect(filter).toBeVisible();
    await pane.locator('[data-nav-region="history-commits"]').evaluate((element) => {
      element.scrollTop = 0;
    });
    await newest.hover();
    await expect(
      page.getByRole("tooltip").getByText(/Keep invoice navigation stable/),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("tooltip")).toBeHidden();
  });
}

test("shows an empty history with the shared pane", async ({ page }) => {
  await page.addInitScript(() => {
    if (window.desktopBridge) window.desktopBridge.getCommitHistory = async () => [];
  });
  await page.goto("/#/history");
  await expect(page.getByText("No commits found.", { exact: true })).toBeVisible();
});

test("shows history loading failures in the shared pane", async ({ page }) => {
  await page.addInitScript(() => {
    if (window.desktopBridge)
      window.desktopBridge.getCommitHistory = async () => {
        throw new Error("History unavailable");
      };
  });
  await page.goto("/#/history");
  await expect(page.getByRole("alert").filter({ hasText: "History unavailable" })).toBeVisible();
});
