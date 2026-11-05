import { expect, test, type Page } from "@playwright/test";
import type { ComponentProps } from "react";
import type * as ReactJsx from "react/jsx-runtime";
import type * as ReactDom from "react-dom/client";
import type * as ReactRedux from "react-redux";

import type * as ThemeModule from "../../src/app/AppThemeProvider";
import type * as StoreModule from "../../src/app/store";
import type * as SnippetModule from "../../src/features/pull-requests/components/PullRequestWindowedDiff";

if (process.env.OPEN_WARDEN_BROWSER_EXECUTABLE) {
  test.use({ launchOptions: { executablePath: process.env.OPEN_WARDEN_BROWSER_EXECUTABLE } });
}

type SnippetFixture = Readonly<{
  oldContents: string;
  newContents: string;
  anchorLine?: number;
}>;

async function renderSnippet(page: Page, fixture: SnippetFixture) {
  await page.goto("/");
  await page.evaluate(async ({ oldContents, newContents, anchorLine = 1 }) => {
    const jsxPath = "/node_modules/.vite/deps/react_jsx-runtime.js";
    const reactDomPath = "/node_modules/.vite/deps/react-dom_client.js";
    const reduxPath = "/node_modules/.vite/deps/react-redux.js";
    const storePath = "/src/app/store.ts";
    const themePath = "/src/app/AppThemeProvider.tsx";
    const componentPath = "/src/features/pull-requests/components/PullRequestWindowedDiff.tsx";

    const [reactJsx, reactDom, redux, storeModule, themeModule, snippetModule]: [
      { default: typeof ReactJsx },
      { default: typeof ReactDom },
      typeof ReactRedux,
      typeof StoreModule,
      typeof ThemeModule,
      typeof SnippetModule,
    ] = await Promise.all([
      import(jsxPath),
      import(reactDomPath),
      import(reduxPath),
      import(storePath),
      import(themePath),
      import(componentPath),
    ]);
    const { jsx } = reactJsx.default;
    const { createRoot } = reactDom.default;

    const host = document.createElement("main");
    host.dataset.testid = "snippet-fixture";
    host.className = "bg-background text-foreground fixed inset-0 overflow-auto p-4";
    document.body.append(host);

    const snippetProps: ComponentProps<typeof SnippetModule.PullRequestWindowedDiff> = {
      activePath: "example.ts",
      oldFile: { name: "example.ts", contents: oldContents },
      newFile: { name: "example.ts", contents: newContents },
      commentContext: { kind: "review", baseRef: "base", headRef: "head" },
      annotationItems: [],
      windowedAnchor: { side: "additions", startLine: anchorLine, endLine: anchorLine },
    };
    const snippet = jsx(snippetModule.PullRequestWindowedDiff, snippetProps);

    createRoot(host).render(
      jsx(redux.Provider, {
        store: storeModule.store,
        children: jsx(themeModule.AppThemeProvider, { children: snippet }),
      }),
    );
  }, fixture);

  return page.getByTestId("snippet-fixture");
}

for (const theme of ["light", "dark"] as const) {
  test(`large PR snippets require explicit loading in ${theme}`, async ({ page }, testInfo) => {
    let parseWorkers = 0;

    page.on("worker", (worker) => {
      if (worker.url().includes("diff-parse.worker")) parseWorkers += 1;
    });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.setViewportSize({ width: theme === "light" ? 1280 : 1024, height: 760 });

    const snippet = await renderSnippet(page, {
      oldContents: "export const value = 1;\n",
      newContents: `export const value = '${"x".repeat(5_001)}';\n`,
    });

    await expect(snippet.getByText("Snippet not loaded", { exact: true })).toBeVisible();
    await expect(snippet.getByText("Loading snippet...", { exact: true })).toHaveCount(0);
    expect(parseWorkers).toBe(0);
    await snippet.screenshot({ path: testInfo.outputPath(`large-snippet-${theme}.png`) });

    const load = snippet.getByRole("button", { name: "Load snippet", exact: true });

    await load.focus();
    await page.keyboard.press("Enter");
    await expect(snippet.locator("diffs-container")).toHaveCount(1);
    await expect(load).toHaveCount(0);
    expect(parseWorkers).toBe(1);
  });

  test(`failed PR snippet parsing can be retried in ${theme}`, async ({ page }, testInfo) => {
    let attempts = 0;

    await page.route(/diff-parse\.worker\.ts/, async (route) => {
      attempts += 1;
      if (attempts === 1) await route.abort("failed");
      else await route.continue();
    });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.setViewportSize({ width: theme === "light" ? 1280 : 1024, height: 760 });

    const snippet = await renderSnippet(page, {
      oldContents: "export const value = 1;\n",
      newContents: "export const value = 2;\n",
    });

    await expect(snippet.getByRole("alert")).toContainText("Couldn’t render this snippet");
    await expect(snippet.getByText("Loading snippet...", { exact: true })).toHaveCount(0);
    await snippet.screenshot({ path: testInfo.outputPath(`failed-snippet-${theme}.png`) });
    await snippet.getByRole("button", { name: "Retry", exact: true }).click();

    await expect(snippet.locator("diffs-container")).toHaveCount(1);
    await expect(snippet.getByRole("alert")).toHaveCount(0);
    expect(attempts).toBe(2);
  });
}

test("PR snippets stop loading when the referenced lines are absent", async ({ page }) => {
  const snippet = await renderSnippet(page, {
    oldContents: "export const value = 1;\n",
    newContents: "export const value = 2;\n",
    anchorLine: 99,
  });

  await expect(
    snippet.getByText("The referenced lines are not present in this comparison."),
  ).toBeVisible();
  await expect(snippet.getByText("Loading snippet...", { exact: true })).toHaveCount(0);
});
