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
          workspaceTabs: {
            items: [
              { id: "/projects/invoice", kind: "repo", repoPath: "/projects/invoice" },
              {
                id: "pr-invoice-114",
                kind: "pull-request",
                repoPath: "/projects/invoice",
                providerId: "bitbucket",
                owner: "team",
                repo: "invoice",
                pullRequestNumber: 114,
                title: detail.title,
              },
            ],
            activeWorkspaceId: "pr-invoice-114",
            activeByProject: { "/projects/invoice": "pr-invoice-114" },
            locations: { "pr-invoice-114": "/pull-requests/bitbucket/team/invoice/114/files" },
            views: {},
            memory: {},
          },
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
        getCommitDetails: async (_repo, commitId) => ({
          commitId,
          summary: commits.find((commit) => commit.commitId === commitId)?.summary ?? commitId,
          body: "Keep negative amounts out of generated invoices.\n\nRefs: OF-11384",
          author: "Alice",
          authorEmail: "alice@example.com",
          authoredAt: "2026-10-25T18:00:00+02:00",
          committer: "Bob",
          committerEmail: "bob@example.com",
          committedAt: "2026-10-25T19:00:00+02:00",
          parents: ["parent123456789"],
        }),
        getBranchFiles: async (_repo, base) => {
          if (base === "head123^") return files.slice(0, 1);
          if (base === "first123^") return files.slice(0, 1);
          return files;
        },
        getBranchFileVersions: async (_repo, base, head, path) => ({
          oldFile: {
            name: path,
            contents:
              `export const revision = '${base}';\n` +
              Array.from(
                { length: 12 },
                (_, index) => `export const line${index + 2} = '${base}';`,
              ).join("\n"),
          },
          newFile: {
            name: path,
            contents:
              `export const revision = '${head}';\n` +
              Array.from(
                { length: 12 },
                (_, index) => `export const line${index + 2} = '${head}';`,
              ).join("\n"),
          },
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

for (const theme of ["light", "dark"] as const) {
  test(`shows full folder and commit hover details with continuous review borders in ${theme}`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.goto("/#/pull-requests/bitbucket/team/invoice/114/files");
    const sections = page.getByRole("navigation", { name: "Review sections" });
    await expect(sections).toBeVisible();
    const borders = await sections.evaluate((element) => {
      const parent = element.parentElement;
      if (!parent) throw new Error("Missing review header");
      const bounds = element.getBoundingClientRect();
      const parentBounds = parent.getBoundingClientRect();
      return {
        top: bounds.top - parentBounds.top,
        bottom: parentBounds.bottom - bounds.bottom,
        leftBorder: getComputedStyle(element).borderLeftWidth,
        bottomBorder: getComputedStyle(parent).borderBottomWidth,
        stripHeight: parent.querySelector('[data-slot="workspace-tabs"]')?.getBoundingClientRect()
          .height,
        parentHeight: parentBounds.height,
      };
    });
    expect(borders.top).toBe(0);
    expect(borders.bottom).toBe(1);
    expect(borders.leftBorder).toBe("1px");
    expect(borders.bottomBorder).toBe("1px");
    expect(borders.stripHeight).toBe(borders.parentHeight - 1);

    const files = page.getByRole("complementary", { name: "Changed files", exact: true });
    await files.getByRole("button", { name: "Group review files: Review groups" }).click();
    await page.getByRole("menuitemradio", { name: "Commits", exact: true }).click();
    const heading = files.getByRole("treeitem", {
      name: "Validate invoice amounts before saving and report an actionable error · first123",
      exact: true,
    });
    await heading.hover();
    const tooltip = page.getByRole("tooltip");
    await expect(
      tooltip.getByText("Validate invoice amounts before saving and report an actionable error", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      tooltip.getByText(/Keep negative amounts out of generated invoices/),
    ).toBeVisible();
    await expect(tooltip.getByText("Alice <alice@example.com>", { exact: true })).toBeVisible();
    await expect(tooltip.getByText("Bob <bob@example.com>", { exact: true })).toBeVisible();
    await expect(tooltip.getByText("parent123456789", { exact: true })).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`commit-hover-${theme}.png`),
      animations: "disabled",
    });

    await page.getByRole("tab", { name: "Commits", exact: true }).hover();
    await expect(tooltip).toBeHidden();
    await files.getByRole("treeitem", { name: "src", exact: true }).first().hover();
    await expect(tooltip).toHaveText("Test negative invoice amounts · head123/src");
    await page.getByRole("tab", { name: "Commits", exact: true }).click();
    await page
      .getByRole("complementary", { name: "Pull request commits", exact: true })
      .getByRole("button", { name: /Validate invoice amounts before/ })
      .hover();
    await expect(
      tooltip.getByText(/Keep negative amounts out of generated invoices/),
    ).toBeVisible();
  });

  test(`highlights a range while dragging from line numbers or the plus gutter in ${theme}`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.goto("/#/pull-requests/bitbucket/team/invoice/114/files");
    const start = page.locator('[data-additions] [data-column-number="2"]');
    const end = page.locator('[data-additions] [data-column-number="5"]');
    await expect(start).toBeVisible();
    const startBounds = await start.boundingBox();
    const endBounds = await end.boundingBox();
    if (!startBounds || !endBounds) throw new Error("Missing diff gutter bounds");
    const selected = page.locator("[data-additions] [data-line][data-selected-line]");
    const composer = page.getByPlaceholder("Leave a comment...");

    await page.mouse.move(
      startBounds.x + startBounds.width - 5,
      startBounds.y + startBounds.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(endBounds.x + endBounds.width - 5, endBounds.y + endBounds.height / 2, {
      steps: 8,
    });
    await expect(selected).toHaveCount(4);
    await expect(composer).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath(`drag-line-numbers-${theme}.png`),
      animations: "disabled",
    });
    await page.mouse.up();
    await expect(composer).toBeVisible();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();

    await start.hover();
    const plus = page.locator("[data-additions] [data-utility-button]");
    await expect(plus).toBeVisible();
    const plusBounds = await plus.boundingBox();
    if (!plusBounds) throw new Error("Missing comment button bounds");
    await page.mouse.move(
      plusBounds.x + plusBounds.width / 2,
      plusBounds.y + plusBounds.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(endBounds.x + endBounds.width - 5, endBounds.y + endBounds.height / 2, {
      steps: 8,
    });
    await expect(selected).toHaveCount(4);
    await expect(composer).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath(`drag-plus-gutter-${theme}.png`),
      animations: "disabled",
    });
    await page.mouse.up();
    await expect(composer).toBeVisible();
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

test("delays the first commit hover, skips the delay within the group, and resets after leaving", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#/pull-requests/bitbucket/team/invoice/114/files");
  await page.getByRole("tab", { name: "Commits", exact: true }).click();
  const pane = page.getByRole("complementary", { name: "Pull request commits", exact: true });
  const newest = pane.getByRole("button", { name: /Test negative invoice amounts/ });
  const older = pane.getByRole("button", { name: /Validate invoice amounts before/ });
  await expect(newest).toBeVisible();
  await expect(older).toBeVisible();
  const newestBounds = await newest.boundingBox();
  const olderBounds = await older.boundingBox();
  if (!newestBounds || !olderBounds) throw new Error("Missing commit bounds");
  const tooltip = page.getByRole("tooltip");
  await page.mouse.move(1200, 600);
  await page.clock.install();
  await page.clock.pauseAt(new Date("2030-01-01T12:00:00Z"));

  await page.mouse.move(newestBounds.x + 30, newestBounds.y + 10);
  await page.clock.runFor(699);
  expect(await tooltip.count()).toBe(0);
  await page.clock.runFor(1);
  await expect(tooltip).toContainText("Test negative invoice amounts");

  await page.mouse.move(olderBounds.x + 30, olderBounds.y + 10);
  await expect(tooltip).toContainText("Validate invoice amounts before", { timeout: 200 });
  await page.mouse.move(1200, 600);
  await page.clock.runFor(150);
  expect(await tooltip.count()).toBe(0);
  await page.mouse.move(newestBounds.x + 30, newestBounds.y + 10);
  await expect(tooltip).toContainText("Test negative invoice amounts", { timeout: 200 });

  await page.mouse.move(1200, 600);
  await page.clock.runFor(450);
  await page.mouse.move(olderBounds.x + 30, olderBounds.y + 10);
  await page.clock.runFor(699);
  expect(await tooltip.count()).toBe(0);
  await page.clock.runFor(1);
  await expect(tooltip).toContainText("Validate invoice amounts before");

  await page.keyboard.press("h");
  await page.keyboard.press("j");
  await page.clock.runFor(1000);
  expect(await tooltip.count()).toBe(0);
  await page.mouse.move(1200, 600);
  await page.mouse.move(newestBounds.x + 30, newestBounds.y + 10);
  await page.clock.runFor(300);
  await page.keyboard.press("k");
  await page.clock.runFor(1000);
  expect(await tooltip.count()).toBe(0);
});

test("shows folder hovers only for pointer interaction and never for ordinary files", async ({
  page,
}) => {
  await page.goto("/#/pull-requests/bitbucket/team/invoice/114/files");
  const pane = page.getByRole("complementary", { name: "Changed files", exact: true });
  const folder = pane.getByRole("treeitem", { name: "src", exact: true });
  const file = pane.getByRole("treeitem", { name: "invoice.ts", exact: true });
  await expect(file).toBeVisible();
  await page.mouse.move(1200, 600);
  await page.clock.install();
  await page.clock.pauseAt(new Date("2030-01-01T12:00:00Z"));
  const tooltip = page.getByRole("tooltip");

  await folder.focus();
  await page.clock.runFor(1000);
  expect(await tooltip.count()).toBe(0);
  await file.hover({ force: true });
  await page.clock.runFor(1000);
  expect(await tooltip.count()).toBe(0);
  await file.click({ force: true });
  await page.keyboard.press("j");
  await page.clock.runFor(1000);
  expect(await tooltip.count()).toBe(0);

  await folder.hover({ force: true });
  await page.clock.runFor(699);
  expect(await tooltip.count()).toBe(0);
  await page.clock.runFor(1);
  await expect(tooltip).toHaveText("Changes/src");
  await file.hover({ force: true });
  await page.clock.runFor(1000);
  expect(await tooltip.count()).toBe(0);
});
