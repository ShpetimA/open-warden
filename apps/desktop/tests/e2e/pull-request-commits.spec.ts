import { expect, test } from "@playwright/test";

import { createAppSettings } from "../../src/platform/desktop/appSettings";
import type {
  DesktopBridge,
  HistoryCommit,
  PullRequestDetail,
} from "../../src/platform/desktop/contracts";

if (process.env.OPEN_WARDEN_BROWSER_EXECUTABLE) {
  test.use({ launchOptions: { executablePath: process.env.OPEN_WARDEN_BROWSER_EXECUTABLE } });
}

const detail: PullRequestDetail = {
  id: "114",
  providerId: "bitbucket",
  number: 114,
  title: "Validate invoice amounts",
  body: "Reject negative amounts before saving.",
  state: "open",
  isDraft: false,
  author: { login: "alice", displayName: "Alice", avatarUrl: null },
  url: "https://bitbucket.org/team/invoice/pull-requests/114",
  baseRef: "main",
  headRef: "validation",
  baseSha: "base123",
  headSha: "head123",
  createdAt: "2026-10-25T18:00:00Z",
  updatedAt: "2026-10-25T18:00:00Z",
  labels: [],
};

const commits: HistoryCommit[] = [
  {
    commitId: "head123",
    shortId: "head123",
    summary: "Test negative invoice amounts",
    author: "Alice",
    relativeTime: "1 hour ago",
  },
  {
    commitId: "first123",
    shortId: "first123",
    summary: "Validate invoice amounts before saving and report an actionable error",
    author: "Alice with a long display name",
    relativeTime: "2 hours ago",
  },
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ({ detail, commits, settings }) => {
      const files = ["src/invoice.ts", "test/invoice.test.ts"].map((path) => ({
        path,
        previousPath: null,
        status: "modified" as const,
      }));
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
        resolveHostedRepo: async () => ({
          providerId: "bitbucket",
          owner: "team",
          repo: "invoice",
          remoteName: "origin",
          remoteUrl: "git@bitbucket.org:team/invoice.git",
          webUrl: "https://bitbucket.org/team/invoice",
        }),
        getPullRequestConversation: async () => ({ detail, issueComments: [], reviewThreads: [] }),
        preparePullRequestCompareRefs: async () => ({
          providerId: "bitbucket",
          owner: "team",
          repo: "invoice",
          pullRequestNumber: 114,
          baseRef: "main",
          headRef: "validation",
          compareBaseRef: "base123",
          compareHeadRef: "head123",
          localBranch: "validation",
        }),
        getBranchCommits: async () => commits,
        getBranchFiles: async (_repo, base) => {
          if (base === "head123^") return files.slice(0, 1);
          if (base === "first123^") return files.slice(0, 1);
          return files;
        },
        getBranchFileVersions: async (_repo, base, head, path) => ({
          oldFile: { name: path, contents: `export const revision = '${base}';\n` },
          newFile: { name: path, contents: `export const revision = '${head}';\n` },
        }),
        getPullRequestViewedFiles: async () => ({
          storage: "device",
          viewedPaths: [],
          truncated: false,
        }),
        listProviderConnections: async () => [],
        syncLspDocument: async () => {},
        closeLspDocument: async () => {},
      };
      Object.defineProperty(window, "desktopBridge", { value: bridge });
    },
    { detail, commits, settings: createAppSettings() },
  );
});

for (const theme of ["light", "dark"] as const) {
  test(`scopes files and diffs to a commit with compact spacing in ${theme} theme`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 1000 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/#/pull-requests/bitbucket/team/invoice/114/files");
    const sidebar = page.getByRole("complementary", { name: "Changed files", exact: true });
    const filesTab = page.getByRole("tab", { name: "Files", exact: true });
    const commitsTab = page.getByRole("tab", { name: "Commits" });
    await expect(sidebar.getByText("2 files · 0 viewed", { exact: true })).toBeVisible();
    await expect(filesTab).toHaveAttribute("aria-selected", "true");
    await expect(
      page.getByText("export const revision = 'base123';", { exact: false }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`files-${theme}-wide.png`),
      animations: "disabled",
    });

    await filesTab.focus();
    await page.keyboard.press("ArrowRight");
    await expect(commitsTab).toHaveAttribute("aria-selected", "true");
    const newestCommit = page.getByRole("button", { name: /Test negative invoice amounts/ });
    const firstCommit = page.getByRole("button", { name: /Validate invoice amounts before/ });
    await expect(newestCommit).toHaveAttribute("aria-pressed", "true");
    await expect(sidebar.getByText("1 file", { exact: true })).toBeVisible();
    await expect(
      page.getByText("export const revision = 'head123^';", { exact: false }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Mark file viewed", exact: true })).toHaveCount(
      0,
    );
    await page.screenshot({
      path: testInfo.outputPath(`commits-${theme}-wide.png`),
      animations: "disabled",
    });

    await firstCommit.click();
    await expect(firstCommit).toHaveAttribute("aria-pressed", "true");
    await expect(newestCommit).toHaveAttribute("aria-pressed", "false");
    await expect(
      page.getByText("export const revision = 'first123^';", { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByText("export const revision = 'first123';", { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByText("export const revision = 'head123^';", { exact: false }),
    ).toHaveCount(0);
    await sidebar.getByRole("textbox", { name: "Filter changed files" }).fill("missing.ts");
    await expect(sidebar.getByText("No files match the current filter.")).toBeVisible();
    await sidebar.getByRole("textbox", { name: "Filter changed files" }).clear();
    await expect(sidebar.getByText("1 file", { exact: true })).toBeVisible();

    await page.setViewportSize({ width: 1000, height: 740 });
    await expect(firstCommit).toBeVisible();
    await expect(sidebar.getByRole("textbox", { name: "Filter changed files" })).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`commits-${theme}-narrow.png`),
      animations: "disabled",
    });
    await filesTab.click();
    await expect(filesTab).toHaveAttribute("aria-selected", "true");
    await expect(commitsTab).toHaveAttribute("aria-selected", "false");
    await expect(sidebar.getByText("2 files · 0 viewed", { exact: true })).toBeVisible();
    await expect(
      page.getByText("export const revision = 'base123';", { exact: false }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`files-${theme}-narrow.png`),
      animations: "disabled",
    });
    expect(errors).toEqual([]);
  });
}

test("shows commit loading failures and allows returning to all files", async ({ page }) => {
  await page.goto("/#/pull-requests/bitbucket/team/invoice/114/files");
  const sidebar = page.getByRole("complementary", { name: "Changed files", exact: true });
  await expect(sidebar.getByText("2 files · 0 viewed")).toBeVisible();
  await page.evaluate(() => {
    if (window.desktopBridge) {
      window.desktopBridge.getBranchCommits = async () => {
        throw new Error("Could not load PR commits");
      };
    }
  });
  await page.getByRole("tab", { name: "Commits" }).click();
  await expect(
    page
      .getByRole("complementary", { name: "Pull request commits", exact: true })
      .getByRole("alert"),
  ).toHaveText("Could not load PR commits");
  await page.getByRole("tab", { name: "Files", exact: true }).click();
  await expect(sidebar.getByText("2 files · 0 viewed")).toBeVisible();
});

test("keeps commits loading until the list arrives and handles an empty range", async ({
  page,
}) => {
  await page.goto("/#/pull-requests/bitbucket/team/invoice/114/files");
  const sidebar = page.getByRole("complementary", { name: "Changed files", exact: true });
  await expect(sidebar.getByText("2 files · 0 viewed")).toBeVisible();
  await page.evaluate(() => {
    if (window.desktopBridge) {
      window.desktopBridge.getBranchCommits = () =>
        new Promise((resolve) => {
          window.addEventListener("qa-commits-ready", () => resolve([]), { once: true });
        });
    }
  });
  await page.getByRole("tab", { name: "Commits" }).click();
  await expect(
    page
      .getByRole("complementary", { name: "Pull request commits", exact: true })
      .getByRole("status"),
  ).toHaveText(/Loading commits/);
  await expect(page.getByText("No commits in this pull request.", { exact: true })).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new Event("qa-commits-ready")));
  await expect(page.getByText("No commits in this pull request.", { exact: true })).toBeVisible();
  await expect(sidebar.getByRole("status")).toHaveCount(0);
});

test("uses History-style pane navigation and independent Cmd+S / Cmd+D toggles", async ({
  page,
}) => {
  await page.goto("/#/pull-requests/bitbucket/team/invoice/114/files");
  await page.getByRole("tab", { name: "Commits", exact: true }).click();
  const commitPane = page.getByRole("complementary", { name: "Pull request commits", exact: true });
  const filePane = page.getByRole("complementary", { name: "Changed files", exact: true });
  const firstCommit = commitPane.getByRole("button", { name: /Validate invoice amounts before/ });
  await expect(commitPane).toBeVisible();
  await expect(filePane).toBeVisible();
  await page.keyboard.press("h");
  await page.keyboard.press("j");
  await expect(firstCommit).toHaveAttribute("aria-pressed", "true");
  await expect(firstCommit).toBeFocused();
  await expect(
    page.getByText("export const revision = 'first123^';", { exact: false }),
  ).toBeVisible();

  await page.keyboard.press("l");
  await expect
    .poll(() =>
      page.evaluate(() => document.activeElement?.closest("aside")?.getAttribute("aria-label")),
    )
    .toBe("Changed files");
  await page.keyboard.press("j");
  await expect(firstCommit).toHaveAttribute("aria-pressed", "true");

  await page.keyboard.press("Meta+d");
  await expect(filePane).toBeHidden();
  await expect(commitPane).toBeVisible();
  await page.keyboard.press("Meta+d");
  await expect(filePane).toBeVisible();
  await page.keyboard.press("Meta+s");
  await expect(commitPane).toBeHidden();
  await expect(filePane).toBeVisible();
  await page.keyboard.press("h");
  await expect(commitPane).toBeVisible();
  await expect(firstCommit).toBeFocused();
});

for (const theme of ["light", "dark"] as const) {
  test(`groups repeated file changes under commit titles in ${theme} theme`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/#/pull-requests/bitbucket/team/invoice/114/files");
    const files = page.getByRole("complementary", { name: "Changed files", exact: true });
    await files.getByRole("button", { name: "Group review files: Review groups" }).click();
    await page.getByRole("menuitemradio", { name: "Commits", exact: true }).click();
    await expect(files.getByText("2 commits", { exact: true })).toBeVisible();
    const repeatedFiles = files.getByRole("treeitem", { name: "invoice.ts", exact: true });
    await expect(repeatedFiles).toHaveCount(2);
    const heading = files.getByRole("treeitem", {
      name: "Test negative invoice amounts · head123",
      exact: true,
    });
    await heading.click();
    await expect(heading).toHaveAttribute("aria-expanded", "false");
    await expect(repeatedFiles).toHaveCount(1);
    await heading.click();
    await expect(heading).toHaveAttribute("aria-expanded", "true");
    await expect(repeatedFiles).toHaveCount(2);
    await repeatedFiles.nth(1).click();
    await expect(
      page.getByText("export const revision = 'first123^';", { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByText("export const revision = 'first123';", { exact: false }),
    ).toBeVisible();
    await page.keyboard.press("k");
    await expect(
      page.getByText("export const revision = 'head123^';", { exact: false }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`grouped-${theme}-wide.png`),
      animations: "disabled",
    });
    await page.setViewportSize({ width: 1000, height: 740 });
    await page.screenshot({
      path: testInfo.outputPath(`grouped-${theme}-narrow.png`),
      animations: "disabled",
    });
    await files.getByRole("button", { name: "Group review files: Commits" }).click();
    await page.getByRole("menuitemradio", { name: "Folders", exact: true }).click();
    await expect(files.getByText("2 files · 0 viewed", { exact: true })).toBeVisible();
    await expect(
      page.getByText("export const revision = 'base123';", { exact: false }),
    ).toBeVisible();
  });
}
