import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { GuidanceStore } from "../../electron/guidance/store";
import { GuidanceService } from "../../electron/guidance/service";
import { startGuidanceMcpServer } from "../../electron/guidance/mcpServer";
import { createAppSettings } from "../../src/platform/desktop/appSettings";
import type { GuidanceNavigate } from "../../src/platform/desktop/guidance";
import type { PullRequestDetail } from "../../src/platform/desktop/contracts";

if (process.env.OPEN_WARDEN_BROWSER_EXECUTABLE) {
  test.use({ launchOptions: { executablePath: process.env.OPEN_WARDEN_BROWSER_EXECUTABLE } });
}
declare global {
  interface Window {
    qaCurrentHead(): Promise<string>;
    qaRecordComparisonCall(kind: string, path?: string): Promise<void>;
    qaReadGuidance(input: unknown): ReturnType<GuidanceService["read"]>;
    qaGuidanceProgress(input: unknown): ReturnType<GuidanceService["progress"]>;
    qaGuidanceMessage(input: unknown): ReturnType<GuidanceService["message"]>;
  }
}

test("an MCP agent creates a walkthrough and exchanges persisted messages through the desktop UI", async ({
  page,
}) => {
  test.setTimeout(60000);
  const directory = await mkdtemp(path.join(os.tmpdir(), "ow-guidance-ui-"));
  const locator = { repoPath: "/projects/invoice", pullRequestNumber: 114 };
  const state = { headSha: "head123" };
  const detail: PullRequestDetail = {
    id: "114",
    providerId: "github",
    number: 114,
    title: "Validate invoice amounts",
    body: "Reject negative amounts before saving.",
    state: "open",
    isDraft: false,
    author: { login: "alice", displayName: "Alice", avatarUrl: null },
    url: "https://github.com/team/invoice/pull/114",
    baseRef: "main",
    headRef: "validation",
    baseSha: "base123",
    headSha: "head123",
    createdAt: "2026-10-25T18:00:00Z",
    updatedAt: "2026-10-25T18:00:00Z",
    labels: [],
  };
  const files = ["src/invoice.ts", "test/invoice.test.ts"].map((file) => ({
    path: file,
    previousPath: null,
    status: "modified" as const,
    additions: 2,
    deletions: 1,
  }));
  const repository = {
    providerId: "github" as const,
    owner: "team",
    repo: "invoice",
    remoteName: "origin",
    remoteUrl: "git@github.com:team/invoice.git",
    webUrl: "https://github.com/team/invoice",
  };
  const refs = {
    providerId: "github" as const,
    owner: "team",
    repo: "invoice",
    pullRequestNumber: 114,
    baseRef: "main",
    headRef: "validation",
    compareBaseRef: "base123",
    compareHeadRef: "head123",
    localBranch: "validation",
  };
  const versions = {
    oldFile: {
      name: "src/invoice.ts",
      contents: "export function validate(amount: number) {\n  return amount;\n}\n",
    },
    newFile: {
      name: "src/invoice.ts",
      contents:
        "export function validate(amount: number) {\n  if (amount < 0) throw new Error('Invalid amount');\n  return amount;\n}\n" +
        Array.from({ length: 180 }, (_, index) => `// Context line ${index}`).join("\n"),
    },
  };
  const testVersions = {
    oldFile: {
      name: "test/invoice.test.ts",
      contents: "test('accepts positive', () => validate(1));\n",
    },
    newFile: {
      name: "test/invoice.test.ts",
      contents:
        "test('accepts positive', () => validate(1));\ntest('rejects negative', () => expect(() => validate(-1)).toThrow());\n",
    },
  };
  const calls: Array<{ kind: string; path?: string }> = [];
  const navigation: Promise<unknown>[] = [];
  const service = new GuidanceService({
    store: new GuidanceStore(directory),
    loadWorkspaceSession: async () => ({
      openRepos: [locator.repoPath],
      activeRepo: locator.repoPath,
      recentRepos: [],
    }),
    resolveHostedRepo: async () => repository,
    getPullRequestConversation: async () => ({
      detail: { ...detail, headSha: state.headSha },
      issueComments: [],
      reviewThreads: [],
    }),
    getPullRequestFiles: async () => files,
    getPullRequestChecks: async () => ({
      headSha: state.headSha,
      checks: [],
      complete: true,
      mergeability: "mergeable",
    }),
    preparePullRequestCompareRefs: async () => refs,
    getBranchFileVersions: async (_repo, _base, _head, file) =>
      file.startsWith("test/") ? testVersions : versions,
    now: () => "2026-10-25T18:00:00Z",
    id: randomUUID,
    show: (target: GuidanceNavigate) => {
      navigation.push(
        page.evaluate(
          (value) =>
            window.dispatchEvent(new CustomEvent("qa-guidance-navigate", { detail: value })),
          target,
        ),
      );
    },
  });
  const token = "only-a-test-connection-key-for-guidance";
  const started = await startGuidanceMcpServer(service, { token, port: 0 });
  if (!started.ok) throw new Error(started.error.message);
  const client = new Client({ name: "guided-review-agent", version: "1.0.0" });
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(started.value.endpoint), {
        requestInit: { headers: { Authorization: `Bearer ${token}` } },
      }),
    );
    await page.exposeFunction("qaRecordComparisonCall", (kind: string, path?: string) => {
      calls.push({ kind, path });
    });
    await page.exposeFunction("qaCurrentHead", () => state.headSha);
    await page.exposeFunction("qaReadGuidance", (input: unknown) => service.read(input));
    await page.exposeFunction("qaGuidanceProgress", (input: unknown) => service.progress(input));
    await page.exposeFunction("qaGuidanceMessage", (input: unknown) =>
      service.message(input, "user"),
    );
    await page.addInitScript(
      ({ detail, repository, refs, versions, testVersions, files, settings }) => {
        const connection = {
          status: "running",
          endpoint: "http://127.0.0.1:47781/mcp",
          clientConfig: "test configuration",
          error: null,
        };
        Object.defineProperty(window, "desktopBridge", {
          value: {
            loadWorkspaceSession: async () =>
              JSON.parse(
                localStorage.getItem("qa-session") ??
                  JSON.stringify({
                    openRepos: ["/projects/invoice"],
                    activeRepo: "/projects/invoice",
                    recentRepos: [],
                  }),
              ),
            saveWorkspaceSession: async (session: unknown) => {
              localStorage.setItem("qa-session", JSON.stringify(session));
              return session;
            },
            loadAppSettings: async () => settings,
            saveAppSettings: async (settings: unknown) => settings,
            getAppSettingsPath: async () => "/test/settings.json",
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
            onUpdateState: () => () => {},
            onLspDiagnostics: () => () => {},
            onAppSettingsChanged: () => () => {},
            onGuidanceNavigate: (listener: (target: GuidanceNavigate) => void) => {
              const receive = (event: Event) => {
                if (event instanceof CustomEvent) listener(event.detail);
              };
              window.addEventListener("qa-guidance-navigate", receive);
              return () => window.removeEventListener("qa-guidance-navigate", receive);
            },
            getGitSnapshot: async () => ({
              repoRoot: "/projects/invoice",
              branch: "main",
              staged: [],
              unstaged: [],
              untracked: [],
            }),
            getGitRepositoryState: async () => ({
              ok: true,
              value: {
                branch: "main",
                upstream: "origin/main",
                ahead: 0,
                behind: 0,
                remotes: ["origin"],
                branches: [],
                tags: [],
                worktrees: [],
                operation: null,
                conflicts: [],
                lastCommit: null,
                stashes: [],
                incoming: [],
                outgoing: [],
              },
            }),
            resolveHostedRepo: async () => repository,
            getPullRequestConversation: async () => ({
              detail: { ...detail, headSha: await window.qaCurrentHead() },
              issueComments: [],
              reviewThreads: [],
            }),
            getPullRequestFiles: async () => files,
            preparePullRequestCompareRefs: async () => {
              await window.qaRecordComparisonCall("prepare");
              return { ...refs, compareHeadRef: await window.qaCurrentHead() };
            },
            getBranchFiles: async () => {
              await window.qaRecordComparisonCall("files");
              return files;
            },
            getBranchFileVersions: async (
              _repo: string,
              _base: string,
              _head: string,
              file: string,
            ) => {
              await window.qaRecordComparisonCall("versions", file);
              return file.startsWith("test/") ? testVersions : versions;
            },
            listProviderConnections: async () => [],
            getPullRequestGuidance: (input: unknown) => window.qaReadGuidance(input),
            setGuidanceProgress: (input: unknown) => window.qaGuidanceProgress(input),
            addGuidanceMessage: (input: unknown) => window.qaGuidanceMessage(input),
            getGuidanceConnection: async () => connection,
            startGuidanceConnection: async () => connection,
          },
        });
      },
      { detail, repository, refs, versions, testVersions, files, settings: createAppSettings() },
    );
    await page.goto("/");
    await expect(page.getByText("No files.", { exact: true })).toBeVisible();
    const published = await client.callTool({
      name: "publish_guidance",
      arguments: {
        ...locator,
        expectedHeadSha: "head123",
        title: "Review invoice validation",
        summary: "Follow validation into its regression tests.",
        steps: [
          {
            id: "validation",
            title: "Validate amounts",
            body: Array.from(
              { length: 8 },
              () =>
                "Reject negative amounts before persistence. Keep zero valid and check the API error response.\n\n- Verify the rejected request never reaches storage.\n- Preserve the successful request path.",
            ).join("\n\n"),
            references: [
              {
                path: "src/invoice.ts",
                side: "head",
                startLine: 2,
                endLine: 3,
                note: "Reject negative amounts before persistence; zero remains valid.",
              },
              { path: "test/invoice.test.ts", side: "head", startLine: 1, endLine: 2 },
              { path: "src/invoice.ts", side: "head", startLine: 1, endLine: 1 },
            ],
          },
          {
            id: "tests",
            title: "Verify coverage",
            body: "Check the invalid-input cases.",
            references: [{ path: "test/invoice.test.ts", side: "head", startLine: 1, endLine: 2 }],
          },
        ],
      },
    });
    expect(published.isError).not.toBe(true);
    await client.callTool({
      name: "show_guidance_step",
      arguments: { ...locator, stepId: "validation" },
    });
    await Promise.all(navigation);
    await expect(page).toHaveURL(/\/114\/guidance/);
    await expect(page.getByRole("heading", { name: "Review invoice validation" })).toBeVisible();
    await expect(page.locator("[data-selected-line]").first()).toBeVisible();
    const stepsTab = page.getByRole("tab", { name: "Steps", exact: true });
    const filesTab = page.getByRole("tab", { name: "Files", exact: true });
    const explanation = page.getByRole("region", { name: "Step explanation" });
    await expect(stepsTab).toHaveAttribute("aria-selected", "true");
    await expect(explanation).toContainText(
      "Reject negative amounts before persistence; zero remains valid.",
    );
    const noteBounds = await explanation.boundingBox();
    const selectedBounds = await page.locator('[data-additions] [data-line="2"]').boundingBox();
    if (!noteBounds || !selectedBounds)
      throw new Error("Expected an inline explanation and selected line");
    expect(noteBounds.y + noteBounds.height).toBeLessThanOrEqual(selectedBounds.y + 2);
    await explanation.getByText("Step details", { exact: true }).click();
    await expect(explanation.getByRole("button", { name: "Read more", exact: true })).toBeVisible();
    await explanation.getByText("Step details", { exact: true }).click();
    await explanation.getByRole("button", { name: "Collapse step explanation" }).click();
    await expect(
      explanation.getByRole("button", { name: "Expand step explanation" }),
    ).toBeVisible();
    await explanation.getByRole("button", { name: "Expand step explanation" }).click();
    await page.keyboard.press("j");
    await expect(explanation.getByRole("heading", { name: "Verify coverage" })).toBeVisible();
    await page.keyboard.press("j");
    await expect(explanation.getByRole("heading", { name: "Verify coverage" })).toBeVisible();
    await page.keyboard.press("k");
    await expect(explanation.getByRole("heading", { name: "Validate amounts" })).toBeVisible();
    await page.screenshot({ path: "/tmp/ow-guidance-tabs-steps.png", animations: "disabled" });
    await filesTab.click();
    await expect(filesTab).toHaveAttribute("aria-selected", "true");
    const tree = page.locator('[data-nav-region="guidance-files"]');
    await expect(tree.locator('[data-item-path="src/invoice.ts"]')).toBeVisible();
    const viewport = page.locator(".diff-viewport-scroll");
    await expect
      .poll(() => viewport.evaluate((node) => node.scrollHeight > node.clientHeight))
      .toBe(true);
    await viewport.hover();
    await page.mouse.wheel(0, 500);
    await expect.poll(() => viewport.evaluate((node) => node.scrollTop)).toBeGreaterThan(100);
    await page.getByRole("button", { name: "Head · Lines 1–1", exact: true }).click();
    await expect(explanation.getByRole("button", { name: "Read more", exact: true })).toBeVisible();
    const previewHeight = await explanation.evaluate((node) => node.getBoundingClientRect().height);
    await explanation.getByRole("button", { name: "Read more", exact: true }).click();
    await expect
      .poll(() => explanation.evaluate((node) => node.getBoundingClientRect().height))
      .toBeGreaterThan(previewHeight);
    await explanation.getByRole("button", { name: "Show less", exact: true }).click();
    await expect(page.locator("[data-selected-line]").first()).toBeVisible();
    expect(
      calls.filter((call) => call.kind === "versions" && call.path === "src/invoice.ts"),
    ).toHaveLength(1);
    await page.keyboard.press("j");
    await expect(page.getByRole("main", { name: "Referenced changes" })).toContainText(
      "test/invoice.test.ts",
    );
    await page.keyboard.press("k");
    await expect(page.getByRole("main", { name: "Referenced changes" })).toContainText(
      "src/invoice.ts",
    );
    await tree.locator('[data-item-path="test/invoice.test.ts"]').click();
    await expect(page.getByRole("main", { name: "Referenced changes" })).toContainText(
      "test/invoice.test.ts",
    );
    await tree.locator('[data-item-path="src/invoice.ts"]').click();
    await expect(page.getByRole("main", { name: "Referenced changes" })).toContainText(
      "src/invoice.ts",
    );
    await page.keyboard.press("l");
    await expect(explanation.getByRole("heading", { name: "Verify coverage" })).toBeVisible();
    await page.keyboard.press("h");
    await expect(explanation.getByRole("heading", { name: "Validate amounts" })).toBeVisible();
    await expect(filesTab).toHaveAttribute("aria-selected", "true");
    const details = page.getByRole("complementary", { name: "Guided review" });
    await page.getByRole("button", { name: /Toggle sidebar/ }).click();
    await expect(details).not.toBeVisible();
    await page.getByRole("button", { name: /Toggle sidebar/ }).click();
    await expect(details).toBeVisible();
    const separator = page
      .locator('[data-slot="resizable-handle"][title="Drag to resize. Double-click to toggle."]')
      .first();
    const beforeWidth = await details.evaluate((node) => node.getBoundingClientRect().width);
    const handle = await separator.boundingBox();
    if (!handle) throw new Error("Expected a sidebar resize handle");
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + 80, handle.y + handle.height / 2, { steps: 5 });
    await page.mouse.up();
    await expect
      .poll(() => details.evaluate((node) => node.getBoundingClientRect().width))
      .toBeGreaterThan(beforeWidth + 30);
    await page.getByRole("button", { name: "Files", exact: true }).click();
    await expect(page.locator(".diff-viewport-scroll")).toBeVisible();
    await page.getByRole("button", { name: "Guidance", exact: true }).click();
    await filesTab.click();
    await expect(page.locator("[data-selected-line]").first()).toBeVisible();
    expect(calls.filter((call) => call.kind === "prepare")).toHaveLength(1);
    expect(calls.filter((call) => call.kind === "files")).toHaveLength(1);
    expect(
      calls.filter((call) => call.kind === "versions" && call.path === "src/invoice.ts"),
    ).toHaveLength(1);
    await page.getByRole("button", { name: "Mark step reviewed" }).click();
    await expect(page.getByText(/1 of 2 reviewed/)).toBeVisible();
    await page.getByRole("tab", { name: /^Messages/ }).click();
    await page
      .getByRole("textbox", { name: "Ask or leave a note" })
      .fill("Should zero be accepted? hljk");
    await expect(explanation.getByRole("heading", { name: "Validate amounts" })).toBeVisible();
    await page.keyboard.type("hljk");
    await expect(explanation.getByRole("heading", { name: "Validate amounts" })).toBeVisible();
    await page
      .getByRole("textbox", { name: "Ask or leave a note" })
      .fill("Should zero be accepted?");
    await page.getByRole("button", { name: "Save message for agent" }).click();
    await expect(page.getByText("Waiting for agent", { exact: true })).toBeVisible();
    const inbox = await client.callTool({ name: "list_guidance_messages", arguments: {} });
    expect(JSON.stringify(inbox)).toContain("Should zero be accepted?");
    await client.callTool({
      name: "add_guidance_message",
      arguments: {
        ...locator,
        stepId: "validation",
        body: "Yes. The API allows a zero amount; only negative amounts are rejected.",
      },
    });
    const saved = await service.read(locator);
    if (!saved.ok || !saved.value) throw new Error("Expected saved guidance");
    const question = saved.value.messages.find((message) => message.role === "user");
    if (!question) throw new Error("Expected stored question");
    await client.callTool({
      name: "acknowledge_guidance_messages",
      arguments: { ...locator, messageIds: [question.id] },
    });
    await expect(page.getByText("Read by agent", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Yes. The API allows a zero amount; only negative amounts are rejected.", {
        exact: true,
      }),
    ).toBeVisible();
    await filesTab.click();
    await tree.locator('[data-item-path="test/invoice.test.ts"]').click();
    const sameFileViewport = await viewport.elementHandle();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(
      page
        .getByRole("region", { name: "Step explanation" })
        .getByRole("heading", { name: "Verify coverage" }),
    ).toBeVisible();
    await expect(page.locator("[data-selected-line]").first()).toBeVisible();
    await expect(page.getByRole("main", { name: "Referenced changes" })).toContainText(
      "test/invoice.test.ts",
    );
    await expect(explanation).toBeVisible();
    expect(await sameFileViewport?.evaluate((node) => node.isConnected)).toBe(true);
    expect(calls.filter((call) => call.kind === "prepare")).toHaveLength(1);
    expect(
      calls.filter((call) => call.kind === "versions" && call.path === "test/invoice.test.ts"),
    ).toHaveLength(1);
    await page.screenshot({
      path: "/tmp/ow-guidance-light.png",
      fullPage: true,
      animations: "disabled",
    });
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("qa-session") ?? ""))
      .toContain("guidance");
    await page.reload();
    await expect(page.getByText(/1 of 2 reviewed/)).toBeVisible();
    await page.getByRole("tab", { name: /^Messages/ }).click();
    await expect(page.getByText("Read by agent", { exact: true })).toBeVisible();
    await page.setViewportSize({ width: 1024, height: 850 });
    await page.evaluate(() => localStorage.setItem("open-warden-theme", "dark"));
    await page.reload();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(page.locator("[data-selected-line]").first()).toBeVisible();
    await page.screenshot({
      path: "/tmp/ow-guidance-dark.png",
      fullPage: true,
      animations: "disabled",
    });

    const prepareCount = calls.filter((call) => call.kind === "prepare").length;
    state.headSha = "head456";
    const guide = await service.read(locator);
    if (!guide.ok || !guide.value) throw new Error("Expected saved guidance");
    const refreshed = await client.callTool({
      name: "publish_guidance",
      arguments: {
        ...locator,
        expectedHeadSha: state.headSha,
        title: guide.value.title,
        summary: guide.value.summary,
        steps: guide.value.steps,
      },
    });
    expect(refreshed.isError).not.toBe(true);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page.getByText(/reviewed · head456/)).toBeVisible();
    await expect(page.locator("[data-selected-line]").first()).toBeVisible();
    expect(calls.filter((call) => call.kind === "prepare")).toHaveLength(prepareCount + 1);
    expect(pageErrors).toEqual([]);
  } catch (error) {
    await page.screenshot({ path: "/tmp/ow-guidance-failure.png", fullPage: true });
    console.error({ pageErrors, body: await page.locator("body").innerText() });
    throw error;
  } finally {
    await client.close();
    await started.value.close();
    await rm(directory, { recursive: true, force: true });
  }
});
