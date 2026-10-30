import { _electron as electron, expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  repositoryChangeSchema,
  type RepositoryChange,
} from "../../src/platform/desktop/repositoryEvents";

function git(repo: string, args: string[]) {
  execFileSync("git", args, { cwd: repo, stdio: "pipe" });
}

test("keeps many deep repositories and linked worktrees live without directory-sized handle growth", async () => {
  test.setTimeout(180000);
  const directory = await realpath(await mkdtemp(path.join(os.tmpdir(), "warden-watch-scale-")));
  const source = path.join(directory, "source");
  const profile = path.join(directory, "profile");
  await mkdir(source);
  await mkdir(profile);
  let app: Awaited<ReturnType<typeof electron.launch>> | undefined;
  const exceptions = path.join(profile, "main-errors.log");
  await writeFile(exceptions, "");
  try {
    git(source, ["init", "-q"]);
    git(source, ["config", "user.name", "Test"]);
    git(source, ["config", "user.email", "test@example.com"]);
    for (let index = 0; index < 128; index += 1) {
      const folder = path.join(source, "packages", String(index), "src");
      await mkdir(folder, { recursive: true });
      await writeFile(path.join(folder, "file.txt"), "initial\n");
    }
    git(source, ["add", "."]);
    git(source, ["commit", "-qm", "Initial commit"]);
    const repositories = [source];
    for (let index = 1; index < 24; index += 1) {
      const repo = path.join(directory, `repo-${index}`);
      git(directory, ["clone", "-q", "--shared", source, repo]);
      repositories.push(repo);
    }
    for (let index = 0; index < 8; index += 1) {
      const worktree = path.join(directory, `worktree-${index}`);
      git(source, ["worktree", "add", "-q", "--detach", worktree]);
      repositories.push(worktree);
    }
    await writeFile(
      path.join(profile, "workspace-session.json"),
      JSON.stringify({ openRepos: repositories, activeRepo: source, recentRepos: [] }),
    );
    const entry = path.join(directory, "entry.cjs");
    await writeFile(
      entry,
      [
        "const { app } = require('electron');",
        "const fs = require('node:fs');",
        `app.setPath('userData', ${JSON.stringify(profile)});`,
        `process.on('uncaughtExceptionMonitor', error => fs.appendFileSync(${JSON.stringify(exceptions)}, error.stack + '\\n'));`,
        `require(${JSON.stringify(path.resolve(".vite/build/main.cjs"))});`,
      ].join("\n"),
    );
    const env = {
      ...process.env,
      VITE_DEV_SERVER_URL:
        process.env.OPEN_WARDEN_RENDERER_URL ?? "http://127.0.0.1:1431/#/changes",
    };
    delete env.ELECTRON_RUN_AS_NODE;
    app = await electron.launch({ args: [entry], env });
    const page = await app.firstWindow();
    await expect(page.getByRole("textbox", { name: "Commit message", exact: true })).toBeVisible();
    const events: RepositoryChange[] = [];
    page.on("console", (message) => {
      if (message.text().startsWith("scale-event:"))
        events.push(
          repositoryChangeSchema.parse(JSON.parse(message.text().slice("scale-event:".length))),
        );
    });
    await page.evaluate(() => {
      window.desktopBridge?.onRepositoryChanged((event) =>
        console.log("scale-event:" + JSON.stringify(event)),
      );
    });
    const subscriptions = await page.evaluate(
      (repos) => window.desktopBridge?.setRepositorySubscriptions(repos),
      repositories,
    );
    expect(subscriptions?.ok).toBe(true);
    const last = repositories.at(-1);
    await expect
      .poll(() => events.some((event) => event.repoPath === last && event.kinds.includes("refs")))
      .toBe(true);
    const resources = await app.evaluate(() => process.getActiveResourcesInfo());
    const changed = repositories.filter((_, index) => [0, 16, 31].includes(index));
    for (const repo of changed)
      await writeFile(path.join(repo, "packages/127/src/file.txt"), "external edit\n");
    await expect
      .poll(
        () =>
          changed.every((repo) =>
            events.some(
              (event) =>
                event.repoPath === repo && event.paths.includes("packages/127/src/file.txt"),
            ),
          ),
        { message: "External edits must reach active and inactive repository subscriptions" },
      )
      .toBe(true)
      .catch((cause) => {
        console.log(JSON.stringify({ events }));
        throw cause;
      });
    expect(events.filter((event) => event.failure)).toEqual([]);
    expect(await readFile(exceptions, "utf8")).toBe("");
    const directoryHandles = resources.filter((resource) => resource === "FSEventWrap").length;
    console.log({ repositories: repositories.length, directoryHandles });
    if (process.platform === "darwin") expect(directoryHandles).toBeLessThanOrEqual(4);
  } finally {
    if (await readFile(exceptions, "utf8")) app?.process().kill("SIGTERM");
    else await app?.close();
    await rm(directory, { recursive: true, force: true });
  }
});
