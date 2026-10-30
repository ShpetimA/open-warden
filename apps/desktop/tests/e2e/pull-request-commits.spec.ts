import { expect, test, type Page } from "@playwright/test";

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
      const replies = Object.fromEntries(
        Object.entries(bridge).map(([method, handler]) => [
          method,
          method.startsWith("on")
            ? handler
            : async (...args: unknown[]) => {
                try {
                  const value = await handler(...args);
                  return { ok: true, value };
                } catch (cause) {
                  return {
                    ok: false,
                    error: {
                      operation: method,
                      code: "unavailable",
                      message:
                        cause instanceof Error ? cause.message : "The test operation failed.",
                    },
                  };
                }
              },
        ]),
      );
      Object.defineProperty(window, "desktopBridge", { value: replies });
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
        return {
          ok: false,
          error: {
            operation: "getBranchCommits",
            code: "unavailable",
            message: "Could not load PR commits",
          },
        };
      };
    }
  });
  await page.getByRole("tab", { name: "Commits" }).click();
  await expect(
    page
      .getByRole("complementary", { name: "Pull request commits", exact: true })
      .getByRole("alert"),
  ).toContainText("Couldn’t load commits");
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
          window.addEventListener("qa-commits-ready", () => resolve({ ok: true, value: [] }), {
            once: true,
          });
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

test("uses History-style pane navigation and independent Cmd+B / Cmd+D toggles", async ({
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
  await page.keyboard.press("Meta+b");
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

for (const theme of ["light", "dark"] as const) {
  test(`keeps short and long inline comments readable and collapsible in ${theme}`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.goto("/#/pull-requests/bitbucket/team/invoice/114/files");
    const gutter = page.locator('[data-additions] [data-column-number="2"]');
    await gutter.click();
    const composer = page.getByPlaceholder("Leave a comment...");
    await composer.fill("Testing");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    const note = page.getByRole("region", { name: "Pending comment", exact: true });
    await expect(note.getByText("Testing", { exact: true })).toBeVisible();
    expect(await note.evaluate((element) => getComputedStyle(element).fontFamily)).not.toMatch(
      /monospace/,
    );
    expect((await note.boundingBox())?.height).toBeLessThan(100);
    await page.screenshot({
      path: testInfo.outputPath(`comment-short-${theme}.png`),
      animations: "disabled",
    });
    await page.getByRole("button", { name: "Collapse pending comments", exact: true }).click();
    await expect(note).toHaveCount(0);
    await page.getByRole("button", { name: "Expand pending comments", exact: true }).click();
    await expect(note.getByText("Testing", { exact: true })).toBeVisible();
    await note.getByRole("button", { name: "Edit draft" }).click();
    const longBody = Array.from(
      { length: 8 },
      (_, index) =>
        `### Review case ${index + 1}\n\nThe request must reject negative amounts before saving. Preserve zero and positive values, and verify the error identifies the amount field.\n\n- Keep the repository untouched for rejected requests.\n- Cover this through the public API.`,
    ).join("\n\n");
    await composer.fill(longBody);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(note.getByRole("button", { name: "Read more", exact: true })).toBeVisible();
    const previewHeight = await note.evaluate((element) => element.getBoundingClientRect().height);
    await page.setViewportSize({ width: 1000, height: 740 });
    await page.screenshot({
      path: testInfo.outputPath(`comment-long-preview-${theme}.png`),
      animations: "disabled",
    });
    await note.getByRole("button", { name: "Read more", exact: true }).click();
    await expect
      .poll(() => note.evaluate((element) => element.getBoundingClientRect().height))
      .toBeGreaterThan(previewHeight);
    await note.getByRole("button", { name: "Show less", exact: true }).click();
    await expect(note.getByRole("button", { name: "Read more", exact: true })).toBeVisible();
    await note.getByRole("button", { name: "Collapse pending comment", exact: true }).click();
    await expect(
      note.getByRole("button", { name: "Expand pending comment", exact: true }),
    ).toBeVisible();
    await note.getByRole("button", { name: "Expand pending comment", exact: true }).click();
    await note.getByRole("button", { name: "Edit draft" }).click();
    await composer.fill("Unsaved edit");
    await page.getByRole("button", { name: "Collapse pending comments", exact: true }).click();
    await page.getByRole("button", { name: "Expand pending comments", exact: true }).click();
    await expect(composer).toHaveValue("Unsaved edit");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(note).toContainText("Review case 1");
    await note.getByRole("button", { name: "Delete draft" }).click();
    await expect(note).toHaveCount(0);
  });
}

test("retries a provider read and offers reconnect for authentication failures", async ({
  page,
}, testInfo) => {
  await page.addInitScript(
    ({ detail }) => {
      let attempts = 0;
      if (!window.desktopBridge) return;
      window.desktopBridge.listProviderConnections = async () => ({
        ok: true,
        value: [
          {
            id: "bitbucket",
            providerId: "bitbucket",
            method: "pat",
            login: "alice",
            displayName: "Alice",
            avatarUrl: null,
            scopes: [],
            createdAt: "",
            updatedAt: "",
          },
        ],
      });
      window.desktopBridge.listPullRequests = async () => {
        attempts += 1;
        if (attempts === 1)
          return {
            ok: false,
            error: {
              operation: "listPullRequests",
              code: "network",
              message: "Couldn’t reach Bitbucket. Check your connection and try again.",
              provider: "bitbucket",
            },
          };
        if (attempts === 2)
          return {
            ok: true,
            value: {
              pullRequests: [
                {
                  ...detail,
                  headOwner: "team",
                  headRepo: "invoice",
                  commentCount: 0,
                  reviewers: [],
                  reviewDecision: null,
                  checksState: null,
                  additions: 0,
                  deletions: 0,
                  changedFiles: 2,
                },
              ],
              page: 1,
              perPage: 25,
              hasNextPage: false,
            },
          };
        return {
          ok: false,
          error: {
            operation: "listPullRequests",
            code: "authentication",
            message: "Your Bitbucket connection needs attention. Reconnect your account.",
            provider: "bitbucket",
            status: 401,
          },
        };
      };
    },
    { detail },
  );
  await page.goto("/#/pull-requests/bitbucket/team/invoice/114/files");
  await expect(page.getByRole("tree")).toBeVisible();
  await page.getByRole("button", { name: "Pull requests", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Couldn’t load pull requests");
  await page.screenshot({
    path: testInfo.outputPath("provider-error.png"),
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByText("Validate invoice amounts", { exact: true }).first()).toBeVisible();
  await page.getByPlaceholder("Search titles and descriptions").fill("invoice");
  await expect(
    page.getByRole("button", { name: "Reconnect Bitbucket", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reconnect Bitbucket", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

async function configureInbox(page: Page, body: string, failDescriptionOnce = false) {
  await page.addInitScript(
    ({ detail, body, failDescriptionOnce }) => {
      const bridge = window.desktopBridge;
      if (!bridge) return;

      bridge.loadWorkspaceSession = async () => ({
        ok: true,
        value: {
          openRepos: ["/projects/invoice"],
          activeRepo: "/projects/invoice",
          recentRepos: [],
          workspaceTabs: {
            items: [{ id: "/projects/invoice", kind: "repo", repoPath: "/projects/invoice" }],
            activeWorkspaceId: "/projects/invoice",
            activeByProject: { "/projects/invoice": "/projects/invoice" },
            locations: { "/projects/invoice": "/pull-requests" },
            views: {},
            memory: {},
          },
        },
      });
      bridge.listProviderConnections = async () => ({
        ok: true,
        value: [
          {
            id: "bitbucket",
            providerId: "bitbucket",
            method: "pat",
            login: "alice",
            displayName: "Alice",
            avatarUrl: null,
            scopes: [],
            createdAt: "",
            updatedAt: "",
          },
        ],
      });
      bridge.listPullRequests = async () => ({
        ok: true,
        value: {
          pullRequests: [
            {
              ...detail,
              headOwner: "team",
              headRepo: "invoice",
              commentCount: 0,
              reviewers: [],
              reviewDecision: null,
              checksState: "passed",
              additions: 10,
              deletions: 2,
              changedFiles: 2,
            },
          ],
          page: 1,
          perPage: 25,
          hasNextPage: false,
        },
      });
      let reads = 0;
      bridge.getPullRequestConversation = async () => {
        reads += 1;
        if (failDescriptionOnce && reads === 1) {
          return {
            ok: false,
            error: {
              operation: "getPullRequestConversation",
              code: "network",
              message: "The provider couldn’t be reached. Try again.",
              provider: "bitbucket",
            },
          };
        }
        return {
          ok: true,
          value: { detail: { ...detail, body }, issueComments: [], reviewThreads: [] },
        };
      };
    },
    { detail, body, failDescriptionOnce },
  );
}

for (const theme of ["light", "dark"] as const) {
  test(`shows the full inbox description and resizes both panes in ${theme}`, async ({
    page,
  }, testInfo) => {
    const body = [
      "## Validation",
      ...Array.from(
        { length: 18 },
        (_, index) =>
          `### Check ${index + 1}\n\nValidate the real build and application navigation. Keep the entire description readable while resizing the preview.`,
      ),
      "End of the complete pull request description.",
    ].join("\n\n");
    await configureInbox(page, body);
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/#/pull-requests");

    await expect(page.locator("html")).toHaveClass(new RegExp(theme));
    const list = page.getByRole("region", { name: "Pull request list", exact: true });
    const preview = page.getByRole("complementary", { name: "Pull request preview", exact: true });
    const separator = page.getByRole("separator");
    await expect(preview.getByText("End of the complete pull request description.")).toHaveCount(1);
    await expect(preview.getByRole("button", { name: /Read more|Show less/ })).toHaveCount(0);
    const scroll = preview.locator("[data-workspace-scroll]");
    expect(await scroll.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(
      true,
    );

    const before = await list.evaluate((element) => element.getBoundingClientRect().width);
    const handle = await separator.boundingBox();
    if (!handle) throw new Error("Missing inbox resize handle");
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x - 140, handle.y + handle.height / 2, { steps: 12 });
    await page.mouse.up();
    await expect
      .poll(() => list.evaluate((element) => element.getBoundingClientRect().width))
      .toBeCloseTo(before - 140 - handle.width / 2, 0);
    const resized = await list.evaluate((element) => element.getBoundingClientRect().width);
    expect(resized).toBeLessThan(before - 100);

    await page.getByRole("button", { name: "History", exact: true }).click();
    await page.getByRole("button", { name: "Pull Requests", exact: true }).click();
    await expect(list).toBeVisible();
    await expect
      .poll(() => list.evaluate((element) => element.getBoundingClientRect().width))
      .toBeCloseTo(resized, 0);

    await page.keyboard.press("Meta+d");
    await expect(preview).toBeHidden();
    await expect(list).toBeVisible();
    await page.keyboard.press("Meta+d");
    await expect(preview).toBeVisible();
    await page.keyboard.press("Meta+b");
    await expect(list).toBeHidden();
    await expect(preview).toBeVisible();
    await page.getByRole("button", { name: "Toggle pull request list (⌘B)", exact: true }).click();
    await expect(list).toBeVisible();

    await separator.focus();
    const keyboardWidth = await list.evaluate((element) => element.getBoundingClientRect().width);
    await separator.press("ArrowRight");
    await expect
      .poll(() => list.evaluate((element) => element.getBoundingClientRect().width))
      .toBeGreaterThan(keyboardWidth);
    await page.screenshot({
      path: testInfo.outputPath(`inbox-wide-${theme}.png`),
      animations: "disabled",
    });

    await page.setViewportSize({ width: 1024, height: 768 });
    await preview
      .getByText("End of the complete pull request description.")
      .scrollIntoViewIfNeeded();
    await expect(preview.getByRole("button", { name: "Open review", exact: false })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: testInfo.outputPath(`inbox-narrow-${theme}.png`),
      animations: "disabled",
    });
  });
}

test("retries a failed inbox description instead of presenting it as empty", async ({ page }) => {
  await configureInbox(page, "The recovered pull request description.", true);
  await page.goto("/#/pull-requests");
  const preview = page.getByRole("complementary", { name: "Pull request preview", exact: true });
  await expect(preview.getByRole("alert")).toContainText("Couldn’t load this description");
  await expect(preview.getByText("No description provided.")).toHaveCount(0);
  await preview.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(preview.getByText("The recovered pull request description.")).toBeVisible();
  await expect(preview.getByRole("alert")).toHaveCount(0);
});

for (const theme of ["light", "dark"] as const) {
  test(`shows delayed PR tab information without opening from keyboard in ${theme}`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1100, height: 800 });
    await page.goto("/#/pull-requests/bitbucket/team/invoice/114/files");
    const tab = page
      .getByRole("navigation", { name: "Project pull requests" })
      .getByRole("button", { name: "#114 Validate invoice amounts", exact: true });
    await expect(tab).toBeVisible();
    await page.mouse.move(1000, 700);
    await tab.focus();
    await page.waitForTimeout(800);
    await expect(page.getByRole("tooltip")).toHaveCount(0);
    await tab.hover();
    await page.waitForTimeout(250);
    await expect(page.getByRole("tooltip")).toHaveCount(0);
    const card = page.getByRole("tooltip");
    await expect(card.getByText("team/invoice · Bitbucket · #114", { exact: true })).toBeVisible();
    await expect(card.getByText("Alice", { exact: true })).toBeVisible();
    await expect(card.getByText("validation → main", { exact: true })).toBeVisible();
    await expect(card.getByText(detail.body, { exact: true })).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`pr-tab-hover-${theme}.png`),
      animations: "disabled",
    });
    await page.keyboard.press("j");
    await expect(card).toBeHidden();
    await page.waitForTimeout(800);
    await expect(card).toHaveCount(0);
  });
}

test("V and J/K follow rendered review groups, folders and flat order after filtering and collapsing", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const bridge = window.desktopBridge!;
    const paths = ["pnpm-lock.yaml", "src/z.ts", "docs/guide.md", "src/a.test.ts", "src/a.ts"];
    bridge.getBranchFiles = async () => ({
      ok: true,
      value: paths.map((path) => ({ path, previousPath: null, status: "modified" as const })),
    });
  });
  await page.goto("/#/pull-requests/bitbucket/team/invoice/114/files");
  const pane = page.getByRole("complementary", { name: "Changed files", exact: true });
  const selected = pane.locator('[data-item-type="file"][aria-selected="true"]');
  await expect(selected).toHaveAttribute("aria-label", "a.ts");
  await pane.getByRole("treeitem", { name: "Tests", exact: true }).click();
  await pane.getByRole("treeitem", { name: "a.ts", exact: true }).click();
  await page.keyboard.press("j");
  await expect(selected).toHaveAttribute("aria-label", "z.ts");
  await page.keyboard.press("k");
  await expect(selected).toHaveAttribute("aria-label", "a.ts");
  await page.keyboard.press("v");
  await expect(selected).toHaveAttribute("aria-label", "z.ts");
  await page.keyboard.press("v");
  await expect(selected).toHaveAttribute("aria-label", "guide.md");
  await pane.getByRole("button", { name: "Group review files: Review groups" }).click();
  await page.getByRole("menuitemradio", { name: "Folders", exact: true }).click();
  await pane.getByRole("treeitem", { name: "a.test.ts", exact: true }).click();
  await page.keyboard.press("v");
  await expect(selected).toHaveAttribute("aria-label", "pnpm-lock.yaml");
  await pane.getByRole("button", { name: "Group review files: Folders" }).click();
  await page.getByRole("menuitemradio", { name: "Flat list", exact: true }).click();
  await pane.getByRole("treeitem", { name: /^guide/ }).click();
  await page.keyboard.press("Shift+v"); // mark without advancing
  await expect(selected).toHaveAttribute("aria-label", /^guide/);
  await page.keyboard.press("Shift+v"); // unmark without advancing
  await expect(selected).toHaveAttribute("aria-label", /^guide/);
  await page.keyboard.press("v");
  await expect(selected).toHaveAttribute("aria-label", /^pnpm-lock/);
  const filter = pane.getByRole("textbox", { name: "Filter changed files" });
  await filter.fill(".ts");
  await expect(selected).toHaveAttribute("aria-label", /^a\.test/);
  await filter.press("Escape");
  await pane.getByRole("treeitem", { name: /^a\.test/ }).click();
  await page.keyboard.press("v"); // unmark, no advance
  await expect(selected).toHaveAttribute("aria-label", /^a\.test/);
  await page.keyboard.press("v"); // all visible files are now viewed
  await expect(selected).toHaveAttribute("aria-label", /^a\.test/);
});

for (const theme of ["light", "dark"] as const) {
  test(`keeps PR content visible through incomplete status reads and failed refresh in ${theme}`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.setViewportSize({ width: theme === "light" ? 1280 : 1600, height: 900 });
    await page.addInitScript(
      ({ detail }) => {
        const bridge = window.desktopBridge!;
        // oxlint-disable-next-line unicorn/consistent-function-scoping -- Serialized into the browser; cannot capture module helpers.
        const failure = (operation: string) => ({
          ok: false as const,
          error: {
            operation,
            code: "network" as const,
            message: "Couldn’t reach the provider. Retry this read.",
          },
        });
        let files = 0;
        let reviews = 0;
        let checks = 0;
        let conversations = 0;
        bridge.getPullRequestActivity = async () => ({
          ok: true,
          value: { items: [], truncated: false },
        });
        bridge.getPullRequestFiles = async () =>
          ++files === 1
            ? failure("getPullRequestFiles")
            : {
                ok: true,
                value: [
                  {
                    path: "src/invoice.ts",
                    previousPath: null,
                    status: "modified",
                    additions: 3,
                    deletions: 1,
                  },
                ],
              };
        bridge.getPullRequestReviewOverview = async () =>
          ++reviews === 1
            ? failure("getPullRequestReviewOverview")
            : {
                ok: true,
                value: { reviewers: [], viewerLogin: "alice", canManageReviewers: false },
              };
        bridge.getPullRequestChecks = async () => ({
          ok: true,
          value: {
            headSha: detail.headSha,
            checks: [
              { id: "partial-check", name: "Build", state: "passed", description: null, url: null },
            ],
            complete: ++checks !== 1,
            mergeability: "unknown",
          },
        });
        bridge.getPullRequestConversation = async () =>
          ++conversations === 2
            ? failure("getPullRequestConversation")
            : { ok: true, value: { detail, issueComments: [], reviewThreads: [] } };
      },
      { detail },
    );
    await page.goto("/#/pull-requests/bitbucket/team/invoice/114/overview");
    const readNotice = (title: string) => page.getByRole("status").filter({ hasText: title });
    await expect(readNotice("Couldn’t load file statistics")).toBeVisible();
    await expect(readNotice("Couldn’t load review status")).toBeVisible();
    await expect(readNotice("Only some checks could be loaded")).toBeVisible();
    await expect(page.getByRole("button", { name: "Files", exact: true }).last()).toBeVisible();
    await expect(page.getByText("0 files", { exact: true })).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath(`pr-incomplete-${theme}.png`),
      animations: "disabled",
    });
    for (const title of [
      "Couldn’t load file statistics",
      "Couldn’t load review status",
      "Couldn’t load checks",
    ]) {
      await readNotice(title).getByRole("button", { name: "Retry", exact: true }).click();
      await expect(readNotice(title)).toHaveCount(0);
    }
    await expect(page.getByRole("button", { name: /1 files/ })).toBeVisible();
    await page.getByRole("button", { name: "Refresh pull request", exact: true }).click();
    await expect(readNotice("Couldn’t refresh this pull request")).toBeVisible();
    await expect(page.getByRole("heading", { name: detail.title, exact: true })).toBeVisible();
    await expect(page.getByText(detail.body, { exact: true })).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`pr-retained-error-${theme}.png`),
      animations: "disabled",
    });
    await readNotice("Couldn’t refresh this pull request")
      .getByRole("button", { name: "Retry", exact: true })
      .click();
    await expect(readNotice("Couldn’t refresh this pull request")).toHaveCount(0);
  });
}

for (const theme of ["light", "dark"] as const) {
  test(`refreshes the current PR revision and retains the file tree after a failed refresh in ${theme}`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.setViewportSize({ width: theme === "light" ? 1440 : 1024, height: 900 });
    await page.addInitScript(
      ({ detail }) => {
        const bridge = window.desktopBridge!;
        const state = { head: detail.headSha, fail: false, conversations: 0, refs: 0 };
        Object.assign(window, { refreshReads: state });
        bridge.getPullRequestConversation = async () => {
          state.conversations += 1;
          return state.fail
            ? {
                ok: false,
                error: {
                  operation: "getPullRequestConversation",
                  code: "network",
                  message: "The provider is offline.",
                },
              }
            : {
                ok: true,
                value: {
                  detail: { ...detail, headSha: state.head },
                  issueComments: [],
                  reviewThreads: [],
                },
              };
        };
        bridge.preparePullRequestCompareRefs = async () => {
          state.refs += 1;
          return {
            ok: true,
            value: {
              providerId: "bitbucket",
              owner: "team",
              repo: "invoice",
              pullRequestNumber: 114,
              baseRef: "main",
              headRef: "validation",
              compareBaseRef: "base123",
              compareHeadRef: state.head,
              localBranch: "validation",
            },
          };
        };
      },
      { detail },
    );
    await page.goto("/#/pull-requests/bitbucket/team/invoice/114/files");
    const tree = page
      .getByRole("complementary", { name: "Changed files", exact: true })
      .getByRole("tree");
    const selected = tree.locator('[aria-selected="true"]');
    await expect(selected).toHaveAttribute("aria-label", /^invoice/);
    const selectedLabel = await selected.getAttribute("aria-label");
    await tree.evaluate((element) => element.setAttribute("data-retained-tree", "yes"));
    const refresh = page.getByRole("button", { name: "Refresh pull request", exact: true });
    await page.evaluate(() => {
      (window as unknown as { refreshReads: { fail: boolean } }).refreshReads.fail = true;
    });
    await refresh.click();
    const notice = page
      .getByRole("status")
      .filter({ hasText: "Couldn’t refresh this pull request" });
    await expect(notice).toBeVisible();
    await expect(tree).toHaveAttribute("data-retained-tree", "yes");
    await expect(selected).toHaveAttribute("aria-label", selectedLabel!);
    await expect(
      page.getByText("export const revision = 'head123';", { exact: false }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`pr-refresh-${theme}.png`),
      animations: "disabled",
    });
    await page.evaluate(() => {
      const reads = (window as unknown as { refreshReads: { fail: boolean; head: string } })
        .refreshReads;
      reads.fail = false;
      reads.head = "head456";
    });
    await notice.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(notice).toHaveCount(0);
    await expect(
      page.getByText("export const revision = 'head456';", { exact: false }),
    ).toBeVisible();
    await expect(selected).toHaveAttribute("aria-label", selectedLabel!);
    await expect(tree).toHaveAttribute("data-retained-tree", "yes");
  });
}

test("refreshes the inbox and its selected description from the visible refresh action", async ({
  page,
}) => {
  await configureInbox(page, "The initial description.");
  await page.goto("/#/pull-requests");
  const preview = page.getByRole("complementary", { name: "Pull request preview", exact: true });
  await expect(preview.getByText("The initial description.")).toBeVisible();
  await page.evaluate(
    ({ detail }) => {
      window.desktopBridge!.getPullRequestConversation = async () => ({
        ok: true,
        value: {
          detail: { ...detail, body: "Updated remotely." },
          issueComments: [],
          reviewThreads: [],
        },
      });
    },
    { detail },
  );
  await page.getByRole("button", { name: "Refresh pull requests", exact: true }).click();
  await expect(preview.getByText("Updated remotely.")).toBeVisible();
});

test("honors a cached provider rate limit before sending a manual refresh", async ({ page }) => {
  await page.addInitScript(() => {
    let requests = 0;
    Object.assign(window, { rateLimitReads: () => requests });
    window.desktopBridge!.getPullRequestConversation = async () => {
      requests += 1;
      return {
        ok: false,
        error: {
          operation: "getPullRequestConversation",
          code: "rate-limit",
          message: "Wait for the provider.",
          retryAt: Date.now() + 120000,
        },
      };
    };
  });
  await page.goto("/#/pull-requests/bitbucket/team/invoice/114/files");
  const refresh = page.getByRole("button", { name: "Refresh pull request", exact: true });
  await expect(refresh).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { rateLimitReads: () => number }).rateLimitReads()),
    )
    .toBe(1);
  await refresh.click();
  await expect(refresh).toBeDisabled();
  await expect(
    page.getByRole("status").filter({ hasText: "Wait for the provider." }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      (window as unknown as { rateLimitReads: () => number }).rateLimitReads(),
    ),
  ).toBe(1);
});
