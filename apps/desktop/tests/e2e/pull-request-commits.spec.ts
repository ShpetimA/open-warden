import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

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
          baseSha: "base123",
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
  test(`image previews recover and remain available in PR commits in ${theme}`, async ({
    page,
  }, testInfo) => {
    const before = await readFile(path.resolve("tests/fixtures/images/before.png"));
    const after = await readFile(path.resolve("tests/fixtures/images/after.png"));
    const packets = {
      before: {
        width: 640,
        height: 320,
        byteLength: before.length,
        mimeType: "image/png" as const,
        dataUrl: `data:image/png;base64,${before.toString("base64")}`,
      },
      after: {
        width: 800,
        height: 400,
        byteLength: after.length,
        mimeType: "image/png" as const,
        dataUrl: `data:image/png;base64,${after.toString("base64")}`,
      },
    };

    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.setViewportSize({ width: theme === "light" ? 1440 : 1100, height: 1000 });
    await page.addInitScript((packets) => {
      const bridge = window.desktopBridge;
      if (!bridge) throw new Error("Expected the test desktop bridge");

      bridge.getBranchFileVersions = async (_repo, _base, _head, name) => ({
        ok: true,
        value: {
          oldFile: {
            kind: "image",
            name,
            byteLength: packets.before.byteLength,
            preview: {
              state: "available",
              width: 640,
              height: 320,
              mimeType: "image/png",
              source: { kind: "git", repoPath: "/projects/invoice", objectId: "a".repeat(40) },
            },
          },
          newFile: {
            kind: "image",
            name,
            byteLength: packets.after.byteLength,
            preview: {
              state: "available",
              width: 800,
              height: 400,
              mimeType: "image/png",
              source: { kind: "git", repoPath: "/projects/invoice", objectId: "b".repeat(40) },
            },
          },
        },
      });
      bridge.getImagePreview = async (source) => {
        if (source.kind === "git" && source.objectId === "a".repeat(40)) {
          return {
            ok: false,
            error: {
              operation: "getImagePreview",
              code: "unavailable",
              message: "Image read interrupted.",
            },
          };
        }

        const packet =
          source.kind === "git" && source.objectId === "a".repeat(40)
            ? packets.before
            : packets.after;
        return {
          ok: true,
          value: {
            width: packet.width,
            height: packet.height,
            byteLength: packet.byteLength,
            mimeType: packet.mimeType,
            bytes: Uint8Array.from(atob(packet.dataUrl.split(",")[1] ?? ""), (character) =>
              character.charCodeAt(0),
            ),
          },
        };
      };
    }, packets);

    await page.goto("/#/pull-requests/bitbucket/team/invoice/114/files");
    await expect(
      page.getByRole("complementary", { name: "Changed files", exact: true }),
    ).toBeVisible();

    await page.getByRole("treeitem", { name: "invoice.test.ts", exact: true }).click();
    await expect(
      page.getByRole("region", { name: "File information", exact: true }).locator("header"),
    ).toContainText("test/invoice.test.ts");
    const beforePreview = page.getByRole("group", { name: "Before image preview", exact: true });
    await expect(beforePreview.getByText("Image read interrupted.", { exact: true })).toBeVisible();
    await page.evaluate((packets) => {
      const bridge = window.desktopBridge;
      if (!bridge) throw new Error("Expected the test desktop bridge");

      bridge.getImagePreview = async (source) => {
        const packet =
          source.kind === "git" && source.objectId === "a".repeat(40)
            ? packets.before
            : packets.after;
        return {
          ok: true,
          value: {
            width: packet.width,
            height: packet.height,
            byteLength: packet.byteLength,
            mimeType: packet.mimeType,
            bytes: Uint8Array.from(atob(packet.dataUrl.split(",")[1] ?? ""), (character) =>
              character.charCodeAt(0),
            ),
          },
        };
      };
    }, packets);
    await beforePreview.getByRole("button", { name: "Retry", exact: true }).click();
    await expect
      .poll(() =>
        beforePreview.getByRole("img").evaluate((image: HTMLImageElement) => image.naturalWidth),
      )
      .toBe(640);
    await expect(page.getByRole("button", { name: "Mark file viewed", exact: true })).toBeVisible();
    await expect(page.locator("diffs-container")).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(`pr-images-${theme}.png`) });

    await page.getByRole("tab", { name: "Commits" }).click();
    await expect
      .poll(() =>
        page
          .getByRole("group", { name: "After image preview", exact: true })
          .getByRole("img")
          .evaluate((image: HTMLImageElement) => image.naturalWidth),
      )
      .toBe(800);
    await page.screenshot({ path: testInfo.outputPath(`pr-commit-images-${theme}.png`) });
  });

  test(`entry metadata stays read only across PR files and commits in ${theme}`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.setViewportSize({ width: theme === "light" ? 1440 : 1100, height: 900 });
    await page.goto("/#/pull-requests/bitbucket/team/invoice/114/files");
    await expect(
      page.getByRole("complementary", { name: "Changed files", exact: true }),
    ).toBeVisible();

    await page.evaluate(() => {
      const bridge = window.desktopBridge;
      if (!bridge) throw new Error("Expected the test desktop bridge");

      bridge.getBranchFileVersions = async (_repo, _base, _head, path) => {
        if (path === "test/invoice.test.ts") {
          return {
            ok: true,
            value: {
              oldFile: { kind: "symlink", name: path, target: "settings/development.json" },
              newFile: { kind: "symlink", name: path, target: "settings/production.json" },
            },
          };
        }

        return {
          ok: true,
          value: {
            oldFile: { kind: "submodule", name: path, commitId: "a".repeat(40) },
            newFile: { kind: "submodule", name: path, commitId: "b".repeat(40) },
          },
        };
      };
    });

    await page.getByRole("treeitem", { name: "invoice.test.ts", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Symbolic link", exact: true })).toBeVisible();
    await expect(page.getByText("settings/production.json", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Mark file viewed", exact: true })).toBeVisible();
    await expect(page.locator("diffs-container")).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(`pr-symlink-${theme}.png`) });

    await page.getByRole("tab", { name: "Commits" }).click();
    await expect(page.getByRole("heading", { name: "Submodule", exact: true })).toBeVisible();
    await expect(page.getByText("a".repeat(40), { exact: true })).toBeVisible();
    await expect(page.getByText("b".repeat(40), { exact: true })).toBeVisible();
    await expect(page.locator("diffs-container")).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(`pr-submodule-${theme}.png`) });
  });

  test(`binary changes remain reviewable in PR files and commits in ${theme}`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.setViewportSize({ width: theme === "light" ? 1440 : 1100, height: 900 });
    await page.goto("/#/pull-requests/bitbucket/team/invoice/114/files");
    await expect(
      page.getByRole("complementary", { name: "Changed files", exact: true }),
    ).toBeVisible();

    await page.evaluate(() => {
      const bridge = window.desktopBridge;

      if (!bridge) throw new Error("Expected the test desktop bridge");

      bridge.getBranchFileVersions = async (_repo, _base, _head, path) => ({
        ok: true,
        value: {
          oldFile: { kind: "binary", name: path, byteLength: 128 },
          newFile: { kind: "binary", name: path, byteLength: 256 },
        },
      });
    });

    await page.getByRole("treeitem", { name: "invoice.test.ts", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Binary file", exact: true })).toBeVisible();
    await expect(page.getByText("128 bytes", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Mark file viewed", exact: true })).toBeVisible();
    await expect(page.locator("diffs-container")).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(`binary-pr-files-${theme}.png`) });

    await page.getByRole("tab", { name: "Commits" }).click();
    await expect(page.getByRole("heading", { name: "Binary file", exact: true })).toBeVisible();
    await expect(page.getByText("256 bytes", { exact: true })).toBeVisible();
    await expect(page.locator("diffs-container")).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(`binary-pr-commit-${theme}.png`) });
  });
}

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
  await expect(sidebar.getByRole("status")).toContainText(
    "No changed files were reported for this pull request.",
  );
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
      bridge.getPullRequestChecks = async () => ({
        ok: true,
        value: { headSha: detail.headSha, checks: [], complete: true, mergeability: "unknown" },
      });
      bridge.getPullRequestFiles = async () => ({ ok: true, value: [] });
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
        bridge.getPullRequestConversation = async () => ({
          ok: true,
          value: { detail, issueComments: [], reviewThreads: [] },
        });
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
    await readNotice("Couldn’t load file statistics")
      .getByRole("button", { name: "Retry", exact: true })
      .click();
    for (const title of [
      "Couldn’t load file statistics",
      "Couldn’t load review status",
      "Couldn’t load checks",
    ]) {
      await expect(readNotice(title)).toHaveCount(0);
    }
    await expect(page.getByRole("button", { name: /1 files/ })).toBeVisible();
    await page.evaluate(() => {
      const bridge = window.desktopBridge;
      if (!bridge) throw new Error("Missing desktop bridge");
      const read = bridge.getPullRequestConversation;
      let fail = true;
      bridge.getPullRequestConversation = async (input) => {
        if (!fail) return read(input);
        fail = false;
        return {
          ok: false,
          error: { operation: "getPullRequestConversation", code: "network", message: "Offline" },
        };
      };
    });
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
              baseSha: "base123",
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

declare global {
  interface Window {
    prRevisionRefreshTest: {
      base: string;
      head: string;
      holdFiles: boolean;
      holdGroups: boolean;
      heldReads: number;
      release(): void;
    };
  }
}

for (const [providerId, theme] of [
  ["bitbucket", "light"],
  ["github", "dark"],
] as const) {
  test(`retains a coherent PR revision through base-only and grouped force-push refresh for ${providerId} in ${theme}`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.setViewportSize({ width: theme === "light" ? 1440 : 1024, height: 900 });
    await page.addInitScript(
      ({ detail, commits, providerId }) => {
        const bridge = window.desktopBridge;
        if (!bridge) throw new Error("Missing desktop bridge");
        const resolveRepo = bridge.resolveHostedRepo;
        bridge.resolveHostedRepo = async (repo) => {
          const result = await resolveRepo(repo);
          return result.ok && result.value
            ? { ok: true, value: { ...result.value, providerId } }
            : result;
        };
        const latest = commits[0];
        if (!latest) throw new Error("Missing initial commit");
        const waiters: Array<() => void> = [];
        const state = {
          base: "base123",
          head: "head123",
          holdFiles: false,
          holdGroups: false,
          heldReads: 0,
          release() {
            state.holdFiles = false;
            state.holdGroups = false;
            for (const resolve of waiters.splice(0)) resolve();
          },
        };
        window.prRevisionRefreshTest = state;
        bridge.getPullRequestConversation = async () => ({
          ok: true,
          value: {
            detail: { ...detail, providerId, baseSha: state.base, headSha: state.head },
            issueComments: [],
            reviewThreads: [],
          },
        });
        bridge.preparePullRequestCompareRefs = async () => ({
          ok: true,
          value: {
            providerId,
            owner: "team",
            repo: "invoice",
            pullRequestNumber: 114,
            baseRef: "main",
            headRef: "validation",
            baseSha: state.base,
            compareBaseRef: `merge-${state.base}`,
            compareHeadRef: state.head,
            localBranch: "validation",
          },
        });
        const readFiles = bridge.getBranchFiles;
        bridge.getBranchCommits = async () => ({
          ok: true,
          value:
            state.head === "head123"
              ? commits
              : [
                  {
                    ...latest,
                    commitId: state.head,
                    shortId: state.head,
                    summary: "Force-pushed invoice changes",
                  },
                ],
        });
        bridge.getBranchFiles = async (repo, base, head) => {
          if (
            (state.holdFiles && base === "merge-base456") ||
            (state.holdGroups && base === "head456^")
          ) {
            state.heldReads += 1;
            await new Promise<void>((resolve) => waiters.push(resolve));
          }
          if (head === "head456")
            return {
              ok: true,
              value: [
                { path: "src/renamed.ts", previousPath: "src/invoice.ts", status: "renamed" },
              ],
            };
          return readFiles(repo, base, head);
        };
      },
      { detail, commits, providerId },
    );
    await page.goto(`/#/pull-requests/${providerId}/team/invoice/114/files`);
    const pane = page.getByRole("complementary", { name: "Changed files", exact: true });
    const tree = pane.locator("file-tree-container");
    const selected = tree.locator('[data-item-type="file"][aria-selected="true"]');
    await expect(selected).toHaveAttribute("aria-label", "invoice.ts");
    await tree.evaluate((element) => element.setAttribute("data-retained-revision", "yes"));
    await page.evaluate(() => {
      window.prRevisionRefreshTest.base = "base456";
      window.prRevisionRefreshTest.holdFiles = true;
    });
    const refresh = page.getByRole("button", { name: "Refresh pull request", exact: true });
    await expect(refresh).toHaveCount(1);
    await refresh.click();
    await expect
      .poll(() => page.evaluate(() => window.prRevisionRefreshTest.heldReads))
      .toBeGreaterThan(0);
    await expect(refresh).toHaveAttribute("aria-busy", "true");
    await expect(
      page.getByRole("status").filter({ hasText: "Showing the previous PR revision" }),
    ).toBeVisible();
    await expect(
      page.getByText("export const revision = 'merge-base123';", { exact: false }),
    ).toBeVisible();
    await expect(tree).toHaveAttribute("data-retained-revision", "yes");
    await expect(
      page.getByRole("button", { name: "Review pull request", exact: true }),
    ).toBeDisabled();
    await page.screenshot({ path: testInfo.outputPath(`base-refresh-${theme}.png`) });
    await page.evaluate(() => window.prRevisionRefreshTest.release());
    await expect(
      page.getByText("export const revision = 'merge-base456';", { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByRole("status").filter({ hasText: "Showing the previous PR revision" }),
    ).toHaveCount(0);
    await expect(selected).toHaveAttribute("aria-label", "invoice.ts");
    await expect(tree).toHaveAttribute("data-retained-revision", "yes");
    await expect(refresh).toHaveAttribute("aria-busy", "false");
    await pane.getByRole("button", { name: "Group review files: Review groups" }).click();
    await page.getByRole("menuitemradio", { name: "Commits", exact: true }).click();
    await expect(pane.getByRole("treeitem", { name: "invoice.ts", exact: true })).toHaveCount(2);
    await tree.evaluate((element) => element.setAttribute("data-retained-revision", "grouped"));
    await page.evaluate(() => {
      window.prRevisionRefreshTest.head = "head456";
      window.prRevisionRefreshTest.holdGroups = true;
      window.prRevisionRefreshTest.heldReads = 0;
    });
    await refresh.click();
    await expect
      .poll(() => page.evaluate(() => window.prRevisionRefreshTest.heldReads))
      .toBeGreaterThan(0);
    await expect(pane.getByRole("treeitem", { name: "invoice.ts", exact: true })).toHaveCount(2);
    await expect(pane.getByRole("treeitem", { name: /Force-pushed invoice changes/ })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("status").filter({ hasText: "Showing the previous PR revision" }),
    ).toBeVisible();
    await expect(tree).toHaveAttribute("data-retained-revision", "grouped");
    await page.evaluate(() => window.prRevisionRefreshTest.release());
    await expect(pane.getByRole("treeitem", { name: "renamed.ts", exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(
      page.getByText("export const revision = 'head456';", { exact: false }),
    ).toBeVisible();
    await expect(tree).toHaveAttribute("data-retained-revision", "grouped");
    await expect(
      page.getByRole("status").filter({ hasText: "Showing the previous PR revision" }),
    ).toHaveCount(0);
  });
}

for (const theme of ["light", "dark"] as const) {
  test(`local review uses the shared refresh action and retains its tree on failure in ${theme}`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.setViewportSize({ width: theme === "light" ? 1440 : 1024, height: 900 });
    await page.addInitScript(
      ({ detail }) => {
        const bridge = window.desktopBridge;
        if (!bridge || !detail.author) throw new Error("Missing review fixture");
        const author = detail.author;
        bridge.resolveActivePullRequestForBranch = async () => ({
          ok: true,
          value: {
            ...detail,
            author,
            headOwner: "team",
            headRepo: "invoice",
            reviewers: [],
            reviewDecision: null,
            checksState: null,
            commentCount: 0,
            additions: null,
            deletions: null,
            changedFiles: null,
          },
        });
      },
      { detail },
    );
    await page.goto("/#/pull-requests/bitbucket/team/invoice/114/local-files");
    const refresh = page.getByRole("button", { name: "Refresh pull request", exact: true });
    await expect(refresh).toHaveCount(1);
    const tree = page.locator("file-tree-container");
    await expect(tree).toBeVisible();
    const selected = tree.locator('[data-item-type="file"][aria-selected="true"]');
    await expect(selected).toHaveAttribute("aria-label", "invoice.ts");
    await tree.evaluate((element) => element.setAttribute("data-local-refresh", "retained"));
    const viewportBeforeRefresh = await tree.boundingBox();
    await page.evaluate(() => {
      const bridge = window.desktopBridge;
      if (!bridge) throw new Error("Missing desktop bridge");
      const prepare = bridge.preparePullRequestCompareRefs;
      let fail = true;
      bridge.preparePullRequestCompareRefs = async (input) => {
        if (!fail) return prepare(input);
        fail = false;
        return {
          ok: false,
          error: {
            operation: "preparePullRequestCompareRefs",
            code: "network",
            message: "Offline",
          },
        };
      };
    });
    await refresh.focus();
    await page.keyboard.press("Enter");
    const notice = page
      .getByRole("status")
      .filter({ hasText: "Couldn’t refresh this pull request" });
    await expect(notice).toBeVisible();
    await expect(tree).toHaveAttribute("data-local-refresh", "retained");
    expect(await tree.boundingBox()).toEqual(viewportBeforeRefresh);
    await expect(selected).toHaveAttribute("aria-label", "invoice.ts");
    await expect(refresh).toBeFocused();
    await page.screenshot({ path: testInfo.outputPath(`local-review-refresh-${theme}.png`) });
    await notice.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(notice).toHaveCount(0);
    await expect(tree).toHaveAttribute("data-local-refresh", "retained");
    await expect(selected).toHaveAttribute("aria-label", "invoice.ts");
  });
}

for (const view of ["files", "commits"] as const) {
  test(`the shared refresh action recovers a failed ${view} read without a head change`, async ({
    page,
  }) => {
    await page.addInitScript((view) => {
      const bridge = window.desktopBridge;
      if (!bridge) throw new Error("Missing desktop bridge");
      const readFiles = bridge.getBranchFiles;
      let fail = true;
      bridge.getBranchFiles = async (...input) => {
        const target = view === "files" ? input[1] === "base123" : input[1] === "head123^";
        if (!fail || !target) return readFiles(...input);
        fail = false;
        return {
          ok: false,
          error: { operation: "getBranchFiles", code: "unavailable", message: "Git read failed" },
        };
      };
    }, view);
    await page.goto("/#/pull-requests/bitbucket/team/invoice/114/files");
    if (view === "commits") await page.getByRole("tab", { name: "Commits", exact: true }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Couldn’t load changed files" }),
    ).toContainText("Git read failed");
    await page.getByRole("button", { name: "Refresh pull request", exact: true }).click();
    await expect(page.getByRole("treeitem", { name: "invoice.ts", exact: true })).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
  });
}

test("background revision refresh preserves the open review draft and editor focus while submission pauses", async ({
  page,
}) => {
  await page.addInitScript(
    ({ detail }) => {
      const bridge = window.desktopBridge;
      if (!bridge) throw new Error("Missing desktop bridge");
      let head = detail.headSha;
      let release: (() => void) | undefined;
      const readFiles = bridge.getBranchFiles;
      bridge.getPullRequestConversation = async () => ({
        ok: true,
        value: { detail: { ...detail, headSha: head }, issueComments: [], reviewThreads: [] },
      });
      const prepare = bridge.preparePullRequestCompareRefs;
      bridge.preparePullRequestCompareRefs = async (input) => {
        const result = await prepare(input);
        return result.ok ? { ok: true, value: { ...result.value, compareHeadRef: head } } : result;
      };
      bridge.getBranchFiles = async (repo, base, revision) => {
        if (revision === "head456")
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        return readFiles(repo, base, revision);
      };
      Object.assign(window, {
        reviewRefreshTest: {
          changeHead() {
            head = "head456";
            window.dispatchEvent(new Event("focus"));
          },
          held() {
            return release !== undefined;
          },
          release() {
            if (!release) throw new Error("New files are not pending");
            release();
          },
        },
      });
    },
    { detail },
  );
  await page.goto("/#/pull-requests/bitbucket/team/invoice/114/files");
  await expect(page.getByRole("treeitem", { name: "invoice.ts", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Review pull request", exact: true }).click();
  const editor = page.getByRole("textbox", { name: "Review message" });
  await editor.fill("Keep this review draft while the branch changes.");
  const confirm = page.getByRole("button", { name: "Submit review", exact: false });
  await expect(confirm).toBeEnabled();
  await page.evaluate(() => window.reviewRefreshTest.changeHead());
  await expect.poll(() => page.evaluate(() => window.reviewRefreshTest.held())).toBe(true);
  await expect(confirm).toBeDisabled();
  await expect(editor).toHaveValue("Keep this review draft while the branch changes.");
  await expect(editor).toBeFocused();
  await page.evaluate(() => window.reviewRefreshTest.release());
  await expect(confirm).toBeEnabled();
  await expect(editor).toHaveValue("Keep this review draft while the branch changes.");
  await expect(editor).toBeFocused();
});

declare global {
  interface Window {
    reviewRefreshTest: { changeHead(): void; held(): boolean; release(): void };
  }
}

async function configureLayoutStability(page: Page, body: string, delayInitialActivity = false) {
  await page.addInitScript(
    ({ detail, body, delayInitialActivity }) => {
      const bridge = window.desktopBridge;
      if (!bridge) throw new Error("Missing desktop bridge");
      const activityWaiters: Array<() => void> = [];
      const metadataWaiters: Array<() => void> = [];
      const comparisonWaiters: Array<() => void> = [];
      const state = {
        phase: 0,
        holdActivity: delayInitialActivity,
        holdMetadata: delayInitialActivity,
        pendingActivity: false,
        holdComparison: delayInitialActivity,
        pendingComparison: false,
        releaseComparison() {
          state.holdComparison = false;
          for (const resolve of comparisonWaiters.splice(0)) resolve();
        },
        releaseActivity() {
          state.holdActivity = false;
          for (const resolve of activityWaiters.splice(0)) resolve();
        },
        releaseMetadata() {
          state.holdMetadata = false;
          for (const resolve of metadataWaiters.splice(0)) resolve();
        },
        beginRefresh() {
          state.phase += 1;
          state.holdActivity = true;
          state.pendingActivity = false;
        },
      };
      window.layoutStability = state;
      const prepare = bridge.preparePullRequestCompareRefs;
      bridge.preparePullRequestCompareRefs = async (input) => {
        if (state.holdComparison) {
          state.pendingComparison = true;
          await new Promise<void>((resolve) => comparisonWaiters.push(resolve));
        }
        return prepare(input);
      };
      bridge.getPullRequestConversation = async () => ({
        ok: true,
        value: {
          detail: { ...detail, body: state.phase ? `Updated description.\n\n${body}` : body },
          issueComments: [],
          reviewThreads: [],
        },
      });
      bridge.getPullRequestReviewOverview = async () => ({
        ok: true,
        value: { reviewers: [], viewerLogin: "alice", canManageReviewers: false },
      });
      bridge.getPullRequestChecks = async () => {
        if (state.holdMetadata) await new Promise<void>((resolve) => metadataWaiters.push(resolve));
        return {
          ok: true,
          value: {
            headSha: detail.headSha,
            complete: true,
            mergeability: "mergeable",
            checks: [{ id: "build", name: "Build", state: "passed", description: null, url: null }],
          },
        };
      };
      bridge.getPullRequestFiles = async () => {
        if (state.holdMetadata) await new Promise<void>((resolve) => metadataWaiters.push(resolve));
        return {
          ok: true,
          value: [
            {
              path: "src/invoice.ts",
              previousPath: null,
              status: "modified",
              additions: 1234,
              deletions: 456,
            },
          ],
        };
      };
      bridge.getPullRequestActivity = async () => {
        if (state.holdActivity) {
          state.pendingActivity = true;
          await new Promise<void>((resolve) => activityWaiters.push(resolve));
        }
        const actor = { login: "alice", displayName: "Alice", avatarUrl: null };
        return {
          ok: true,
          value: {
            truncated: false,
            items: [
              ...Array.from({ length: state.phase }, (_, index) => ({
                id: `remote-${index}`,
                kind: "event" as const,
                event: index % 2 ? ("edited" as const) : ("renamed" as const),
                detail: `Remote change ${index}`,
                body: null,
                actor,
                occurredAt: `2026-10-26T00:00:${30 + index}Z`,
                url: null,
              })),
              ...Array.from({ length: 30 }, (_, index) => ({
                id: `push-${index}`,
                kind: "commit" as const,
                commitSha: `sha-${index}`,
                message: `Invoice change ${index}`,
                actor: index % 2 ? { ...actor, login: "bob", displayName: "Bob" } : actor,
                occurredAt: `2026-10-26T00:${String(index + 1).padStart(2, "0")}:00Z`,
                url: null,
              })),
            ],
          },
        };
      };
    },
    { detail, body, delayInitialActivity },
  );
}

for (const theme of ["light", "dark"] as const) {
  for (const outcome of ["loaded", "failed", "portrait"] as const) {
    test(`reserves the image frame through delayed ${outcome} media in ${theme}`, async ({
      page,
    }, testInfo) => {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.setViewportSize({ width: theme === "light" ? 1440 : 1024, height: 900 });
      let releaseImage: (() => void) | undefined;
      const held = new Promise<void>((resolve) => {
        releaseImage = resolve;
      });
      await page.route("https://layout.test/attachment.svg", async (route) => {
        await held;
        if (outcome === "failed") {
          await route.abort("failed");
          return;
        }
        await route.fulfill({
          status: outcome === "loaded" ? 200 : 404,
          contentType: "image/svg+xml",
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200"><rect width="1600" height="1200" fill="#334155"/></svg>',
        });
      });
      await configureLayoutStability(
        page,
        outcome === "portrait"
          ? '<img src="https://layout.test/attachment.svg" width="180" height="300" alt="Invoice screenshot" />\n\nText below the attachment.'
          : "![Invoice screenshot](https://layout.test/attachment.svg)\n\nText below the attachment.",
      );
      await page.goto("/#/pull-requests/bitbucket/team/invoice/114/overview");
      const frame = page.locator('[data-slot="markdown-image-frame"]');
      await expect(frame).toHaveAttribute("aria-busy", "true");
      await expect(page.getByRole("button", { name: "Show less", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Read more", exact: true })).toHaveCount(0);
      const imageBounds = await frame.boundingBox();
      const composer = page.locator('[data-timeline-anchor="composer"]');
      const composerBounds = await composer.boundingBox();
      if (!imageBounds || !composerBounds || !releaseImage)
        throw new Error("Preview was not reserved");
      expect(imageBounds.height).toBeGreaterThan(150);
      if (outcome === "portrait") {
        expect(imageBounds.width).toBe(180);
        expect(imageBounds.height).toBe(300);
      }
      await page.screenshot({ path: testInfo.outputPath(`image-pending-${theme}.png`) });
      releaseImage();
      await expect(frame).toHaveAttribute("aria-busy", "false");
      if (outcome !== "failed")
        await expect(frame.locator("img")).toHaveJSProperty("naturalWidth", 1600);
      else await expect(frame.getByRole("link", { name: /Open original image/ })).toBeVisible();
      const completed = await frame.boundingBox();
      const completedComposer = await composer.boundingBox();
      if (!completed || !completedComposer) throw new Error("Preview disappeared");
      expect(Math.abs(completed.height - imageBounds.height)).toBeLessThan(1);
      expect(Math.abs(completedComposer.y - composerBounds.y)).toBeLessThan(1);
      if (outcome === "loaded") {
        await page.evaluate(() => window.layoutStability.beginRefresh());
        await page.getByRole("button", { name: "Refresh pull request", exact: true }).click();
        await expect
          .poll(() => page.evaluate(() => window.layoutStability.pendingActivity))
          .toBe(true);
        await page.evaluate(() => window.layoutStability.releaseActivity());
        await expect(page.getByText("Updated description.", { exact: false })).toHaveCount(1);
        await expect(page.getByRole("button", { name: "Show less", exact: true })).toBeVisible();
      }
      await page.screenshot({ path: testInfo.outputPath(`image-${outcome}-${theme}.png`) });
    });
  }

  test(`shows description immediately, adds the composer last and preserves the reader during refresh in ${theme}`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.setViewportSize({ width: theme === "light" ? 1440 : 1024, height: 900 });
    await configureLayoutStability(page, "Read the original description.", true);
    await page.goto("/#/pull-requests/bitbucket/team/invoice/114/overview");
    await expect(page.getByText("Read the original description.", { exact: true })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "Loading conversation…" })).toHaveCount(
      0,
    );
    await expect(page.locator('[data-slot="pr-timeline"]')).toBeVisible();
    await expect(page.getByText("Invoice change 0", { exact: true })).toHaveCount(0);
    await expect(
      page.getByPlaceholder("Add a comment… Markdown and @mentions supported"),
    ).toHaveCount(0);
    const grid = page.locator('[data-slot="pr-status-row"]');
    const header = grid.locator("..");
    const before = await header.boundingBox();
    await page.evaluate(() => window.layoutStability.releaseMetadata());
    await expect(grid.getByText("Checks passed", { exact: true })).toBeVisible();
    await expect(grid.getByRole("button", { name: /1 files/ })).toBeVisible();
    const after = await header.boundingBox();
    if (!before || !after) throw new Error("Missing PR header");
    expect(Math.abs(after.height - before.height)).toBeLessThan(1);
    const gaps = await grid.evaluate((element) => {
      const children = Array.from(element.children).map((child) => child.getBoundingClientRect());
      return children.slice(1, -1).map((child, index) => child.left - children[index].right);
    });
    expect(gaps.every((gap) => gap < 12)).toBe(true);
    await expect(page.locator('[data-timeline-anchor="composer"]')).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(`description-first-${theme}.png`) });
    await page.evaluate(() => window.layoutStability.releaseActivity());
    await expect
      .poll(() => page.evaluate(() => window.layoutStability.pendingComparison))
      .toBe(true);
    await expect(page.getByText("Read the original description.", { exact: true })).toBeVisible();
    await expect(
      page.getByPlaceholder("Add a comment… Markdown and @mentions supported"),
    ).toHaveCount(0);
    await page.evaluate(() => window.layoutStability.releaseComparison());
    const timeline = page.locator('[data-slot="pr-timeline"]');
    await expect(timeline).toBeVisible();
    await expect(page.getByText("Invoice change 0", { exact: true })).toBeVisible();
    await expect(
      page.getByPlaceholder("Add a comment… Markdown and @mentions supported"),
    ).toHaveCount(1);
    const scroller = page.locator("[data-workspace-scroll]");
    await scroller.evaluate(async (element) => {
      element.scrollTop = 900;
      await new Promise(requestAnimationFrame);
    });
    const anchor = await scroller.evaluate((element) => {
      const top = element.getBoundingClientRect().top;
      const row = Array.from(element.querySelectorAll<HTMLElement>("[data-timeline-anchor]")).find(
        (item) => item.getBoundingClientRect().bottom > top,
      );
      if (!row) throw new Error("No reading anchor");
      return { id: row.dataset.timelineAnchor, top: row.getBoundingClientRect().top };
    });
    const row = page.locator(`[data-timeline-anchor="${anchor.id}"]`);
    await page.evaluate(() => window.layoutStability.beginRefresh());
    await page.getByRole("button", { name: "Refresh pull request", exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.layoutStability.pendingActivity)).toBe(true);
    await expect(page.getByText("Updated description.", { exact: false })).toHaveCount(0);
    await page.evaluate(() => window.layoutStability.releaseActivity());
    await expect(page.getByText(/renamed this: Remote change 0/)).toHaveCount(1);
    await expect
      .poll(async () => Math.abs(((await row.boundingBox())?.y ?? 99999) - anchor.top))
      .toBeLessThan(1);
    const editor = page.getByPlaceholder("Add a comment… Markdown and @mentions supported");
    await editor.fill("Keep this draft and focus while activity arrives.");
    const editorTop = await editor.evaluate((element) => element.getBoundingClientRect().top);
    await page.evaluate(() => {
      window.layoutStability.beginRefresh();
      window.dispatchEvent(new Event("focus"));
    });
    await expect.poll(() => page.evaluate(() => window.layoutStability.pendingActivity)).toBe(true);
    await page.evaluate(() => window.layoutStability.releaseActivity());
    await expect(page.getByText(/edited the description/)).toHaveCount(1);
    await expect(editor).toHaveValue("Keep this draft and focus while activity arrives.");
    await expect(editor).toBeFocused();
    expect(
      Math.abs(
        (await editor.evaluate((element) => element.getBoundingClientRect().top)) - editorTop,
      ),
    ).toBeLessThan(1);
    await page.screenshot({ path: testInfo.outputPath(`timeline-stable-${theme}.png`) });
  });
}

declare global {
  interface Window {
    layoutStability: {
      pendingActivity: boolean;
      pendingComparison: boolean;
      releaseComparison(): void;
      releaseActivity(): void;
      releaseMetadata(): void;
      beginRefresh(): void;
    };
  }
}

for (const theme of ["light", "dark"] as const) {
  test(`opens linked images in the lightbox without downloading for pointer and keyboard in ${theme}`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.setViewportSize({ width: theme === "light" ? 1440 : 1024, height: 900 });
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450"><rect width="800" height="450" fill="#334155"/><text x="400" y="230" text-anchor="middle" fill="white" font-size="28">Invoice screenshot</text></svg>';
    let originalRequests = 0;
    const popups: Page[] = [];
    const downloads: string[] = [];
    page.on("popup", (popup) => popups.push(popup));
    page.on("download", (download) => downloads.push(download.suggestedFilename()));
    await page.route("https://layout.test/*.svg", async (route) => {
      await route.fulfill({ contentType: "image/svg+xml", body: svg });
    });
    await page.route("https://layout.test/original.png", async (route) => {
      originalRequests += 1;
      await route.fulfill({
        headers: { "content-disposition": 'attachment; filename="invoice.png"' },
        contentType: "image/png",
        body: "Unexpected download",
      });
    });
    await page.addInitScript(() => {
      window.linkedImageActivations = [];
      window.addEventListener(
        "click",
        (event) => {
          if (
            !(event.target instanceof Element) ||
            !event.target.closest('[data-slot="markdown-image-frame"] button')
          )
            return;
          requestAnimationFrame(() => window.linkedImageActivations.push(event.defaultPrevented));
        },
        true,
      );
    });
    await configureLayoutStability(
      page,
      "[![Invoice screenshot](https://layout.test/preview.svg)](https://layout.test/original.png)\n\n![Second screenshot](https://layout.test/second.svg)",
    );
    await page.goto("/#/pull-requests/bitbucket/team/invoice/114/overview");
    await expect(page.getByRole("button", { name: "Show less", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Read more", exact: true })).toHaveCount(0);
    const thumbnail = page.getByRole("button", {
      name: "Open image: Invoice screenshot",
      exact: true,
    });
    await expect(thumbnail.locator("img")).toHaveJSProperty("naturalWidth", 800);
    await thumbnail.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("1 / 2");
    await dialog.getByRole("button", { name: "Next image", exact: true }).click();
    await expect(dialog).toContainText("2 / 2");
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await thumbnail.focus();
    await page.keyboard.press("Enter");
    await expect(dialog).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => window.linkedImageActivations))
      .toEqual([true, true]);
    expect(originalRequests).toBe(0);
    expect(popups).toHaveLength(0);
    expect(downloads).toHaveLength(0);
    await expect(dialog.locator("img")).toHaveJSProperty("naturalWidth", 800);
    await page.screenshot({ path: testInfo.outputPath(`linked-image-lightbox-${theme}.png`) });
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });
}

declare global {
  interface Window {
    linkedImageActivations: boolean[];
  }
}

test.use({ video: { mode: "on", size: { width: 1440, height: 900 } } });

test.describe("Focused review panel", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`review drafts and retry work in ${theme}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: theme === "light" ? 1440 : 1100, height: 900 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.addInitScript(
        ({ detail }) => {
          const bridge = window.desktopBridge;
          if (!bridge) throw new Error("Missing desktop bridge");
          const loadSession = bridge.loadWorkspaceSession;
          let attempts = 0;

          bridge.loadWorkspaceSession = async () => {
            const saved = localStorage.getItem("review-demo-session");
            if (saved) return { ok: true, value: JSON.parse(saved) };
            const result = await loadSession();
            return result.ok
              ? {
                  ok: true,
                  value: {
                    ...result.value,
                    comments: [
                      {
                        type: "annotation",
                        id: "note",
                        repoPath: "/projects/invoice",
                        filePath: "src/invoice.ts",
                        bucket: "unstaged",
                        startLine: 3,
                        endLine: 4,
                        side: "additions",
                        text: "Can we also test a zero amount?",
                        contextKind: "review",
                        baseRef: detail.baseSha,
                        headRef: detail.headSha,
                      },
                    ],
                  },
                }
              : result;
          };
          bridge.saveWorkspaceSession = async (session) => {
            localStorage.setItem("review-demo-session", JSON.stringify(session));
            return { ok: true, value: session };
          };
          bridge.submitPullRequestReview = async () => {
            attempts += 1;
            await new Promise((resolve) => setTimeout(resolve, 650));
            if (attempts === 1)
              return {
                ok: false,
                error: {
                  operation: "submitPullRequestReview",
                  code: "network",
                  message: "Could not reach Bitbucket. Your draft is safe.",
                },
              };
            return {
              ok: true,
              value: { submittedDraftIds: ["note"], decisionSubmitted: true, failedMessage: null },
            };
          };
        },
        { theme, detail },
      );

      await page.goto("/#/pull-requests/bitbucket/team/invoice/114/files");
      const review = page.getByRole("button", { name: "Review pull request", exact: true });
      await expect(review).toBeEnabled();
      await review.click();
      await expect(page.getByText("1 pending inline comment", { exact: true })).toBeVisible();
      await page.getByRole("radio", { name: "Request changes", exact: true }).check();
      const submit = page.getByRole("button", { name: /Submit review/ });
      await expect(submit).toBeDisabled();
      const message = page.getByRole("textbox", { name: /Review message/ });
      await message.fill("Please cover zero amounts before merging. The rest looks good.");
      await message.press("ArrowLeft");
      await expect(message).toBeFocused();
      await message.press("Escape");
      await expect(page.getByRole("dialog")).not.toBeVisible();
      await expect(review).toBeFocused();
      await page.reload();
      await review.click();
      await expect(message).toHaveValue(
        "Please cover zero amounts before merging. The rest looks good.",
      );
      await submit.click();
      await expect(page.getByRole("button", { name: "Close review" })).toBeDisabled();
      await message.press("Escape");
      await expect(page.getByRole("dialog")).toBeVisible();
      await expect(page.getByText("Could not reach Bitbucket. Your draft is safe.")).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(`review-${theme}.png`) });
      await expect(message).toHaveValue(
        "Please cover zero amounts before merging. The rest looks good.",
      );
      await page.getByRole("button", { name: "Retry review" }).click();
      await expect(page.getByRole("dialog")).not.toBeVisible();
      await expect(page.getByText("Review submitted", { exact: true })).toBeVisible();
    });
  }
});
