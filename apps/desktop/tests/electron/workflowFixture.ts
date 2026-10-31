import type { ReviewDraft } from "../../src/platform/desktop/reviewDrafts";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { _electron, TestInfo } from "@playwright/test";

export async function openWorkflowRepository(
  electron: typeof _electron,
  testInfo: TestInfo,
  theme: "light" | "dark",
  options: {
    prepare?: (repo: string, git: (...args: string[]) => string) => Promise<void>;
    reviewDrafts?: readonly Omit<ReviewDraft, "repoPath">[];
  } = {},
) {
  const root = await mkdtemp(path.join(os.tmpdir(), "warden-workflow-ui-"));
  const repoDirectory = path.join(root, "invoice");
  const profile = path.join(root, "profile");
  await mkdir(repoDirectory);
  await mkdir(profile);
  const repo = await realpath(repoDirectory);
  const entry = path.join(root, "entry.cjs");

  function git(...args: string[]) {
    return execFileSync("git", args, {
      cwd: repo,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  }

  git("init", "--initial-branch=main");
  git("config", "user.name", "Alice");
  git("config", "user.email", "alice@example.com");
  await writeFile(
    path.join(repo, "invoice.ts"),
    "export const minimumAmount = 1;\nexport const currency = 'EUR';\n",
  );
  await mkdir(path.join(repo, "test"));
  await writeFile(path.join(repo, "test/invoice.test.ts"), "export const amounts = [1, 2, 3];\n");
  git("add", ".");
  git("commit", "-m", "Add invoice calculation");
  await options.prepare?.(repo, git);
  await writeFile(
    path.join(profile, "workspace-session.json"),
    JSON.stringify({
      openRepos: [repo],
      activeRepo: repo,
      recentRepos: [],
      reviewDrafts: options.reviewDrafts?.map((draft) => ({ ...draft, repoPath: repo })),
    }),
  );
  await writeFile(
    entry,
    [
      'const { app } = require("electron");',
      "",
      `app.setPath("userData", ${JSON.stringify(profile)});`,
      `require(${JSON.stringify(path.resolve(".vite/build/main.cjs"))});`,
      "",
    ].join("\n"),
  );
  const environment = { ...process.env, VITE_DEV_SERVER_URL: "http://127.0.0.1:1420/#/changes" };
  delete environment.ELECTRON_RUN_AS_NODE;

  try {
    const app = await electron.launch({
      args: [entry],
      env: environment,
      recordVideo: { dir: testInfo.outputPath("videos"), size: { width: 1440, height: 900 } },
    });
    const page = await app.firstWindow();
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.setViewportSize({ width: theme === "light" ? 1440 : 1100, height: 900 });

    return {
      app,
      page,
      repo,
      profile,
      git,
      async close() {
        await app.close();
        await rm(root, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}
