import { expect, test } from "@playwright/test";

import { createAppSettings } from "../../src/platform/desktop/appSettings";
import type { DesktopBridge } from "../../src/platform/desktop/contracts";
import type {
  RepositoryConfiguration,
  RepositoryConfigurationCommand,
  RepositorySetupInput,
} from "../../src/platform/desktop/repositoryManagement";

declare global {
  interface Window {
    repositoryManagementTest: {
      setupCalls: RepositorySetupInput[];
      configurationCalls: RepositoryConfigurationCommand[];
      failSetup: boolean;
      failConfiguration: boolean;
    };
  }
}

if (process.env.OPEN_WARDEN_BROWSER_EXECUTABLE)
  test.use({ launchOptions: { executablePath: process.env.OPEN_WARDEN_BROWSER_EXECUTABLE } });

test.beforeEach(async ({ page }) => {
  await page.addInitScript((settings) => {
    const control: Window["repositoryManagementTest"] = {
      setupCalls: [],
      configurationCalls: [],
      failSetup: false,
      failConfiguration: false,
    };

    window.repositoryManagementTest = control;

    // oxlint-disable-next-line unicorn/consistent-function-scoping -- Serialized into the browser; cannot capture module helpers.
    const success = <T>(value: T) => ({ ok: true as const, value });

    let version = 10;
    let remotes: RepositoryConfiguration["remotes"] = [
      {
        name: "origin",
        fetchUrls: ["https://bitbucket.org/workspace/product.git"],
        pushUrls: [],
      },
    ];
    let upstream: string | null = null;

    const bridge = {
      loadWorkspaceSession: async () => success({ openRepos: [], activeRepo: "", recentRepos: [] }),
      saveWorkspaceSession: async (value) => success(value),
      loadAppSettings: async () => success(settings),
      saveAppSettings: async (value) => success(value),
      getAppSettingsPath: async () => success("/test/settings.json"),
      getUpdateState: async () =>
        success({
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
      getGitSnapshot: async (repoPath) =>
        success({ repoRoot: repoPath, branch: "main", staged: [], unstaged: [], untracked: [] }),
      getRepoFiles: async () => success([]),
      getGitRepositoryState: async () =>
        success({
          branch: "main",
          upstream: upstream ?? "",
          ahead: 0,
          behind: 0,
          remotes: remotes.map((remote) => remote.name),
          branches: [],
          tags: [],
          worktrees: [],
          operation: null,
          conflicts: [],
          lastCommit: null,
          stashes: [],
          incoming: [],
          outgoing: [],
        }),
      getRepositoryConfiguration: async () =>
        success({
          revision: version.toString(16).padStart(64, "0"),
          branch: "main",
          upstream,
          remoteBranches: ["origin/main", "origin/develop"],
          remotes,
        }),
      configureRepository: async (_repoPath, command) => {
        control.configurationCalls.push(command);

        if (
          control.failConfiguration ||
          command.expectedRevision !== version.toString(16).padStart(64, "0")
        )
          return {
            ok: false as const,
            error: {
              code: "conflict" as const,
              operation: "configureRepository",
              message: "Repository configuration changed. Refresh before saving.",
            },
          };

        if (command.kind === "add-remote")
          remotes = [...remotes, { name: command.name, fetchUrls: [command.url], pushUrls: [] }];
        if (command.kind === "set-upstream") upstream = command.upstream;

        version += 1;

        return success(undefined);
      },
      setupRepository: async (input) => {
        control.setupCalls.push(input);

        return control.failSetup
          ? {
              ok: false as const,
              error: {
                code: "network" as const,
                operation: "setupRepository",
                message:
                  "The remote service couldn’t be reached. Check your connection and try again.",
              },
            }
          : success(input.destination);
      },
      selectFolder: async () => success("/projects"),
      resolveHostedRepo: async () => success(null),
      listProviderConnections: async () => success([]),
      onAppSettingsChanged: () => () => {},
      onLspDiagnostics: () => () => {},
      onGuidanceNavigate: () => () => {},
      onUpdateState: () => () => {},
    } satisfies Partial<DesktopBridge>;

    Object.defineProperty(window, "desktopBridge", { value: bridge });
  }, createAppSettings());

  await page.setViewportSize({ width: 1440, height: 1000 });
});

test("clone preserves entered details on failure and opens the prepared repository on retry", async ({
  page,
}, testInfo) => {
  await page.goto("/#/changes");
  await page.getByRole("button", { name: "Clone repository…", exact: true }).click();
  await page
    .getByRole("textbox", { name: /Repository URL/ })
    .fill("https://bitbucket.org/workspace/product.git");
  await page
    .getByRole("textbox", { name: "Destination folder", exact: true })
    .fill("/projects/product");

  await page.evaluate(() => {
    window.repositoryManagementTest.failSetup = true;
  });
  await page.getByRole("button", { name: "Clone repository", exact: true }).click();

  await expect(page.getByText("Clone repository couldn’t finish")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Destination folder", exact: true })).toHaveValue(
    "/projects/product",
  );
  await page.screenshot({ path: testInfo.outputPath("clone-failure.png") });

  await page.evaluate(() => {
    window.repositoryManagementTest.failSetup = false;
  });
  await page.getByRole("button", { name: "Clone repository", exact: true }).click();

  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Switch branch: main" })).toBeVisible();

  const calls = await page.evaluate(() => window.repositoryManagementTest.setupCalls);

  expect(calls).toHaveLength(2);
  expect(calls[1]).toEqual({
    kind: "clone",
    source: "https://bitbucket.org/workspace/product.git",
    destination: "/projects/product",
  });
});

for (const theme of ["light", "dark"] as const) {
  test(`initializes, opens remote settings and searches upstream branches in ${theme}`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.setViewportSize({ width: theme === "light" ? 1440 : 1100, height: 900 });

    await page.goto("/#/changes");
    await page.getByRole("button", { name: "Initialize repository…", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Repository folder", exact: true })
      .fill("/projects/new-project");
    await expect(page.getByRole("textbox", { name: "Initial branch" })).toHaveValue("main");
    await page.screenshot({ path: testInfo.outputPath(`initialize-${theme}.png`) });

    await page.getByRole("button", { name: "Initialize repository", exact: true }).click();
    await page.getByRole("button", { name: "Repository tools", exact: true }).click();
    await page.getByRole("menuitem", { name: "Remotes & upstream…", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Remotes & upstream" })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`remotes-${theme}.png`) });

    await page.getByRole("button", { name: "Add remote", exact: true }).click();
    await page.getByRole("textbox", { name: "Remote name" }).fill("upstream");
    await page
      .getByRole("textbox", { name: "Repository URL", exact: true })
      .fill("git@github.com:organization/product.git");

    await page.evaluate(() => {
      window.repositoryManagementTest.failConfiguration = true;
    });
    await page.getByRole("button", { name: "Save remote" }).click();

    await expect(
      page.getByText("Couldn’t update repository settings", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Repository URL", exact: true })).toHaveValue(
      "git@github.com:organization/product.git",
    );

    await page.evaluate(() => {
      window.repositoryManagementTest.failConfiguration = false;
    });
    await page.getByRole("button", { name: "Save remote" }).click();

    await expect(page.getByRole("group", { name: "Remote upstream", exact: true })).toBeVisible();

    const branch = page.getByRole("combobox", { name: "Upstream branch", exact: true });

    await branch.fill("develop");
    await page.getByRole("option", { name: "origin/develop", exact: true }).click();
    await page.getByRole("button", { name: "Set upstream", exact: true }).click();

    await expect(
      page.getByText("Currently tracking origin/develop", { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(() =>
        window.repositoryManagementTest.configurationCalls.map((command) => command.kind),
      ),
    ).toEqual(["add-remote", "add-remote", "set-upstream"]);
    await page.screenshot({ path: testInfo.outputPath(`configured-${theme}.png`) });

    await page.getByRole("button", { name: "Stop tracking", exact: true }).click();
    await expect(page.getByText("This branch has no upstream.", { exact: true })).toBeVisible();

    await branch.fill("main");
    await page.getByRole("option", { name: "origin/main", exact: true }).click();
    await page.getByRole("button", { name: "Set upstream", exact: true }).click();

    await expect(page.getByText("Currently tracking origin/main", { exact: true })).toBeVisible();

    await branch.fill("develop");
    await expect(page.getByRole("option", { name: "origin/develop", exact: true })).toBeVisible();

    await branch.press("Escape");
    await expect(page.getByRole("option")).toHaveCount(0);
    await expect(page.getByRole("dialog")).toBeVisible();

    await branch.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
}
