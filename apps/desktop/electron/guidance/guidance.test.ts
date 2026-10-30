import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { PullRequestDetail } from "../../src/platform/desktop/contracts";
import {
  guidanceDocumentSchema,
  guidanceResultSchema,
  type GuidanceNavigate,
  type PublishGuidanceInput,
} from "../../src/platform/desktop/guidance";
import { GuidanceStore } from "./store";
import { GuidanceService } from "./service";
import { startGuidanceMcpServer } from "./mcpServer";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});
const locator = { repoPath: "/projects/invoice", pullRequestNumber: 114 };
const published: PublishGuidanceInput = {
  ...locator,
  expectedHeadSha: "head123",
  title: "Review invoice validation",
  summary: "Follow the request from validation to tests.",
  steps: [
    {
      id: "validation",
      title: "Validate amounts",
      body: "Reject negative invoice amounts before saving.",
      references: [
        {
          path: "src/invoice.ts",
          side: "head",
          startLine: 1,
          endLine: 2,
          note: "Reject negative amounts here; zero must remain valid.",
        },
      ],
    },
    {
      id: "tests",
      title: "Check coverage",
      body: "Check the invalid-input cases.",
      references: [{ path: "test/invoice.test.ts", side: "head", startLine: 1, endLine: 1 }],
    },
  ],
};
const detail: PullRequestDetail = {
  id: "114",
  providerId: "github",
  number: 114,
  title: "Validate invoices",
  body: "Adds validation",
  state: "open",
  isDraft: false,
  url: "https://github.com/team/invoice/pull/114",
  author: null,
  baseRef: "main",
  headRef: "invoice-validation",
  baseSha: "base123",
  headSha: "head123",
  createdAt: "2026-10-25T18:00:00Z",
  updatedAt: "2026-10-25T18:00:00Z",
  labels: [],
};

async function setup() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "ow-guidance-"));
  directories.push(directory);
  const store = new GuidanceStore(directory);
  const shown: GuidanceNavigate[] = [];
  const state = { headSha: "head123" };
  const dependencies = {
    store,
    loadWorkspaceSession: async () => ({
      ok: true as const,
      value: {
        openRepos: [locator.repoPath],
        activeRepo: locator.repoPath,
        recentRepos: [],
      },
    }),
    resolveHostedRepo: async () => ({
      providerId: "github" as const,
      owner: "team",
      repo: "invoice",
      remoteName: "origin",
      remoteUrl: "git@github.com:team/invoice.git",
      webUrl: "https://github.com/team/invoice",
    }),
    getPullRequestConversation: async () => ({
      detail: { ...detail, headSha: state.headSha },
      issueComments: [],
      reviewThreads: [],
    }),
    getPullRequestFiles: async () =>
      ["src/invoice.ts", "test/invoice.test.ts"].map((file) => ({
        path: file,
        previousPath: null,
        status: "modified" as const,
        additions: 2,
        deletions: 1,
      })),
    getPullRequestChecks: async () => ({
      headSha: state.headSha,
      checks: [],
      complete: true,
      mergeability: "mergeable" as const,
    }),
    preparePullRequestCompareRefs: async () => ({
      providerId: "github" as const,
      owner: "team",
      repo: "invoice",
      pullRequestNumber: 114,
      baseRef: "main",
      headRef: "feature",
      compareBaseRef: "base123",
      compareHeadRef: "head123",
      localBranch: "feature",
    }),
    getBranchFileVersions: async () => ({
      oldFile: { name: "src/invoice.ts", contents: "before\n" },
      newFile: { name: "src/invoice.ts", contents: "after\nvalidation\n" },
    }),
    now: () => "2026-10-25T18:00:00Z",
    id: randomUUID,
    show: (target: GuidanceNavigate) => shown.push(target),
  };
  return {
    service: new GuidanceService(dependencies),
    store,
    state,
    shown,
    directory,
    dependencies,
  };
}

it("persists steps, selected progress, and questions across service restarts without losing concurrent messages", async () => {
  const { service, directory, dependencies } = await setup();
  expect((await service.publish(published)).ok).toBe(true);
  await service.progress({ ...locator, stepId: "tests", reviewed: true });
  const writes = await Promise.all(
    Array.from({ length: 6 }, (_, index) =>
      service.message({ ...locator, stepId: "tests", body: `Question ${index}` }, "user"),
    ),
  );
  expect(writes.every((result) => result.ok)).toBe(true);
  const restarted = new GuidanceService({ ...dependencies, store: new GuidanceStore(directory) });
  const restored = await restarted.read(locator);
  expect(restored.ok).toBe(true);
  if (!restored.ok || !restored.value) throw new Error("Expected persisted guidance");
  expect(restored.value.selectedStepId).toBe("tests");
  expect(restored.value.steps[0]?.references[0]?.note).toBe(
    "Reject negative amounts here; zero must remain valid.",
  );
  expect(restored.value.reviewedStepIds).toEqual(["tests"]);
  expect(restored.value.messages).toHaveLength(6);
  expect(restored.value.messages[0]).toMatchObject({
    stepTitle: "Check coverage",
    headSha: "head123",
  });
  expect((await restarted.publish(published)).ok).toBe(true);
  const updated = await restarted.read(locator);
  expect(updated.ok && updated.value?.messages.length).toBe(6);
  expect(updated.ok && updated.value?.reviewedStepIds).toEqual(["tests"]);
});

it("stores replies and acknowledges only the requested questions", async () => {
  const { service } = await setup();
  await service.publish(published);
  const first = await service.message(
    { ...locator, stepId: "validation", body: "Why reject this?" },
    "user",
  );
  if (!first.ok) throw new Error("Expected saved question");
  const id = first.value.messages[0]?.id;
  if (!id) throw new Error("Expected question ID");
  await service.message({ ...locator, stepId: "tests", body: "Does this cover zero?" }, "user");
  await service.message(
    { ...locator, stepId: "validation", body: "Negative amounts are rejected before persistence." },
    "agent",
  );
  await service.acknowledge(locator, [id]);
  const inbox = await service.inbox();
  expect(inbox.ok && inbox.value[0]?.messages.map((message) => message.body)).toEqual([
    "Does this cover zero?",
  ]);
  const saved = await service.read(locator);
  expect(saved.ok && saved.value?.messages).toHaveLength(3);
});

it("rejects closed repository access, stale publication, unknown paths, and traversal", async () => {
  const { service, state } = await setup();
  expect(await service.read({ ...locator, repoPath: "/private/other" })).toMatchObject({
    ok: false,
    error: { code: "not-open" },
  });
  state.headSha = "new-head";
  expect(await service.publish(published)).toMatchObject({
    ok: false,
    error: { code: "stale-head" },
  });
  state.headSha = "head123";
  expect(
    await service.publish({
      ...published,
      steps: [
        {
          id: "bad",
          title: "Bad",
          body: "Bad",
          references: [{ path: "missing.ts", side: "head", startLine: 1, endLine: 1 }],
        },
      ],
    }),
  ).toMatchObject({ ok: false, error: { code: "invalid-input" } });
  expect(
    await service.publish({
      ...published,
      steps: [
        {
          id: "bad",
          title: "Bad",
          body: "Bad",
          references: [{ path: "../secret", side: "head", startLine: 1, endLine: 1 }],
        },
      ],
    }),
  ).toMatchObject({ ok: false, error: { code: "invalid-input" } });
});

it("resets reviewed steps on a new head while retaining the original question context", async () => {
  const { service, state } = await setup();
  await service.publish(published);
  await service.progress({ ...locator, stepId: "validation", reviewed: true });
  await service.message({ ...locator, stepId: "validation", body: "Why?" }, "user");
  state.headSha = "new-head";
  const updated = await service.publish({ ...published, expectedHeadSha: "new-head" });
  expect(updated.ok && updated.value.reviewedStepIds).toEqual([]);
  expect(updated.ok && updated.value.messages[0]?.headSha).toBe("head123");
});

it("serves real MCP clients with authentication, origin checks, publishing, navigation, and messages", async () => {
  const { service, shown } = await setup();
  const token = "a-test-token-used-only-for-this-local-server";
  const started = await startGuidanceMcpServer(service, { token, port: 0 });
  if (!started.ok) throw new Error(started.error.message);
  const client = new Client({ name: "guidance-test", version: "1.0.0" });
  try {
    expect((await fetch(started.value.endpoint, { method: "POST" })).status).toBe(401);
    expect(
      (
        await fetch(started.value.endpoint, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, Origin: "https://evil.example" },
        })
      ).status,
    ).toBe(403);
    const initialized = await fetch(started.value.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "t3-compatible-client", version: "1.0.0" },
        },
      }),
    });
    expect(initialized.status).toBe(200);
    expect(await initialized.json()).toMatchObject({
      result: { protocolVersion: "2025-06-18" },
    });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(started.value.endpoint), {
        requestInit: { headers: { Authorization: `Bearer ${token}` } },
      }),
    );
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toContain("list_guidance_messages");
    expect(
      (await client.callTool({ name: "start_guidance", arguments: locator })).isError,
    ).not.toBe(true);
    const activity = await service.activity(locator);
    if (!activity.ok || !activity.value) throw new Error("Expected a running activity");
    expect(activity.value.status).toBe("working");
    const response = await client.callTool({
      name: "publish_guidance",
      arguments: { ...published, activityId: activity.value.id },
    });
    const block = response.content;
    expect(Array.isArray(block)).toBe(true);
    if (!Array.isArray(block)) throw new Error("Expected tool content");
    const text = block.find(
      (item: unknown) =>
        typeof item === "object" && item !== null && "type" in item && item.type === "text",
    );
    if (!text || typeof text !== "object" || !("text" in text) || typeof text.text !== "string")
      throw new Error("Expected tool text");
    const saved = guidanceResultSchema(guidanceDocumentSchema).parse(JSON.parse(text.text));
    expect(saved.ok && saved.value.headSha).toBe("head123");
    expect(await service.activity(locator)).toMatchObject({
      ok: true,
      value: { status: "completed" },
    });
    await client.callTool({
      name: "show_guidance_step",
      arguments: { ...locator, stepId: "tests" },
    });
    expect(shown.at(-1)).toMatchObject({ ...locator, owner: "team", repo: "invoice" });
    await service.message({ ...locator, stepId: "tests", body: "Check this case" }, "user");
    const inbox = await client.callTool({ name: "list_guidance_messages", arguments: {} });
    expect(JSON.stringify(inbox)).toContain("Check this case");
    await client.callTool({
      name: "add_guidance_message",
      arguments: {
        ...locator,
        stepId: "tests",
        body: "This case is covered by the second assertion.",
      },
    });
    const final = await service.read(locator);
    expect(final.ok && final.value?.messages.at(-1)?.role).toBe("agent");
    await client.callTool({ name: "start_guidance", arguments: locator });
    const retry = await service.activity(locator);
    if (!retry.ok || !retry.value) throw new Error("Expected a new activity");
    await client.callTool({
      name: "finish_guidance",
      arguments: {
        ...locator,
        activityId: retry.value.id,
        status: "failed",
        message: "The provider is unavailable. Try again.",
      },
    });
    const activityReply = await client.callTool({
      name: "get_guidance_activity",
      arguments: locator,
    });
    expect(JSON.stringify(activityReply)).toContain("failed");
  } finally {
    await client.close();
    await started.value.close();
  }
});

it("tracks work before a walkthrough exists and rejects replaced runs", async () => {
  const { service, dependencies, state } = await setup();
  expect(await service.read(locator)).toEqual({ ok: true, value: null });
  const first = await service.start(locator);
  const next = await service.start({ ...locator, message: "Reading export tests…" });
  if (!first.ok || !next.ok) throw new Error("Expected running activities");
  expect(await service.publish({ ...published, activityId: first.value.id })).toMatchObject({
    ok: false,
    error: { code: "not-found" },
  });
  expect(await service.read(locator)).toEqual({ ok: true, value: null });
  state.headSha = "head456";
  expect(
    (
      await service.publish({
        ...published,
        expectedHeadSha: state.headSha,
        activityId: next.value.id,
      })
    ).ok,
  ).toBe(true);
  expect(await service.activity(locator)).toMatchObject({
    ok: true,
    value: { status: "completed" },
  });
  expect(
    await service.finish({
      ...locator,
      activityId: next.value.id,
      status: "cancelled",
      message: "Stopped",
    }),
  ).toMatchObject({ ok: false });
  const another = await service.start(locator);
  if (!another.ok) throw new Error("Expected running activity");
  expect(
    await service.finish({
      ...locator,
      activityId: another.value.id,
      status: "cancelled",
      message: "Stopped at the user's request",
    }),
  ).toMatchObject({ ok: true, value: { status: "cancelled" } });
  expect(await service.start({ ...locator, repoPath: "/not-open" })).toMatchObject({
    ok: false,
    error: { code: "not-open" },
  });
  expect(await new GuidanceService(dependencies).activity(locator)).toEqual({
    ok: true,
    value: null,
  });
});

it("clears conversation and acknowledgements while preserving steps and review progress", async () => {
  const { service, directory } = await setup();
  await service.publish(published);
  await service.progress({ ...locator, stepId: "tests", reviewed: true });
  const sent = await service.message({ ...locator, stepId: "tests", body: "Why?" }, "user");
  if (!sent.ok || !sent.value.messages[0]) throw new Error("Expected a saved question");
  await service.acknowledge(locator, [sent.value.messages[0].id]);
  const cleared = await service.clearMessages(locator);
  expect(cleared).toMatchObject({
    ok: true,
    value: {
      messages: [],
      acknowledgedMessageIds: [],
      selectedStepId: "tests",
      reviewedStepIds: ["tests"],
    },
  });
  expect(await new GuidanceStore(directory).read(locator)).toMatchObject({
    ok: true,
    value: { messages: [], steps: published.steps },
  });
  await service.message({ ...locator, stepId: "tests", body: "A new question" }, "user");
  expect(JSON.stringify(await service.inbox())).toContain("A new question");
});
