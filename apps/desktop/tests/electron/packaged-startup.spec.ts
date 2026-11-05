import { _electron as electron, expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const application = process.env.OPEN_WARDEN_PACKAGED_APP;

test("starts the installed macOS app without development dependencies", async () => {
  test.skip(
    process.platform !== "darwin" || !application,
    "Set OPEN_WARDEN_PACKAGED_APP to a macOS .app.",
  );
  if (!application) return;

  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "warden-installed-startup-")));
  const installedApp = path.join(root, "OpenWarden.app");
  const profile = path.join(root, "profile");
  const repo = path.join(root, "repository");
  let app: Awaited<ReturnType<typeof electron.launch>> | undefined;

  try {
    await cp(application, installedApp, { recursive: true, verbatimSymlinks: true });
    await mkdir(profile);
    await mkdir(repo);
    await writeFile(path.join(repo, "readme.txt"), "Installed application test\n");

    execFileSync("git", ["init", "--initial-branch=main"], { cwd: repo, stdio: "ignore" });

    const repository = await realpath(repo);

    await writeFile(
      path.join(profile, "workspace-session.json"),
      JSON.stringify({ openRepos: [repository], activeRepo: repository, recentRepos: [] }),
    );

    const environment: Record<string, string> = {};

    for (const [name, value] of Object.entries(process.env)) {
      if (value !== undefined) environment[name] = value;
    }

    delete environment.ELECTRON_RUN_AS_NODE;
    delete environment.VITE_DEV_SERVER_URL;
    delete environment.NODE_PATH;

    app = await electron.launch({
      executablePath: path.join(installedApp, "Contents/MacOS/OpenWarden"),
      args: [`--user-data-dir=${profile}`],
      cwd: root,
      env: environment,
    });

    const page = await app.firstWindow();
    const errors: string[] = [];

    page.on("pageerror", (error) => errors.push(error.message));

    const runtime = await app.evaluate(({ app }) => ({
      packaged: app.isPackaged,
      profile: app.getPath("userData"),
    }));

    expect(runtime).toEqual({ packaged: true, profile });

    await page.getByRole("button", { name: "Repository files", exact: true }).click();
    await expect(page.getByRole("treeitem", { name: /readme\.txt/ })).toBeVisible();
    await page.getByRole("button", { name: "Changes", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Commit message", exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await app?.close();
    await rm(root, { recursive: true, force: true });
  }
});
