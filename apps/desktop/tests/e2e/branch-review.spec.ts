import { expect, test, type Page } from "@playwright/test";
import { createAppSettings } from "../../src/platform/desktop/appSettings";
import type {
  CloseLspDocumentInput,
  DesktopHandlers,
  GetLspHoverInput,
  GetLspReferencesInput,
  LspDiagnosticsEvent,
  SyncLspDocumentInput,
} from "../../src/platform/desktop/contracts";

declare global {
  interface Window {
    branchReviewLsp: {
      synced: SyncLspDocumentInput[];
      closed: CloseLspDocumentInput[];
      hovers: GetLspHoverInput[];
      references: GetLspReferencesInput[];
    };
    branchReviewClipboard: { text: string; reject: boolean };
  }
}

if (process.env.OPEN_WARDEN_BROWSER_EXECUTABLE) {
  test.use({ launchOptions: { executablePath: process.env.OPEN_WARDEN_BROWSER_EXECUTABLE } });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ({ settings }) => {
      const diagnosticsListeners = new Set<(event: LspDiagnosticsEvent) => void>();

      window.branchReviewLsp = { synced: [], closed: [], hovers: [], references: [] };
      window.branchReviewClipboard = { text: "", reject: false };

      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          async writeText(text: string) {
            if (window.branchReviewClipboard.reject) {
              throw new Error("Clipboard unavailable");
            }

            window.branchReviewClipboard.text = text;
          },
        },
      });

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
        syncLspDocument: async (input) => {
          window.branchReviewLsp.synced.push(input);

          for (const listener of diagnosticsListeners) {
            listener({
              repoPath: input.repoPath,
              relPath: input.relPath,
              languageId: "typescript",
              diagnostics: [],
              reason: null,
            });
          }
        },
        closeLspDocument: async (input) => {
          window.branchReviewLsp.closed.push(input);
        },
        getLspHover: async (input) => {
          window.branchReviewLsp.hovers.push(input);
          return { text: "Branch token information" };
        },
        getLspReferences: async (input) => {
          window.branchReviewLsp.references.push(input);
          return [
            {
              repoPath: input.repoPath,
              relPath: input.relPath,
              uri: `file://${input.repoPath}/${input.relPath}`,
              line: 1,
              character: 13,
              endLine: 1,
              endCharacter: 16,
            },
          ];
        },
        getRepoFile: async ({ relPath }) => ({ name: relPath, contents: "export const ref = 1;" }),
      };
      const bridge = Object.fromEntries(
        Object.entries(handlers).map(([method, handler]) => [
          method,
          async (...args: unknown[]) => ({ ok: true, value: await handler(...args) }),
        ]),
      );
      Object.assign(bridge, {
        onUpdateState: () => () => {},
        onLspDiagnostics: (listener: (event: LspDiagnosticsEvent) => void) => {
          diagnosticsListeners.add(listener);
          return () => diagnosticsListeners.delete(listener);
        },
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

for (const theme of ["light", "dark"] as const) {
  test(`retains the branch tree through refresh errors and recovers initial failures in ${theme}`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.setViewportSize({ width: theme === "light" ? 1280 : 1600, height: 900 });
    await page.addInitScript(() => {
      const bridge = window.desktopBridge!;
      const original = bridge.getBranchFiles;
      let reads = 0;
      bridge.getBranchFiles = async (...args) => {
        reads += 1;
        if (reads === 1 || reads === 3)
          return {
            ok: false,
            error: {
              code: "permission",
              operation: "getBranchFiles",
              message: "These compared files could not be read. Retry this read.",
            },
          };
        return original(...args);
      };
    });
    await page.goto("/#/review");
    await expect(page.getByRole("alert")).toContainText("Couldn’t load compared files");
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    const tree = page.locator("file-tree-container");
    await expect(tree).toBeVisible();
    await tree.evaluate((element) => {
      element.dataset.retained = "yes";
    });
    await page.evaluate(async () => {
      const urls = performance.getEntriesByType("resource").map((entry) => entry.name);
      const storeUrl = urls.find((url) => url.includes("/src/app/store.ts"));
      const apiUrl = urls.find((url) => url.includes("/features/source-control/api.ts"));
      if (!storeUrl || !apiUrl) throw new Error("Missing public repository query modules");
      const { store } = await import(storeUrl);
      const { gitApi } = await import(apiUrl);
      store.dispatch(gitApi.util.invalidateTags(["BranchFiles"]));
    });
    const notice = page.getByRole("status").filter({ hasText: "Couldn’t refresh" });
    await expect(notice).toBeVisible();
    await expect(tree).toHaveAttribute("data-retained", "yes");
    await page.screenshot({
      path: testInfo.outputPath(`branch-retained-error-${theme}.png`),
      animations: "disabled",
    });
    await notice.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(notice).toHaveCount(0);
    await expect(tree).toHaveAttribute("data-retained", "yes");
  });
}

async function seedBranchReviewComments(page: Page) {
  await page.evaluate(async () => {
    const urls = performance.getEntriesByType("resource").map((entry) => entry.name);
    const storeUrl = urls.find((url) => url.includes("/src/app/store.ts"));
    const commentsUrl = urls.find((url) => url.includes("/features/comments/commentsSlice.ts"));

    if (!storeUrl || !commentsUrl) {
      throw new Error("Missing public comment modules");
    }

    const { store } = await import(storeUrl);
    const { addComment } = await import(commentsUrl);
    const comments = [
      { id: "first", filePath: "src/feature-00/file-0000.ts", text: "First review note" },
      { id: "second", filePath: "src/feature-00/file-0001.ts", text: "Second review note" },
      { id: "other-pair", headRef: "other-head", text: "Other comparison" },
      { id: "other-repo", repoPath: "/projects/other", text: "Other repository" },
      { id: "working-copy", contextKind: "changes", text: "Working copy note" },
    ];

    for (const comment of comments) {
      store.dispatch(
        addComment({
          type: "annotation",
          repoPath: "/projects/review",
          filePath: "src/feature-00/file-0000.ts",
          bucket: "unstaged",
          startLine: 1,
          endLine: 1,
          side: "additions",
          contextKind: "review",
          baseRef: "main",
          headRef: "feature/current",
          ...comment,
        }),
      );
    }
  });
}

for (const theme of ["light", "dark"] as const) {
  test(`copies every comment in the branch comparison and keeps other contexts in ${theme}`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/#/review");

    const copyAll = page.getByRole("button", {
      name: "Copy all branch review comments",
      exact: true,
    });

    await expect(copyAll).toBeDisabled();
    await expect(page.getByText("No diagnostics reported.", { exact: true })).toBeVisible();
    await seedBranchReviewComments(page);
    await expect(page.getByText("2 review comments", { exact: true })).toBeVisible();

    await page.screenshot({ path: testInfo.outputPath(`branch-actions-${theme}-wide.png`) });
    await page.setViewportSize({ width: 1000, height: 800 });
    await expect(copyAll).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`branch-actions-${theme}-narrow.png`) });

    await copyAll.click();
    await expect(copyAll).toBeDisabled();
    expect(await page.evaluate(() => window.branchReviewClipboard.text)).toBe(
      "@src/feature-00/file-0000.ts#L1 - First review note\n" +
        "@src/feature-00/file-0001.ts#L1 - Second review note",
    );

    const remaining = await page.evaluate(async () => {
      const storeUrl = performance
        .getEntriesByType("resource")
        .map((entry) => entry.name)
        .find((url) => url.includes("/src/app/store.ts"));

      if (!storeUrl) {
        throw new Error("Missing public store module");
      }

      const { store } = await import(storeUrl);
      return store.getState().comments.map((comment: { id: string }) => comment.id);
    });

    expect(remaining).toEqual(["other-pair", "other-repo", "working-copy"]);
  });
}

test("keeps branch comments after clipboard failure and supports the copy-all shortcut", async ({
  page,
}) => {
  await page.goto("/#/review");
  await expect(page.getByText("No diagnostics reported.", { exact: true })).toBeVisible();
  await seedBranchReviewComments(page);
  await page.evaluate(() => {
    window.branchReviewClipboard.reject = true;
  });

  const copyAll = page.getByRole("button", {
    name: "Copy all branch review comments",
    exact: true,
  });

  await copyAll.click();
  await expect(
    page.getByText("Couldn’t copy review comments. Your comments are unchanged.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("2 review comments", { exact: true })).toBeVisible();
  await expect(copyAll).toBeEnabled();

  await page.evaluate(() => {
    window.branchReviewClipboard.reject = false;
  });
  await page.locator("body").click({ position: { x: 800, y: 60 } });
  await page.keyboard.press("ControlOrMeta+Alt+c");
  await expect(copyAll).toBeDisabled();
  expect(await page.evaluate(() => window.branchReviewClipboard.text)).toContain(
    "Second review note",
  );
});

test("uses the compared file text for token info and references, and closes old LSP documents", async ({
  page,
}) => {
  await page.goto("/#/review");
  await expect(page.getByText("No diagnostics reported.", { exact: true })).toBeVisible();

  const firstPath = "src/feature-00/file-0000.ts";
  const synced = await page.evaluate(() => window.branchReviewLsp.synced);

  expect(synced).toContainEqual({
    repoPath: "/projects/review",
    relPath: firstPath,
    text: "export const ref = 'feature/current';",
  });

  const token = page
    .locator("[data-line-type='change-addition'] [data-char]")
    .filter({ hasText: /^ref$/ })
    .first();

  await token.click({ modifiers: ["ControlOrMeta"] });
  await expect(page.getByText("Branch token information", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.branchReviewLsp.hovers)).toContainEqual({
    repoPath: "/projects/review",
    relPath: firstPath,
    line: 1,
    character: 13,
  });

  await page.keyboard.press("Escape");
  await token.click({ modifiers: ["Alt"] });
  await expect(page.getByText("- References (1)", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.branchReviewLsp.references)).toContainEqual({
    repoPath: "/projects/review",
    relPath: firstPath,
    line: 1,
    character: 13,
    includeDeclaration: false,
  });

  await page.keyboard.press("Escape");
  await token.click({ modifiers: ["ControlOrMeta"] });
  await expect(page.getByText("Branch token information", { exact: true })).toBeVisible();

  const compare = page.getByRole("combobox", { name: "Compare branch", exact: true });

  await compare.fill("invoice-validation");
  await compare.press("Enter");
  await expect(page.getByText("Branch token information", { exact: true })).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => window.branchReviewLsp.synced.at(-1)?.text))
    .toBe("export const ref = 'origin/fix/invoice-validation';");

  await page.getByRole("treeitem", { name: "file-0001.ts", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.branchReviewLsp.closed))
    .toContainEqual({
      repoPath: "/projects/review",
      relPath: firstPath,
    });
  await expect
    .poll(() => page.evaluate(() => window.branchReviewLsp.synced.at(-1)?.relPath))
    .toBe("src/feature-00/file-0001.ts");

  await page.goto("/#/changes");
  await expect
    .poll(() => page.evaluate(() => window.branchReviewLsp.closed))
    .toContainEqual({
      repoPath: "/projects/review",
      relPath: "src/feature-00/file-0001.ts",
    });
});

test("does not query the compare-side language server for deleted file tokens", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const bridge = window.desktopBridge;

    if (!bridge) {
      throw new Error("Missing desktop fixture");
    }

    bridge.getBranchFileVersions = async (_repo, _base, _head, path) => ({
      ok: true,
      value: {
        oldFile: { name: path, contents: "export const deleted = 1;" },
        newFile: null,
      },
    });
  });

  await page.goto("/#/review");

  const deletedToken = page
    .locator("[data-line-type='change-deletion'] [data-char]")
    .filter({ hasText: /^deleted$/ })
    .first();

  await expect(deletedToken).toBeVisible();
  await deletedToken.click({ modifiers: ["ControlOrMeta"] });

  expect(await page.evaluate(() => window.branchReviewLsp.synced)).toEqual([]);
  expect(await page.evaluate(() => window.branchReviewLsp.hovers)).toEqual([]);
  await expect(page.getByText("Checking diagnostics…", { exact: true })).toHaveCount(0);
});

for (const theme of ["light", "dark"] as const) {
  test(`opens an LSP result at its line and returns to the same branch comparison in ${theme}`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(() => {
      const bridge = window.desktopBridge;

      if (!bridge) {
        throw new Error("Missing desktop fixture");
      }

      const originalCommitDetails = bridge.getCommitDetails;
      const hashes = new Map([
        ["main", "a".repeat(40)],
        ["feature/current", "b".repeat(40)],
        ["origin/fix/invoice-validation", "c".repeat(40)],
        ["origin/feature/branch-299", "d".repeat(40)],
      ]);

      bridge.getCommitDetails = async (repo, commitId) => {
        const result = await originalCommitDetails(repo, commitId);

        if (!result.ok) {
          return result;
        }

        return { ok: true, value: { ...result.value, commitId: hashes.get(commitId) ?? commitId } };
      };
      bridge.getLspReferences = async (input) => ({
        ok: true,
        value: [
          {
            repoPath: input.repoPath,
            relPath: "src/helper.ts",
            uri: `file://${input.repoPath}/src/helper.ts`,
            line: 3,
            character: 13,
            endLine: 3,
            endCharacter: 19,
          },
        ],
      });
      bridge.getRepoFile = async ({ relPath }) => ({
        ok: true,
        value: {
          name: relPath,
          contents: "export const first = 1;\nexport const second = 2;\nexport const target = 3;\n",
        },
      });
    });

    await page.goto("/#/review");

    const base = page.getByRole("combobox", { name: "Base branch", exact: true });
    const compare = page.getByRole("combobox", { name: "Compare branch", exact: true });

    await expect(base).toHaveValue("main");
    await base.fill("invoice-validation");
    await base.press("Enter");
    await compare.fill("branch-299");
    await compare.press("Enter");
    await expect(page.getByText("No diagnostics reported.", { exact: true })).toBeVisible();

    const tree = page.locator("file-tree-container");

    await tree.evaluate((element) => {
      element.dataset.retained = "lsp-jump";
    });

    const token = page
      .locator("[data-line-type='change-addition'] [data-char]")
      .filter({ hasText: /^ref$/ })
      .first();
    const lineIndex = await token.evaluate((element) =>
      element.closest("[data-line]")?.getAttribute("data-line-index"),
    );

    await token.click({ modifiers: ["Alt"] });

    const result = page.getByRole("button", {
      name: "Ln 3, Col 14 export const target = 3;",
      exact: true,
    });

    await expect(result).toBeVisible();

    if (theme === "light") {
      await result.click();
      await page.keyboard.press("Enter");
    } else {
      await result.dblclick();
    }

    const back = page.getByRole("button", { name: "Back to diff", exact: true });

    await expect(back).toBeVisible();
    await expect(
      page.locator(".file-viewer-scroll [data-line='3'][data-app-line-focus='true']"),
    ).toBeVisible();
    await expect(page.locator(".file-viewer-scroll")).toContainText("export const target = 3;");
    await expect(tree).toHaveAttribute("data-retained", "lsp-jump");
    await page.screenshot({ path: testInfo.outputPath(`branch-lsp-file-${theme}-wide.png`) });
    await page.setViewportSize({ width: 1000, height: 800 });
    await expect(back).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`branch-lsp-file-${theme}-narrow.png`) });

    await back.click();
    await expect(back).toHaveCount(0);
    await expect(base).toHaveValue("origin/fix/invoice-validation");
    await expect(compare).toHaveValue("origin/feature/branch-299");
    await expect(tree).toHaveAttribute("data-retained", "lsp-jump");
    await expect(tree.locator('[data-item-type="file"][aria-selected="true"]')).toHaveAttribute(
      "aria-label",
      "file-0000.ts",
    );
    const focus = await page.evaluate(async () => {
      const storeUrl = performance
        .getEntriesByType("resource")
        .map((entry) => entry.name)
        .find((url) => url.includes("/src/app/store.ts"));

      if (!storeUrl) {
        throw new Error("Missing public store module");
      }

      const { store } = await import(storeUrl);
      return store.getState().sourceControl.diffFocusTarget;
    });

    expect(focus).toMatchObject({
      kind: "review",
      path: "src/feature-00/file-0000.ts",
      lineNumber: 1,
      lineIndex,
    });

    await expect(
      page.locator(`[data-line][data-line-index="${lineIndex}"][data-app-line-focus='true']`),
    ).toBeVisible();
  });
}
