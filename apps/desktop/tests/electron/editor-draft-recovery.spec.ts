import { _electron as electron, expect, test, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const application = process.env.OPEN_WARDEN_PACKAGED_APP;

async function openNote(page: Page) {
  await page.getByRole("button", { name: "Repository files", exact: true }).waitFor();
  await page.keyboard.press("Meta+p");

  const picker = page.getByRole("dialog", { name: "Quick Open file", exact: true });
  const search = picker.getByRole("combobox");

  await search.fill("note.txt");
  await expect(picker.getByRole("option").first()).toBeVisible();
  await search.press("Enter");
  await expect(page.locator('diffs-container [role="textbox"]')).toBeVisible();
}

test("normal quit restores unsaved editor text and protects external changes after restart", async () => {
  test.skip(
    process.platform !== "darwin" || !application,
    "Set OPEN_WARDEN_PACKAGED_APP to a macOS .app.",
  );
  if (!application) return;

  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "warden-editor-recovery-")));
  const profile = path.join(root, "profile");
  const repo = path.join(root, "repo");
  const file = path.join(repo, "note.txt");
  const draft = "Recovered unsaved text";
  const external = "Changed outside OpenWarden\n";
  let app: Awaited<ReturnType<typeof electron.launch>> | undefined;

  try {
    await mkdir(profile);
    await mkdir(repo);
    await writeFile(file, "Saved text\n");
    execFileSync("git", ["init", "--quiet", "--initial-branch=main"], { cwd: repo });
    await writeFile(
      path.join(profile, "workspace-session.json"),
      JSON.stringify({ openRepos: [repo], activeRepo: repo, recentRepos: [] }),
    );

    const environment: Record<string, string> = {};

    for (const [name, value] of Object.entries(process.env)) {
      if (value !== undefined) environment[name] = value;
    }

    delete environment.ELECTRON_RUN_AS_NODE;
    delete environment.VITE_DEV_SERVER_URL;
    delete environment.NODE_PATH;
    environment.OPEN_WARDEN_DISABLE_AUTO_UPDATE = "1";

    const options = {
      executablePath: path.join(application, "Contents/MacOS/OpenWarden"),
      args: [`--user-data-dir=${profile}`],
      cwd: root,
      env: environment,
    };

    app = await electron.launch(options);
    let page = await app.firstWindow();
    await openNote(page);
    await page.locator('diffs-container [role="textbox"]').click();
    await page.keyboard.press("Meta+a");
    await page.keyboard.type(draft);
    await expect(page.getByText("Unsaved", { exact: true })).toBeVisible();

    await app.close();
    app = undefined;

    expect(await readFile(file, "utf8")).toBe("Saved text\n");
    await writeFile(file, external);

    app = await electron.launch(options);
    page = await app.firstWindow();
    await openNote(page);
    await expect(page.locator("diffs-container")).toContainText(draft);
    await expect(page.getByText("Unsaved", { exact: true })).toBeVisible();

    await page.keyboard.press("Meta+s");
    await expect(page.getByText("Couldn’t save file", { exact: true })).toBeVisible();
    expect(await readFile(file, "utf8")).toBe(external);
    await expect(page.locator("diffs-container")).toContainText(draft);

    await page.getByRole("button", { name: "Reload file from disk", exact: true }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Reload file", exact: true })
      .click();
    await expect(page.locator("diffs-container")).toContainText("Changed outside OpenWarden");
    await expect(page.getByText("Unsaved", { exact: true })).toHaveCount(0);
  } finally {
    await app?.close();
    await rm(root, { recursive: true, force: true });
  }
});
