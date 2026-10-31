import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";
import { prepareFileTreeInput } from "@pierre/trees";
import {
  buildReviewDisplayFiles,
  compareReviewFileEntries,
} from "../../src/features/source-control/components/reviewFileGrouping";

const repoPath = process.env.OPEN_WARDEN_REVIEW_REPO;
const baseRef = process.env.OPEN_WARDEN_REVIEW_BASE;
const headRef = process.env.OPEN_WARDEN_REVIEW_HEAD;
const targetFile = process.env.OPEN_WARDEN_REVIEW_FILE;

test("navigates a real branch comparison through Electron and records a CPU profile", async ({
  browserName,
}, testInfo) => {
  test.skip(browserName !== "chromium", "Electron profiling requires Chromium.");
  test.skip(
    !repoPath || !baseRef || !headRef,
    "Set OPEN_WARDEN_REVIEW_REPO, BASE and HEAD for a real-data run.",
  );
  test.setTimeout(120000);
  if (!repoPath || !baseRef || !headRef) return;
  const userData = await mkdtemp(path.join(os.tmpdir(), "open-warden-review-profile-"));
  const entry = path.join(userData, "entry.cjs");
  await writeFile(
    path.join(userData, "workspace-session.json"),
    JSON.stringify({ activeRepo: repoPath, openRepos: [repoPath], recentRepos: [] }),
  );
  await writeFile(
    entry,
    `const { app } = require('electron');\napp.setPath('userData', ${JSON.stringify(userData)});\nrequire(${JSON.stringify(path.resolve(".vite/build/main.cjs"))});\n`,
  );
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    VITE_DEV_SERVER_URL: process.env.OPEN_WARDEN_RENDERER_URL ?? "http://127.0.0.1:1420/#/review",
  };
  delete environment.ELECTRON_RUN_AS_NODE;
  let app: Awaited<ReturnType<typeof electron.launch>> | undefined;
  try {
    app = await electron.launch({ args: [entry], env: environment });
    expect(await app.evaluate(({ app }) => app.getPath("userData"))).toBe(userData);
    const page = await app.firstWindow();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Network.enable");
    let storeUrl = "";
    cdp.on("Network.requestWillBeSent", ({ request }) => {
      if (request.url.includes("/src/app/store.ts")) storeUrl = request.url;
    });
    await page.reload();
    const base = page.getByRole("combobox", { name: "Base branch", exact: true });
    const head = page.getByRole("combobox", { name: "Compare branch", exact: true });
    await expect(head).toHaveValue(/.+/);
    if (!storeUrl) throw new Error("The development renderer store was not loaded.");
    await page.evaluate(
      async ({ storeUrl, baseRef, headRef }) => {
        const { store } = await import(storeUrl);
        store.dispatch({ type: "sourceControl/setReviewBaseRef", payload: baseRef });
        store.dispatch({ type: "sourceControl/setReviewHeadRef", payload: headRef });
      },
      { storeUrl, baseRef, headRef },
    );
    await expect(base).toHaveValue(baseRef);
    await expect(head).toHaveValue(headRef);
    const reply = await page.evaluate(
      async ({ repoPath, baseRef, headRef }) =>
        window.desktopBridge?.getBranchFiles(repoPath, baseRef, headRef),
      { repoPath, baseRef, headRef },
    );
    expect(reply?.ok).toBe(true);
    if (!reply?.ok) throw new Error("The real comparison could not be loaded.");
    const files = buildReviewDisplayFiles(reply.value);
    const prepared = prepareFileTreeInput(
      files.map((file) => file.path),
      { sort: compareReviewFileEntries },
    );
    const target = targetFile
      ? files.find((file) => file.realPath === targetFile)?.path
      : prepared.paths[0];
    if (!target) throw new Error("The requested file is absent from the comparison.");
    const rows = new Set<string>();
    for (const file of prepared.paths) {
      const parts = file.split("/");
      for (let depth = 1; depth <= parts.length; depth += 1)
        rows.add(parts.slice(0, depth).join("/"));
      if (file === target) break;
    }
    const tree = page.locator("file-tree-container");
    await expect(tree).toBeVisible();
    const group = target.split("/")[0];
    const groupCount = files.filter((file) => file.path.split("/")[0] === group).length;
    await expect(
      tree
        .getByRole("treeitem", { name: group, exact: true })
        .getByTitle(`${groupCount} ${groupCount === 1 ? "file" : "files"}`, { exact: true }),
    ).toBeVisible();
    await expect
      .poll(() =>
        tree.evaluate(
          (host) =>
            host.shadowRoot?.querySelector<HTMLElement>("[data-file-tree-virtualized-scroll]")
              ?.scrollHeight ?? 0,
        ),
      )
      .toBeGreaterThan(rows.size * 22);
    await tree.evaluate((host, rowIndex) => {
      const scroll = host.shadowRoot?.querySelector<HTMLElement>(
        "[data-file-tree-virtualized-scroll]",
      );
      if (!scroll) throw new Error("Missing tree viewport");
      scroll.scrollTop = Math.max(0, (rowIndex - 8) * 22);
    }, rows.size);
    await page.evaluate(
      async ({ storeUrl, target }) => {
        const { store } = await import(storeUrl);
        store.dispatch({ type: "sourceControl/setReviewActivePath", payload: target });
      },
      {
        storeUrl,
        target: targetFile ?? files.find((file) => file.path === target)?.realPath ?? "",
      },
    );
    const selected = tree.locator('[data-item-type="file"][aria-selected="true"]');
    await expect(selected).toHaveAttribute("data-item-path", target);
    await expect(page.locator(".diff-viewport-scroll")).toBeVisible();
    await expect(page.locator("[data-additions]").first()).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("real-comparison.png") });
    await page.evaluate(() => {
      const keys: Array<{ key: string; repeat: boolean; type: string }> = [];
      Object.assign(window, { reviewProfileKeys: keys });
      for (const type of ["keydown", "keyup"])
        document.addEventListener(
          type,
          (event) => {
            const key = event as KeyboardEvent;
            keys.push({ key: key.key, repeat: key.repeat, type });
          },
          true,
        );
    });
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.start");
    const frames: number[] = [];
    for (let index = 0; index < 20; index += 1) {
      const started = performance.now();
      await page.keyboard.press(index < 10 ? "j" : "k");
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      frames.push(Math.round(performance.now() - started));
    }
    const { profile } = await cdp.send("Profiler.stop");
    await writeFile(testInfo.outputPath("branch-navigation.cpuprofile"), JSON.stringify(profile));
    await testInfo.attach("real-comparison-navigation", {
      body: JSON.stringify({ files: files.length, frames }),
      contentType: "application/json",
    });
    const keyCounts = await page.evaluate(() => {
      const keys = (
        window as Window & {
          reviewProfileKeys: Array<{ key: string; repeat: boolean; type: string }>;
        }
      ).reviewProfileKeys;
      return {
        down: keys.filter((key) => key.type === "keydown").length,
        up: keys.filter((key) => key.type === "keyup").length,
        repeated: keys.filter((key) => key.repeat).length,
      };
    });
    expect(keyCounts).toEqual({ down: 20, up: 20, repeated: 0 });
    console.log(JSON.stringify({ comparisonFiles: files.length, frames, keyCounts }));
    await expect(selected).toHaveAttribute("data-item-path", target);
  } finally {
    await app?.close();
    await rm(userData, { recursive: true, force: true });
  }
});
