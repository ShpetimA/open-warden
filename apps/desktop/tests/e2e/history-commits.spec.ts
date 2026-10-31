import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";

import { createAppSettings } from "../../src/platform/desktop/appSettings";
import type { DesktopBridge, HistoryCommit } from "../../src/platform/desktop/contracts";
import type { HistoryGraph } from "../../src/platform/desktop/history";
import type { GitRepositoryState } from "../../src/platform/desktop/gitOperations";

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

const graphId = (index: number) => (index + 1).toString(16).padStart(40, "0");
const graph: HistoryGraph = {
  shallow: false,
  commits: Array.from({ length: 1005 }, (_, index) => ({
    commitId: graphId(index),
    shortId: graphId(index).slice(-8),
    summary:
      index === 0
        ? "Merge invoice validation"
        : index === 1004
          ? "Oldest original invoice commit"
          : `Earlier change ${index}`,
    author: index % 2 ? "Bob" : "Alice",
    authorEmail: index % 2 ? "bob@example.com" : "alice@example.com",
    authoredAt: "2026-10-27T12:00:00Z",
    relativeTime: "1 day ago",
    parents:
      index === 0
        ? [graphId(1), graphId(3)]
        : index === 2 || index === 3
          ? [graphId(4)]
          : index === 1004
            ? []
            : [graphId(index + 1)],
    refs: index === 0 ? ["HEAD", "refs/heads/main"] : index === 3 ? ["refs/heads/validation"] : [],
  })),
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ({ commits, settings }) => {
      const bridge: Partial<DesktopBridge> = {
        loadWorkspaceSession: async () => ({
          openRepos: ["/projects/invoice"],
          activeRepo: "/projects/invoice",
          recentRepos: [],
          workspaceTabs: {
            items: [{ id: "/projects/invoice", kind: "repo", repoPath: "/projects/invoice" }],
            activeWorkspaceId: "/projects/invoice",
            activeByProject: { "/projects/invoice": "/projects/invoice" },
            locations: { "/projects/invoice": "/history" },
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
    { commits, settings: createAppSettings() },
  );
});

for (const theme of ["light", "dark"] as const) {
  test(`closes quick actions with Escape and steps back with Backspace in ${theme}`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.setViewportSize({ width: theme === "light" ? 1440 : 1000, height: 900 });
    await page.addInitScript(() => {
      const bridge = window.desktopBridge;

      if (!bridge) throw new Error("Missing desktop test bridge");

      bridge.getGitRepositoryState = async () => ({
        ok: true,
        value: {
          branch: "main",
          upstream: "origin/main",
          ahead: 0,
          behind: 0,
          remotes: ["origin"],
          branches: [
            { name: "main", remote: false, worktree: "/projects/invoice" },
            { name: "feature/invoices", remote: false, worktree: "" },
          ],
          tags: [],
          worktrees: [],
          operation: null,
          conflicts: [],
          lastCommit: null,
          stashes: [],
          incoming: [],
          outgoing: [],
        },
      });
    });

    await page.goto("/#/history");
    await expect(
      page.getByRole("complementary", { name: "History commits", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("ControlOrMeta+k");

    const dialog = page.getByRole("dialog", { name: "Command composer" });
    const actions = dialog.getByRole("textbox", { name: "Search actions", exact: true });

    await actions.fill("fetch");
    await actions.press("Enter");
    const confirm = dialog.getByRole("button", { name: "Confirm Fetch", exact: true });
    await expect(confirm).toBeFocused();
    await expect(dialog.locator(".change-composer-footer")).toContainText("Esc Close");
    await page.screenshot({ path: testInfo.outputPath(`quick-actions-confirm-${theme}.png`) });

    await confirm.press("Backspace");
    await expect(actions).toBeFocused();
    await actions.fill("fetch");
    await actions.press("Enter");
    await confirm.press("Escape");
    await expect(dialog).not.toBeVisible();

    await page.keyboard.press("ControlOrMeta+k");
    await actions.fill("branches");
    await actions.press("Enter");

    const branches = dialog.getByRole("textbox", { name: "Search branches", exact: true });
    await expect(branches).toBeFocused();
    await branches.fill("feature");
    await branches.press("Backspace");
    await expect(branches).toHaveValue("featur");
    await branches.fill("");
    await page.screenshot({ path: testInfo.outputPath(`quick-actions-branches-${theme}.png`) });
    await branches.press("Backspace");
    await expect(actions).toBeFocused();

    await actions.fill("branches");
    await actions.press("Enter");
    await branches.fill("feature");
    await branches.press("Escape");
    await expect(dialog).not.toBeVisible();
  });

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
    if (window.desktopBridge)
      window.desktopBridge.getCommitHistory = async () => ({ ok: true, value: [] });
  });
  await page.goto("/#/history");
  await expect(page.getByText("No commits found.", { exact: true })).toBeVisible();
});

test("shows history loading failures in the shared pane", async ({ page }) => {
  await page.addInitScript(() => {
    if (window.desktopBridge)
      window.desktopBridge.getCommitHistory = async () => {
        return {
          ok: false,
          error: {
            operation: "getCommitHistory",
            code: "unavailable",
            message: "History unavailable",
          },
        };
      };
  });
  await page.goto("/#/history");
  await expect(page.getByRole("alert").filter({ hasText: "History unavailable" })).toBeVisible();
});

for (const theme of ["light", "dark"] as const) {
  test(`recovers a failed History read and keeps cached selection on refresh failure in ${theme}`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.addInitScript((commits) => {
      let attempts = 0;
      if (window.desktopBridge)
        window.desktopBridge.getCommitHistory = async () => {
          attempts += 1;
          if (attempts === 1 || attempts === 3)
            return {
              ok: false,
              error: {
                operation: "getCommitHistory",
                code: "busy",
                message:
                  "Another Git operation is using this repository. Wait for it to finish, then try again.",
              },
            };
          return { ok: true, value: commits };
        };
    }, commits);
    await page.goto("/#/history");
    const pane = page.getByRole("complementary", { name: "History commits", exact: true });
    await expect(pane.getByRole("alert")).toContainText("Couldn’t load commits");
    await page.screenshot({
      path: testInfo.outputPath(`history-error-${theme}.png`),
      animations: "disabled",
    });
    await pane.getByRole("button", { name: "Retry", exact: true }).click();
    const filter = pane.getByRole("textbox", { name: "Filter commits" });
    await filter.fill("Bob");
    const selected = pane.getByRole("button", { name: /Store signup steps/ });
    await selected.click();
    await expect(selected).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Refresh repository status" }).click();
    await expect(pane.getByRole("status")).toContainText("Couldn’t refresh commits");
    await expect(selected).toHaveAttribute("aria-pressed", "true");
    await expect(filter).toHaveValue("Bob");
    await page.screenshot({
      path: testInfo.outputPath(`history-stale-${theme}.png`),
      animations: "disabled",
    });
    await pane.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(pane.getByText("Couldn’t refresh commits", { exact: true })).toHaveCount(0);
    await expect(selected).toHaveAttribute("aria-pressed", "true");
    await expect(filter).toHaveValue("Bob");
  });
}

for (const theme of ["light", "dark"] as const) {
  test(`opens full-page ancestry and contribution counts in ${theme}`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.addInitScript((graph) => {
      if (window.desktopBridge)
        window.desktopBridge.getHistoryGraph = async () => ({ ok: true, value: graph });
    }, graph);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/#/history");
    await expect(page.getByRole("button", { name: /^Update invoice state URLs/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.getByRole("tab", { name: "Graph", exact: true }).click();
    const graphView = page.getByRole("region", { name: "Repository history graph", exact: true });
    await expect(graphView.getByText("All branches and tags", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("complementary", { name: "History commits", exact: true }),
    ).toHaveCount(0);
    await expect(
      graphView.getByText("1,005 commits · 2 contributors · locally available history"),
    ).toBeVisible();
    const merge = graphView.getByRole("button", { name: /^Merge: Merge invoice validation/ });
    await expect(merge).toHaveAttribute("aria-pressed", "true");
    expect(await graphView.getByRole("listitem").count()).toBeLessThan(60);
    expect(await graphView.locator("[data-history-graph-mark] path").count()).toBeGreaterThan(0);
    await page.screenshot({
      path: testInfo.outputPath(`graph-${theme}-wide.png`),
      animations: "disabled",
    });

    await graphView.getByRole("button", { name: "Contributors", exact: true }).click();
    const contributors = page.locator('[data-slot="popover-content"]');
    await expect(contributors).toContainText("Contributions by commit count");
    await expect(contributors.getByRole("button", { name: /Alice/ })).toContainText("503");
    await expect(contributors.getByRole("button", { name: /Bob/ })).toContainText("502");
    await contributors.getByRole("button", { name: /Bob/ }).click();
    await expect(contributors).toBeHidden();
    await expect(graphView.getByText("502 matches · ancestry retained")).toBeVisible();
    expect(await graphView.locator("[data-history-graph-mark] path").count()).toBeGreaterThan(0);
    await expect(graphView.locator('[data-graph-index="0"]')).toHaveAttribute(
      "data-filter-match",
      "false",
    );
    await expect(graphView.locator('[data-graph-index="1"]')).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await graphView.getByRole("button", { name: "Next matching commit", exact: true }).click();
    await expect(graphView.locator('[data-graph-index="3"]')).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await graphView.getByRole("button", { name: "Clear", exact: true }).click();
    await graphView
      .getByRole("textbox", { name: "Filter graph commits", exact: true })
      .fill("Oldest original");
    const oldest = graphView.getByRole("button", { name: /^Oldest original invoice commit/ });
    await expect(oldest).toBeVisible();
    await graphView.getByRole("button", { name: "Clear", exact: true }).click();
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.screenshot({
      path: testInfo.outputPath(`graph-${theme}-narrow.png`),
      animations: "disabled",
    });
    await graphView.locator("[data-history-graph-scroll]").evaluate((element) => {
      element.scrollTop = 0;
    });
    await merge.click();
    await page.keyboard.press("j");
    await expect(graphView.getByRole("button", { name: /^Earlier change 1 / })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await merge.click();
    await merge.press("Enter");
    await expect(page.getByRole("tab", { name: "List", exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(
      page.getByText(`export const revision = '${graphId(0)}';`, { exact: true }),
    ).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

test("searches and navigates beyond 200 commits while keeping the list virtualized", async ({
  page,
}) => {
  await page.addInitScript((graph) => {
    if (window.desktopBridge)
      window.desktopBridge.getCommitHistory = async () => ({ ok: true, value: graph.commits });
  }, graph);
  await page.goto("/#/history");
  const pane = page.getByRole("complementary", { name: "History commits", exact: true });
  await expect(pane.getByText("1005", { exact: true })).toBeVisible();
  expect(await pane.locator('[data-slot="commit-row"]').count()).toBeLessThan(60);
  await page.keyboard.press("h");
  await page.keyboard.press("k");
  await expect(
    pane.getByRole("button", { name: /^Oldest original invoice commit / }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    pane.getByRole("button", { name: /^Oldest original invoice commit / }),
  ).toBeVisible();
  const filter = pane.getByRole("textbox", { name: "Filter commits", exact: true });
  await filter.fill("Oldest original");
  await expect(pane.getByText("1 / 1005", { exact: true })).toBeVisible();
  await expect(pane.locator('[data-slot="commit-row"]')).toHaveCount(1);
});

for (const theme of ["light", "dark"] as const) {
  test(`fits a wide graph and exposes full commit details in ${theme}`, async ({
    page,
  }, testInfo) => {
    const summary =
      "Preserve the complete invoice export description and incoming document behavior while updating ZIP download permissions across desktop and mobile layouts";
    const wideGraph: HistoryGraph = {
      shallow: false,
      commits: graph.commits.map((commit, index) =>
        index === 0
          ? {
              ...commit,
              summary,
              parents: graph.commits.slice(1, 81).map((parent) => parent.commitId),
              refs: [
                "HEAD",
                "refs/heads/OF-11390-msw-mocks-rework-with-a-long-branch-name",
                "refs/remotes/origin/OF-11390-msw-mocks-rework-with-a-long-branch-name",
              ],
            }
          : commit,
      ),
    };
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.addInitScript((graph) => {
      if (window.desktopBridge)
        window.desktopBridge.getHistoryGraph = async () => ({ ok: true, value: graph });
    }, wideGraph);
    await page.goto("/#/history");
    await expect(page.getByRole("button", { name: /^Update invoice state URLs/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.getByRole("tab", { name: "Graph", exact: true }).click();
    const view = page.getByRole("region", { name: "Repository history graph", exact: true });
    const details = view.getByRole("region", { name: "Selected commit details", exact: true });
    await expect(details.getByRole("heading", { name: summary, exact: true })).toBeVisible();
    await expect(
      details.getByText("Keep invoice navigation stable while splitting the onboarding flow.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      details.getByText("Alice <alice@example.com>", { exact: true }).first(),
    ).toBeVisible();
    for (const width of [1440, 1000, 720]) {
      await page.setViewportSize({ width, height: 800 });
      const scroll = view.locator("[data-history-graph-scroll]");
      await expect
        .poll(() => scroll.evaluate((element) => element.scrollWidth <= element.clientWidth))
        .toBe(true);
      const heading = details.getByRole("heading", { name: summary, exact: true });
      expect(await heading.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
        true,
      );
      const row = view.locator('[data-graph-index="0"]');
      const title = row.getByText(summary, { exact: true });
      const titleBox = await title.boundingBox();
      expect(titleBox?.width).toBeGreaterThan(200);
      expect(titleBox?.x).toBeLessThan(300);
      expect(await row.locator("[data-history-graph-mark] path").count()).toBeLessThanOrEqual(10);
      await page.screenshot({
        path: testInfo.outputPath(`graph-details-${theme}-${width}.png`),
        animations: "disabled",
      });
    }
    const textX = (
      await view.locator('[data-graph-index="0"]').getByText(summary, { exact: true }).boundingBox()
    )?.x;
    await view.getByRole("button", { name: "Later graph lanes", exact: true }).click();
    await expect(view.getByText("7–14 / 80", { exact: true })).toBeVisible();
    await view.getByRole("button", { name: "Contributors", exact: true }).click();
    await expect(view.getByText("7–14 / 80", { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    expect(
      (
        await view
          .locator('[data-graph-index="0"]')
          .getByText(summary, { exact: true })
          .boundingBox()
      )?.x,
    ).toBe(textX);
    await view.locator('[data-graph-index="0"]').focus();
    await page.keyboard.press("j");
    await expect(
      view.getByRole("button", { name: "Earlier graph lanes", exact: true }),
    ).toBeDisabled();
    await view.locator('[data-graph-index="0"]').click();
    await view.getByRole("button", { name: "Commit details", exact: true }).click();
    await expect(details.getByRole("heading")).toHaveCount(0);
    await view.getByRole("button", { name: "Commit details", exact: true }).click();
    await expect(details.getByRole("heading", { name: summary, exact: true })).toBeVisible();
    const filter = view.getByRole("textbox", { name: "Filter graph commits", exact: true });
    await filter.fill("not-a-real-commit-or-author");
    await expect(view.getByText("0 matches · ancestry retained", { exact: true })).toBeVisible();
    await expect(
      view.getByRole("button", { name: "Next matching commit", exact: true }),
    ).toBeDisabled();
    expect(await view.locator("[data-history-graph-mark] path").count()).toBeGreaterThan(0);
  });
}

test("keeps graph geometry and static rows stable during rapid navigation", async ({
  page,
}, testInfo) => {
  const performanceGraph: HistoryGraph = {
    shallow: false,
    commits: Array.from({ length: 20_000 }, (_, index) => ({
      commitId: graphId(index),
      shortId: graphId(index).slice(-8),
      summary: index === 0 ? "Merge invoice validation" : `Invoice change ${index}`,
      author: "Alice",
      authorEmail: "alice@example.com",
      authoredAt: "2026-10-29T12:00:00Z",
      relativeTime: "today",
      refs: [],
      parents: index === 19_999 ? [] : [graphId(index + 1)],
    })),
  };
  await page.addInitScript((graph) => {
    if (!window.desktopBridge) return;
    const calls: string[] = [];
    Object.defineProperty(window, "graphDetailRequests", { value: calls });
    window.desktopBridge.getHistoryGraph = async () => ({ ok: true, value: graph });
    window.desktopBridge.getCommitDetails = async (_repo, commitId) => {
      calls.push(commitId);
      await new Promise((resolve) => setTimeout(resolve, 150));
      return {
        ok: true,
        value: {
          commitId,
          summary: commitId,
          body:
            commitId === graph.commits[0]?.commitId
              ? "Short body"
              : "A long explanation with several paragraphs.\n".repeat(50),
          author: "Alice",
          authorEmail: "alice@example.com",
          authoredAt: "2026-10-29T12:00:00Z",
          committer: "Alice",
          committerEmail: "alice@example.com",
          committedAt: "2026-10-29T12:00:00Z",
          parents: [],
        },
      };
    };
  }, performanceGraph);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/#/history");
  await expect(page.getByRole("button", { name: /^Update invoice state URLs/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("tab", { name: "Graph", exact: true }).click();
  const view = page.getByRole("region", { name: "Repository history graph", exact: true });
  const scroll = view.locator("[data-history-graph-scroll]");
  const details = view.getByRole("region", { name: "Selected commit details", exact: true });
  await expect(details.getByText("Short body", { exact: true })).toBeVisible();
  const originalBox = await scroll.boundingBox();
  await view.getByRole("button", { name: /^Merge invoice validation/ }).click();
  const before = await page.evaluate(() => Reflect.get(window, "graphDetailRequests").length);
  const started = Date.now();
  for (let index = 0; index < 60; index += 1) await page.keyboard.down("j");
  await page.keyboard.up("j");
  const elapsed = Date.now() - started;
  await expect(view.locator('[data-graph-index="60"]')).toHaveAttribute("aria-pressed", "true");
  for (let index = 0; index < 60; index += 1) await page.keyboard.down("k");
  await page.keyboard.up("k");
  await expect(view.locator('[data-graph-index="0"]')).toHaveAttribute("aria-pressed", "true");
  const nextBox = await scroll.boundingBox();
  expect(nextBox?.y).toBe(originalBox?.y);
  expect(nextBox?.height).toBe(originalBox?.height);
  expect(
    (await page.evaluate(() => Reflect.get(window, "graphDetailRequests").length)) - before,
  ).toBeLessThanOrEqual(3);
  expect(elapsed).toBeLessThan(2500);
  const timingPath = testInfo.outputPath("navigation-timing.json");
  await writeFile(
    timingPath,
    JSON.stringify({
      commits: 20_000,
      keys: 60,
      elapsedMs: elapsed,
      intermediateRequests:
        (await page.evaluate(() => Reflect.get(window, "graphDetailRequests").length)) - before,
    }),
  );
  await testInfo.attach("navigation-timing", { path: timingPath, contentType: "application/json" });
  const unchangedGraph = view.locator('[data-graph-index="0"] [data-history-graph-mark]');
  const svgHandle = await unchangedGraph.elementHandle();
  await page.keyboard.press("j");
  await expect(view.locator('[data-graph-index="1"]')).toHaveAttribute("aria-pressed", "true");
  await expect(details.getByText("A long explanation", { exact: false })).toBeVisible();
  expect(await scroll.boundingBox()).toEqual(originalBox);
  expect(await svgHandle?.evaluate((element) => element.isConnected)).toBe(true);
});

test("recovers graph failures and keeps filtered content after a failed refresh", async ({
  page,
}) => {
  await page.addInitScript((graph) => {
    let attempts = 0;
    if (window.desktopBridge)
      window.desktopBridge.getHistoryGraph = async () => {
        attempts += 1;
        if (attempts === 1 || attempts === 3)
          return {
            ok: false,
            error: {
              operation: "getHistoryGraph",
              code: "busy",
              message: "Another Git operation is using this repository. Try again.",
            },
          };
        return { ok: true, value: graph };
      };
  }, graph);
  await page.goto("/#/history");
  await expect(page.getByRole("button", { name: /^Update invoice state URLs/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("tab", { name: "Graph", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Couldn’t load the history graph");
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  const view = page.getByRole("region", { name: "Repository history graph", exact: true });
  const filter = view.getByRole("textbox", { name: "Filter graph commits", exact: true });
  await filter.fill("bob@example.com");
  const commit = view.getByRole("button", { name: /^Earlier change 3 / });
  await commit.click();
  await view.getByRole("button", { name: "Refresh history graph", exact: true }).click();
  const refreshFailure = page
    .getByRole("status")
    .filter({ hasText: "Couldn’t refresh the history graph" });
  await expect(refreshFailure).toBeVisible();
  await expect(filter).toHaveValue("bob@example.com");
  await expect(commit).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(refreshFailure).toHaveCount(0);
  await expect(filter).toHaveValue("bob@example.com");
  await expect(commit).toHaveAttribute("aria-pressed", "true");
});

test("returns to the selected older commit when switching back to Graph", async ({ page }) => {
  await page.addInitScript((graph) => {
    if (!window.desktopBridge) return;
    window.desktopBridge.getHistoryGraph = async () => ({ ok: true, value: graph });
    window.desktopBridge.getCommitHistory = async () => ({ ok: true, value: graph.commits });
  }, graph);
  await page.goto("/#/history");
  await expect(
    page
      .getByRole("complementary", { name: "History commits", exact: true })
      .getByText("1005", { exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Graph", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Filter graph commits", exact: true })
    .fill("Oldest original");
  await page.getByRole("button", { name: /^Oldest original invoice commit / }).press("Enter");
  const list = page.getByRole("complementary", { name: "History commits", exact: true });
  await expect(list).toBeVisible();
  await expect(
    list.getByRole("button", { name: /^Oldest original invoice commit / }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    list.getByRole("button", { name: /^Oldest original invoice commit / }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Graph", exact: true }).click();
  const view = page.getByRole("region", { name: "Repository history graph", exact: true });
  await expect(
    view.getByRole("button", { name: /^Oldest original invoice commit / }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    view.getByRole("button", { name: /^Oldest original invoice commit / }),
  ).toBeVisible();
});

for (const theme of ["light", "dark"] as const) {
  test(`shows clear repository action feedback in ${theme}`, async ({ page }, testInfo) => {
    const repository: GitRepositoryState = {
      branch: "feature/outgoing-invoice-and-proforma-exports-with-a-long-name",
      upstream: "origin/feature/exports",
      ahead: 6,
      behind: 0,
      operation: null,
      remotes: ["origin"],
      conflicts: [],
      lastCommit: null,
      stashes: [],
      branches: [],
      tags: [],
      worktrees: [],
      incoming: [],
      outgoing: [],
    };
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.addInitScript((repository) => {
      if (window.desktopBridge)
        window.desktopBridge.getGitRepositoryState = async () => ({ ok: true, value: repository });
    }, repository);
    await page.setViewportSize({ width: 1100, height: 800 });
    await page.goto("/#/history");
    const fetch = page.getByRole("button", { name: "Fetch remote changes", exact: true });
    const pull = page.getByRole("button", { name: "Pull (fast-forward only)", exact: true });
    const push = page.getByRole("button", { name: "Push commits", exact: true });
    await expect(fetch).toBeEnabled();
    await expect(pull).toBeDisabled();
    const restingColor = await fetch.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    );
    const restingBox = await fetch.boundingBox();
    await fetch.hover();
    await expect(page.getByRole("tooltip", { name: /^Fetch remote changes/ })).toContainText(
      "Choose a remote to fetch from",
    );
    expect(await fetch.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(
      restingColor,
    );
    expect(await fetch.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe("none");
    expect(await fetch.boundingBox()).toEqual(restingBox);
    await page.screenshot({
      path: testInfo.outputPath(`repository-hover-${theme}.png`),
      animations: "disabled",
    });
    await pull.locator("..").hover();
    await expect(page.getByRole("tooltip", { name: /^Pull \(fast-forward only\)/ })).toContainText(
      "No incoming commits. Your branch is up to date.",
    );
    await page.screenshot({
      path: testInfo.outputPath(`repository-disabled-${theme}.png`),
      animations: "disabled",
    });
    await push.hover();
    await expect(page.getByRole("tooltip", { name: /^Push commits/ })).toContainText(
      "6 outgoing commits",
      { timeout: 250 },
    );
    await fetch.focus();
    await expect(page.getByRole("tooltip", { name: /^Fetch remote changes/ })).toContainText(
      "Fetch remote changes",
    );
    await page.screenshot({
      path: testInfo.outputPath(`repository-focus-${theme}.png`),
      animations: "disabled",
    });
    const branch = page.getByRole("button", { name: /feature\/outgoing-invoice/ });
    await branch.hover();
    await expect(page.getByRole("tooltip", { name: /^Switch branch/ })).toContainText(
      repository.branch,
    );
    const menu = page.getByRole("button", {
      name: "Choose app for opening repository",
      exact: true,
    });
    await menu.hover();
    await expect(page.getByRole("tooltip", { name: "Open in...", exact: true })).toBeVisible();
    const tooltip = page.locator('[data-slot="tooltip-content"]');
    await expect(tooltip.locator("svg")).toHaveCount(0);
    expect(
      await menu.evaluate((element) => {
        const dimensions = getComputedStyle(element).boxShadow.match(/-?\d+(?:\.\d+)?px/g) ?? [];
        return dimensions.every((value) => Number.parseFloat(value) === 0);
      }),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`repository-split-hover-${theme}.png`),
      animations: "disabled",
    });
    await menu.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(menu).toBeFocused();
    expect(await menu.evaluate((element) => getComputedStyle(element).boxShadow)).toContain(
      "2px inset",
    );
    await page.screenshot({
      path: testInfo.outputPath(`repository-split-focus-${theme}.png`),
      animations: "disabled",
    });
    await menu.click();
    await expect(page.getByRole("menu")).toBeVisible();
    await expect(
      page.locator('button[aria-label="Choose app for opening repository"]'),
    ).toHaveAttribute("data-state", "open");
    await page.screenshot({
      path: testInfo.outputPath(`repository-open-menu-${theme}.png`),
      animations: "disabled",
    });
    await page.keyboard.press("Escape");
    await fetch.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Confirm Fetch$/i })).toBeVisible();
    await page.keyboard.press("Meta+k");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
}

for (const theme of ["light", "dark"] as const) {
  test(`retains history files and diffs after failed refresh in ${theme}`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.setViewportSize({ width: theme === "light" ? 1280 : 1600, height: 900 });
    await page.addInitScript(() => {
      const bridge = window.desktopBridge!;
      const files = bridge.getCommitFiles;
      const versions = bridge.getCommitFileVersions;
      let fileReads = 0;
      let diffReads = 0;
      bridge.getCommitFiles = async (...args) =>
        ++fileReads === 2
          ? {
              ok: false,
              error: {
                code: "permission",
                operation: "getCommitFiles",
                message: "Commit files could not be refreshed.",
              },
            }
          : files(...args);
      bridge.getCommitFileVersions = async (...args) =>
        ++diffReads === 2
          ? {
              ok: false,
              error: {
                code: "permission",
                operation: "getCommitFileVersions",
                message: "Commit contents could not be refreshed.",
              },
            }
          : versions(...args);
    });
    await page.goto("/#/history");
    const tree = page.locator("file-tree-container").last();
    await expect(
      page.getByText("export const revision = 'newest123';", { exact: true }),
    ).toBeVisible();
    await tree.evaluate((element) => {
      element.dataset.retained = "yes";
    });
    await page.getByRole("button", { name: "Refresh repository status", exact: true }).click();
    const filesNotice = page
      .getByRole("status")
      .filter({ hasText: "Commit files could not be refreshed." });
    const diffNotice = page.getByRole("status").filter({ hasText: "Couldn’t refresh this diff" });
    await expect(filesNotice).toBeVisible();
    await expect(diffNotice).toBeVisible();
    await expect(tree).toHaveAttribute("data-retained", "yes");
    await expect(
      page.getByText("export const revision = 'newest123';", { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`history-retained-error-${theme}.png`),
      animations: "disabled",
    });
    await filesNotice.getByRole("button", { name: "Retry", exact: true }).click();
    await diffNotice.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(filesNotice).toHaveCount(0);
    await expect(diffNotice).toHaveCount(0);
    await expect(tree).toHaveAttribute("data-retained", "yes");
  });
}

test("an unreadable selected commit stays selected and never shows the previous commit's diff", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const bridge = window.desktopBridge!;
    const original = bridge.getCommitFileVersions;
    let failed = false;
    bridge.getCommitFileVersions = async (...args) => {
      if (args[1] === "middle123" && !failed) {
        failed = true;
        return {
          ok: false,
          error: {
            code: "not-found",
            operation: "getCommitFileVersions",
            message: "This commit content could not be read. Retry to read it again.",
          },
        };
      }
      return original(...args);
    };
  });
  await page.goto("/#/history");
  await expect(
    page.getByText("export const revision = 'newest123';", { exact: true }),
  ).toBeVisible();
  const middle = page.getByRole("button", { name: /Store signup steps in the database/ });
  await middle.click();
  await expect(page.getByRole("alert")).toContainText("Couldn’t load this commit’s diff");
  await expect(middle).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("export const revision = 'newest123';", { exact: true })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(
    page.getByText("export const revision = 'middle123';", { exact: true }),
  ).toBeVisible();
});

test("a combined-files read failure offers retry instead of saying there are no changes", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const bridge = window.desktopBridge!;
    const original = bridge.getBranchFiles;
    let failed = false;
    bridge.getBranchFiles = async (...args) => {
      if (!failed) {
        failed = true;
        return {
          ok: false,
          error: {
            code: "permission",
            operation: "getBranchFiles",
            message: "Combined changes could not be read.",
          },
        };
      }
      return original(...args);
    };
  });
  await page.goto("/#/history");
  await page.getByRole("checkbox", { name: /Include Update invoice state URLs/ }).check();
  await page.getByRole("checkbox", { name: /Include Store signup steps/ }).check();
  await expect(page.getByRole("alert")).toContainText("Couldn’t load combined files");
  await expect(page.getByText("No combined changes between these commits.")).toHaveCount(0);
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByRole("treeitem", { name: "combined.ts", exact: true })).toBeVisible();
});

for (const theme of ["light", "dark"] as const) {
  test(`keeps J/K in the commit list when each commit has different files in ${theme}`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.setViewportSize({ width: theme === "light" ? 1440 : 1100, height: 1000 });
    await page.addInitScript(() => {
      const bridge = window.desktopBridge;
      if (!bridge) throw new Error("Missing desktop bridge");
      bridge.getCommitFiles = async (_repo, commitId) => ({
        ok: true,
        value: [
          { path: `src/${commitId}.ts`, previousPath: null, status: "modified" },
          { path: "src/shared.ts", previousPath: null, status: "modified" },
        ],
      });
    });
    await page.goto("/#/history");
    const pane = page.getByRole("complementary", { name: "History commits", exact: true });
    const newest = pane.getByRole("button", { name: /Update invoice state URLs/ });
    const middle = pane.getByRole("button", { name: /Store signup steps/ });
    const oldest = pane.getByRole("button", { name: /Type mock bodies/ });
    const tree = page.locator("file-tree-container");
    await newest.click();
    await expect(tree.getByRole("treeitem", { name: "newest123.ts", exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await page.keyboard.press("j");
    await expect(middle).toHaveAttribute("aria-pressed", "true");
    await expect(tree.getByRole("treeitem", { name: "middle123.ts", exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(middle).toBeFocused();
    await page.keyboard.press("j");
    await expect(oldest).toHaveAttribute("aria-pressed", "true");
    await expect(tree.getByRole("treeitem", { name: "oldest123.ts", exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(oldest).toBeFocused();
    await page.keyboard.press("k");
    await expect(middle).toHaveAttribute("aria-pressed", "true");
    await expect(tree.locator('[data-item-type="file"][aria-selected="true"]')).toHaveCount(1);
    await expect(middle).toBeFocused();
    await page.keyboard.press("k");
    await expect(newest).toHaveAttribute("aria-pressed", "true");
    await expect(newest).toBeFocused();
    await page.keyboard.press("j");
    await expect(middle).toHaveAttribute("aria-pressed", "true");
    await expect(middle).toBeFocused();
    await page.keyboard.press("l");
    await expect(tree.locator('[data-item-focused="true"]')).toBeFocused();
    await page.keyboard.press("h");
    await expect(middle).toBeFocused();
    await page.screenshot({ path: testInfo.outputPath(`history-focus-${theme}.png`) });
  });
}

test("History selects its first file from prepared display order instead of provider order", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const bridge = window.desktopBridge;
    if (!bridge) throw new Error("Missing desktop bridge");
    bridge.getCommitFiles = async () => ({
      ok: true,
      value: [
        { path: "src/z-last.ts", previousPath: null, status: "modified" },
        { path: "src/a-first.ts", previousPath: null, status: "modified" },
      ],
    });
  });
  await page.goto("/#/history");
  const selected = page.locator(
    'file-tree-container [data-item-type="file"][aria-selected="true"]',
  );
  await expect(selected).toHaveAttribute("aria-label", "a-first.ts");
});

for (const theme of ["light", "dark"] as const) {
  test(`keeps commit rows and the list viewport fixed while selecting and virtualizing in ${theme}`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.addInitScript((graph) => {
      const bridge = window.desktopBridge;
      if (!bridge) throw new Error("Missing desktop bridge");
      bridge.getCommitHistory = async () => ({ ok: true, value: graph.commits });
    }, graph);
    await page.goto("/#/history");
    const pane = page.getByRole("complementary", { name: "History commits", exact: true });
    const list = pane.locator('[data-nav-region="history-commits"]');
    const rows = pane.locator('[data-slot="commit-row"]');
    await expect(rows.first()).toBeVisible();
    const heights = await rows.evaluateAll((elements) =>
      elements.map((element) => element.getBoundingClientRect().height),
    );
    expect(heights.length).toBeGreaterThan(0);
    expect(heights.every((height) => height === 46)).toBe(true);
    const bounds = await list.boundingBox();
    if (!bounds) throw new Error("Missing commit viewport");
    await rows.first().getByRole("checkbox").click();
    await expect(
      pane.getByText("Select one more commit to combine", { exact: true }),
    ).toBeVisible();
    const selectedBounds = await list.boundingBox();
    expect(selectedBounds).toEqual(bounds);
    await pane.getByRole("button", { name: "Clear", exact: true }).click();
    await list.evaluate((element) => {
      element.scrollTop = 46 * 400;
    });
    await expect
      .poll(() => rows.first().locator("[data-nav-index]").getAttribute("data-nav-index"))
      .not.toBe("0");
    expect(await rows.count()).toBeLessThan(60);
    expect((await rows.first().boundingBox())?.height).toBe(46);
    const readingCommit = await list
      .locator('[data-nav-index="400"]')
      .getAttribute("data-item-path");
    if (!readingCommit) throw new Error("No visible reading commit");
    const readingRow = list.locator(`[data-item-path="${readingCommit}"]`);
    const readingBounds = await readingRow.boundingBox();
    if (!readingBounds) throw new Error("No reading position");
    await page.evaluate(() => {
      const bridge = window.desktopBridge;
      if (!bridge) throw new Error("Missing desktop bridge");
      const read = bridge.getCommitHistory;
      bridge.getCommitHistory = async (...input) => {
        const result = await read(...input);
        const first = result.ok ? result.value[0] : undefined;
        if (!result.ok || !first) return result;
        return {
          ok: true,
          value: [
            {
              ...first,
              commitId: "fresh-new-commit",
              shortId: "fresh-new",
              summary: "Newly fetched commit",
            },
            ...result.value,
          ],
        };
      };
    });
    await page.getByRole("button", { name: "Refresh repository status", exact: true }).click();
    await expect(pane.getByText("1006", { exact: true })).toBeVisible();
    await expect
      .poll(async () => Math.abs(((await readingRow.boundingBox())?.y ?? 99999) - readingBounds.y))
      .toBeLessThan(1);
    await pane
      .getByRole("textbox", { name: "Filter commits", exact: true })
      .fill("Oldest original");
    await expect(rows).toHaveCount(1);
    expect((await rows.first().boundingBox())?.height).toBe(46);
  });
}
