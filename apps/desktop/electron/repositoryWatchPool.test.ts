import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import {
  RepositoryWatchPool,
  type RepositoryFileEvent,
  type RepositoryWatchLease,
} from "./repositoryWatchPool";

const cleanup: Array<() => Promise<unknown>> = [];
afterEach(async () => {
  for (const release of cleanup.splice(0).toReversed()) await release();
});

function recorder() {
  const events: RepositoryFileEvent[] = [];
  const failures: unknown[] = [];
  const listeners = new Set<() => void>();
  return {
    events,
    failures,
    receive(error: unknown, changes: readonly RepositoryFileEvent[]) {
      if (error) failures.push(error);
      events.push(...changes);
      for (const listener of listeners) listener();
    },
    waitFor(file: string) {
      return new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          listeners.delete(check);
          reject(new Error("Native event was not delivered"));
        }, 5000);
        const check = () => {
          if (events.some((event) => event.path === file)) {
            clearTimeout(timeout);
            listeners.delete(check);
            resolve();
          }
        };
        listeners.add(check);
        check();
      });
    },
  };
}

function own(lease: RepositoryWatchLease) {
  cleanup.push(() => lease.close());
  return lease;
}

test("shared roots preserve remaining readers and exclude ignored directories", async () => {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "warden-native-pool-")));
  cleanup.push(() => rm(root, { recursive: true, force: true }));
  const ignored = path.join(root, "node_modules");
  await mkdir(ignored);
  const pool = new RepositoryWatchPool();
  const first = recorder();
  const second = recorder();
  const a = own(await pool.recursiveRoot(root, [ignored], first.receive));
  own(await pool.recursiveRoot(root, [ignored], second.receive));
  await a.close();
  await writeFile(path.join(ignored, "dependency.js"), "ignored");
  const changed = path.join(root, "visible.txt");
  await writeFile(changed, "visible");
  await second.waitFor(changed);
  expect(second.events.some((event) => event.path.startsWith(ignored))).toBe(false);
  expect(first.events).toEqual([]);
  expect(second.failures).toEqual([]);
});

test("a failed root acquisition does not poison later subscriptions", async () => {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "warden-native-recovery-")));
  cleanup.push(() => rm(root, { recursive: true, force: true }));
  const target = path.join(root, "repository");
  const pool = new RepositoryWatchPool();
  const observer = recorder();
  await expect(pool.recursiveRoot(target, [], observer.receive)).rejects.toBeDefined();
  await mkdir(target);
  own(await pool.recursiveRoot(target, [], observer.receive));
  const file = path.join(target, "new.txt");
  await writeFile(file, "new");
  await observer.waitFor(file);
  expect(observer.failures).toEqual([]);
});
