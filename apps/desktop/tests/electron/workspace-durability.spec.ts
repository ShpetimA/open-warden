import { _electron as electron, expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test("native close flushes pending comments and commit messages, and damaged storage blocks closing", async ({
  browserName,
}, testInfo) => {
  test.setTimeout(120000);
  const directory = await mkdtemp(path.join(os.tmpdir(), "warden-native-drafts-"));
  const repo = path.join(directory, "repository");
  const userData = path.join(directory, "profile");
  const { mkdir } = await import("node:fs/promises");
  await mkdir(repo);
  await mkdir(userData);
  const git = (args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
  git(["init", "-q"]);
  git(["config", "user.name", "Test"]);
  git(["config", "user.email", "test@example.com"]);
  await writeFile(path.join(repo, "file.txt"), "base\n");
  git(["add", "."]);
  git(["commit", "-qm", "Base"]);
  const head = git(["rev-parse", "HEAD"]);
  const sessionFile = path.join(userData, "workspace-session.json");
  await writeFile(
    sessionFile,
    JSON.stringify({ openRepos: [repo], activeRepo: repo, recentRepos: [] }),
  );
  const entry = path.join(directory, "entry.cjs");
  await writeFile(
    entry,
    `const { app } = require('electron');\napp.setPath('userData', ${JSON.stringify(userData)});\nrequire(${JSON.stringify(path.resolve(".vite/build/main.cjs"))});\n`,
  );
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    VITE_DEV_SERVER_URL: process.env.OPEN_WARDEN_RENDERER_URL ?? "http://localhost:1420/#/changes",
  };
  delete env.ELECTRON_RUN_AS_NODE;
  let app: Awaited<ReturnType<typeof electron.launch>> | undefined;
  try {
    app = await electron.launch({ args: [entry], env });
    let page = await app.firstWindow();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Network.enable");
    let storeUrl = "";
    cdp.on("Network.requestWillBeSent", ({ request }) => {
      if (request.url.includes("/src/app/store.ts")) storeUrl = request.url;
    });
    await page.reload();
    await expect(page.getByRole("textbox", { name: "Commit message", exact: true })).toBeVisible();
    expect(storeUrl).not.toBe("");
    await page.evaluate(
      async ({ url, repo, head }) => {
        const { store } = await import(url);
        store.dispatch({
          type: "sourceControl/setCommitMessage",
          payload: "Pending native commit",
        });
        store.dispatch({
          type: "comments/addComment",
          payload: {
            id: "native-pending-review",
            type: "annotation",
            repoPath: repo,
            filePath: "file.txt",
            bucket: "unstaged",
            startLine: 1,
            endLine: 1,
            side: "additions",
            text: "Pending native review",
            contextKind: "review",
            baseRef: head,
            headRef: head,
          },
        });
      },
      { url: storeUrl, repo, head },
    );
    await page.evaluate(
      async ({ url }) => {
        const { store } = await import(url);
        for (let index = 0; index < 20; index += 1) {
          store.dispatch({
            type: "sourceControl/setCommitMessage",
            payload: `Pending native commit ${index}`,
          });
        }
      },
      { url: storeUrl },
    );
    await page.reload();
    await expect(page.getByRole("textbox", { name: "Commit message", exact: true })).toHaveValue(
      "Pending native commit 19",
    );
    const hydrated = await page.evaluate(async (url) => {
      const { store } = await import(url);
      return store.getState().comments;
    }, storeUrl);
    expect(hydrated).toMatchObject([{ text: "Pending native review", headRef: head }]);
    await app.close();
    app = undefined;
    const saved = JSON.parse(await readFile(sessionFile, "utf8"));
    expect(saved.comments).toMatchObject([
      { text: "Pending native review", repoPath: repo, headRef: head },
    ]);
    expect(JSON.stringify(saved.workspaceTabs.views)).toContain("Pending native commit 19");

    const savedText = await readFile(sessionFile, "utf8");
    await writeFile(sessionFile, "damaged before startup");
    await rm(`${sessionFile}.backup`, { force: true });
    app = await electron.launch({ args: [entry], env });
    page = await app.firstWindow();
    await expect(page.getByRole("alert")).toContainText("Couldn’t restore your workspace");
    expect(await readFile(sessionFile, "utf8")).toBe("damaged before startup");
    await page.screenshot({ path: testInfo.outputPath(`workspace-recovery-${browserName}.png`) });
    await expect(page.getByRole("textbox", { name: "Commit message", exact: true })).toHaveCount(0);
    await writeFile(sessionFile, savedText);
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Commit message", exact: true })).toHaveValue(
      "Pending native commit 19",
    );
    const restored = await page.evaluate(() => window.desktopBridge!.loadWorkspaceSession());
    expect(restored).toMatchObject({
      ok: true,
      value: { comments: [{ text: "Pending native review", headRef: head }] },
    });
    const valid = await readFile(sessionFile, "utf8");
    await writeFile(sessionFile, "broken saved work");
    await rm(`${sessionFile}.backup`, { force: true });
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.close();
    });
    await expect(
      page.getByText("Saved workspace data could not be read.", { exact: false }),
    ).toBeVisible();
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
    expect(await readFile(sessionFile, "utf8")).toBe("broken saved work");
    await writeFile(sessionFile, valid);
    await app.close();
    app = undefined;
  } finally {
    if (app) {
      await writeFile(
        sessionFile,
        JSON.stringify({ openRepos: [repo], activeRepo: repo, recentRepos: [] }),
      );
      await app.close();
    }
    await rm(directory, { recursive: true, force: true });
  }
});
