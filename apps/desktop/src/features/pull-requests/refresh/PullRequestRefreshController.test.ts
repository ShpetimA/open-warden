import { expect, test } from "vitest";
import {
  automaticRefreshDelay,
  PullRequestRefreshController,
} from "./PullRequestRefreshController";
import type { DesktopFailure } from "@/platform/desktop/failure";

const locator = { repoPath: "/repo", pullRequestNumber: 114 };
function clock() {
  let now = 0;
  let id = 0;
  const tasks = new Map<number, { at: number; work: () => void | Promise<void> }>();
  return {
    now: () => now,
    schedule(work: () => void | Promise<void>, delay: number) {
      const key = ++id;
      tasks.set(key, { at: now + delay, work });
      return () => {
        tasks.delete(key);
      };
    },
    async advance(delay: number) {
      now += delay;
      const due = [...tasks].filter(([, task]) => task.at <= now);
      for (const [key, task] of due) {
        tasks.delete(key);
        await task.work();
      }
    },
    pending: () => tasks.size,
  };
}

test("one shared refresh remains busy through all reads, coalesces clicks, and stops with the last view", async () => {
  const time = clock();
  const requests: Array<{ complete: (failures: DesktopFailure[]) => void }> = [];
  const controller = new PullRequestRefreshController({
    ...time,
    refresh: async () => await new Promise((complete) => requests.push({ complete })),
  });
  const releaseA = controller.retain(locator);
  const releaseB = controller.retain(locator);
  expect(time.pending()).toBe(1);
  const first = controller.request(locator);
  const second = controller.request(locator);
  expect(requests).toHaveLength(1);
  expect(controller.state(locator).busy).toBe(true);
  requests[0]!.complete([]);
  await Promise.all([first, second]);
  expect(controller.state(locator).busy).toBe(false);
  expect(time.pending()).toBe(1);
  releaseA();
  expect(time.pending()).toBe(1);
  releaseB();
  expect(time.pending()).toBe(0);
  await time.advance(600000);
  expect(requests).toHaveLength(1);
  controller.dispose();
});

test("permanent failures stop automatic focus and polling retries until an explicit retry succeeds", async () => {
  const time = clock();
  let requests = 0;
  const controller = new PullRequestRefreshController({
    ...time,
    refresh: async () =>
      ++requests === 1
        ? [
            {
              operation: "getPullRequestConversation",
              code: "authentication",
              message: "Reconnect",
            },
          ]
        : [],
  });
  const release = controller.retain(locator);
  await controller.request(locator);
  expect(controller.state(locator).paused).toBe(true);
  controller.recover();
  await time.advance(900000);
  expect(requests).toBe(1);
  await controller.request(locator);
  expect(requests).toBe(2);
  expect(controller.state(locator).paused).toBe(false);
  release();
  controller.dispose();
});

test("Retry-After applies to both automatic and manual requests without discarding cached query data", async () => {
  const time = clock();
  let requests = 0;
  const controller = new PullRequestRefreshController({
    ...time,
    refresh: async () =>
      ++requests === 1
        ? [
            {
              operation: "getPullRequestChecks",
              code: "rate-limit",
              message: "Wait",
              retryAt: 120000,
            },
          ]
        : [],
  });
  const release = controller.retain(locator);
  await controller.request(locator);
  await controller.request(locator);
  controller.recover();
  await time.advance(60000);
  expect(requests).toBe(1);
  await time.advance(60000);
  expect(requests).toBe(2);
  expect(controller.state(locator).failure).toBeNull();
  release();
  controller.dispose();
});

test("transient backoff caps at fifteen minutes while honoring longer provider deadlines", () => {
  expect(
    automaticRefreshDelay([{ operation: "read", code: "network", message: "Offline" }], 20, 0),
  ).toBe(900000);
  expect(
    automaticRefreshDelay(
      [{ operation: "read", code: "rate-limit", message: "Wait", retryAt: 3600000 }],
      20,
      0,
    ),
  ).toBe(3600000);
});

test("focus and reconnect respect transient backoff while an explicit retry can recover immediately", async () => {
  const time = clock();
  let reads = 0;
  const controller = new PullRequestRefreshController({
    ...time,
    refresh: async () =>
      ++reads === 1 ? [{ operation: "read", code: "network", message: "Offline" }] : [],
  });
  const release = controller.retain(locator);
  await controller.request(locator);
  controller.recover();
  controller.recover();
  await time.advance(30000);
  expect(reads).toBe(1);
  await controller.request(locator);
  expect(reads).toBe(2);
  expect(controller.state(locator).failure).toBeNull();
  release();
  controller.dispose();
});

test("refresh demand is the union of mounted views and releases idempotently", async () => {
  const time = clock();
  const reads: string[][] = [];
  const controller = new PullRequestRefreshController({
    ...time,
    async refresh(_locator, _manual, resources) {
      reads.push([...resources]);
      return [];
    },
  });
  const releaseOverview = controller.retain(locator, ["checks", "files"]);
  const releaseFiles = controller.retain(locator, ["comparison", "files"]);
  await controller.request(locator);
  expect(reads).toEqual([["checks", "files", "comparison"]]);
  releaseOverview();
  releaseOverview();
  await controller.request(locator);
  expect(reads.at(-1)).toEqual(["files", "comparison"]);
  releaseFiles();
  expect(time.pending()).toBe(0);
  controller.dispose();
  controller.retain(locator, ["checks"])();
  expect(time.pending()).toBe(0);
});

test("closing a PR during a refresh and disposing the owner schedules no further work", async () => {
  const time = clock();
  let finish: ((failures: DesktopFailure[]) => void) | undefined;
  const controller = new PullRequestRefreshController({
    ...time,
    refresh: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  const release = controller.retain(locator, ["comparison"]);
  const pending = controller.request(locator);
  release();
  controller.dispose();
  if (!finish) throw new Error("Refresh did not start");
  finish([]);
  await pending;
  expect(time.pending()).toBe(0);
});

test("revision guards belong to their views and survive the refresh request completing", async () => {
  const time = clock();
  const controller = new PullRequestRefreshController({ ...time, refresh: async () => [] });
  const ownerA = {};
  const ownerB = {};
  controller.setRevisionPending(locator, ownerA, true);
  expect(controller.state(locator).revisionPending).toBe(true);
  const release = controller.retain(locator);
  controller.setRevisionPending(locator, ownerB, true);
  await controller.request(locator);
  expect(controller.state(locator).revisionPending).toBe(true);
  controller.setRevisionPending(locator, ownerA, false);
  expect(controller.state(locator).revisionPending).toBe(true);
  controller.setRevisionPending(locator, ownerB, false);
  expect(controller.state(locator).revisionPending).toBe(false);
  release();
  controller.dispose();
});
