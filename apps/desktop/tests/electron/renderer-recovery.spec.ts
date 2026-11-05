import { _electron as electron, expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const application = process.env.OPEN_WARDEN_PACKAGED_APP;

test("a crashed renderer does not block closing its window", async () => {
  test.skip(process.platform !== "darwin" || !application, "Set OPEN_WARDEN_PACKAGED_APP.");
  if (!application) return;

  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "warden-crash-recovery-")));
  const profile = path.join(root, "profile");
  const repo = path.join(root, "repo");
  let app: Awaited<ReturnType<typeof electron.launch>> | undefined;

  try {
    await mkdir(profile);
    await mkdir(repo);
    execFileSync("git", ["init", "--quiet", "--initial-branch=main"], { cwd: repo });
    await writeFile(
      path.join(profile, "workspace-session.json"),
      JSON.stringify({ openRepos: [repo], activeRepo: repo, recentRepos: [] }),
    );

    const env = { ...process.env, OPEN_WARDEN_DISABLE_AUTO_UPDATE: "1" };
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.VITE_DEV_SERVER_URL;
    delete env.NODE_PATH;

    app = await electron.launch({
      executablePath: path.join(application, "Contents/MacOS/OpenWarden"),
      args: [`--user-data-dir=${profile}`],
      cwd: root,
      env,
    });

    const page = await app.firstWindow();
    await page.getByRole("button", { name: "Repository files", exact: true }).waitFor();

    await app.evaluate(async ({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      if (!window) throw new Error("Missing app window");

      const exited = new Promise<void>((resolve) =>
        window.webContents.once("render-process-gone", () => resolve()),
      );
      window.webContents.forcefullyCrashRenderer();
      await exited;
      window.close();
    });

    await expect
      .poll(async () => {
        if (!app) throw new Error("Missing app process");
        return app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
      })
      .toBe(0);
  } finally {
    if (app) {
      const child = app.process();
      const deadline = setTimeout(() => child.kill("SIGKILL"), 5000);

      try {
        await app.close();
      } finally {
        clearTimeout(deadline);
      }
    }

    await rm(root, { recursive: true, force: true });
  }
});
