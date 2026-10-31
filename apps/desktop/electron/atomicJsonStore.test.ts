import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";

import { createAtomicJsonStore } from "./atomicJsonStore";
import {
  createWorkspaceSession,
  storedWorkspaceSessionSchema,
} from "../src/platform/desktop/workspaceSession";

const directories: string[] = [];
async function storage() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "warden-drafts-"));
  directories.push(directory);
  const file = path.join(directory, "session.json");
  const open = () =>
    createAtomicJsonStore({
      file,
      schema: storedWorkspaceSessionSchema,
      empty: createWorkspaceSession,
      operation: "workspaceSession",
    });
  return { directory, file, open };
}
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

const comment = {
  type: "annotation" as const,
  id: "pending-review",
  repoPath: "/repo/a",
  filePath: "file.ts",
  bucket: "unstaged" as const,
  startLine: 2,
  endLine: 3,
  side: "additions" as const,
  text: "Keep my pending review",
  contextKind: "review" as const,
  baseRef: "base-sha",
  headRef: "head-sha",
};

test("review comments round trip through actual storage without losing their revision scope", async () => {
  const { open } = await storage();
  const session = {
    ...createWorkspaceSession({ openRepos: ["/repo/a"], activeRepo: "/repo/a" }),
    comments: [comment],
  };
  expect(await open().write(session)).toEqual({ ok: true, value: session });
  expect(await open().read()).toEqual({ ok: true, value: { data: session, recovered: false } });
});

test("an interrupted primary write recovers the last valid backup and preserves the damaged original", async () => {
  const { open, file, directory } = await storage();
  const first = { ...createWorkspaceSession(), comments: [comment] };
  await open().write(first);
  await open().write({ ...first, comments: [{ ...comment, text: "Next version" }] });
  await writeFile(file, '{"comments":[');
  expect(await open().read()).toEqual({ ok: true, value: { data: first, recovered: true } });
  expect(await open().write(first)).toMatchObject({ ok: true });
  const damaged = (await readdir(directory)).find((name) => name.includes(".damaged-"));
  expect(damaged).toBeDefined();
  expect(await readFile(path.join(directory, damaged!), "utf8")).toBe('{"comments":[');
});

test("unreadable stored drafts cannot be replaced with an empty session", async () => {
  const { open, file } = await storage();
  await writeFile(file, "damaged but potentially recoverable");
  expect(await open().read()).toMatchObject({ ok: false, error: { code: "storage-failed" } });
  expect(await open().write(createWorkspaceSession())).toMatchObject({
    ok: false,
    error: { code: "storage-failed" },
  });
  expect(await readFile(file, "utf8")).toBe("damaged but potentially recoverable");
});

test("writes from different store instances remain ordered and leave complete JSON plus a backup", async () => {
  const { open, file, directory } = await storage();
  const results = await Promise.all(
    Array.from({ length: 12 }, (_, index) =>
      open().write({
        ...createWorkspaceSession(),
        comments: [{ ...comment, text: `Draft ${index}` }],
      }),
    ),
  );
  expect(results.every((result) => result.ok)).toBe(true);
  expect(JSON.parse(await readFile(file, "utf8")).comments[0].text).toBe("Draft 11");
  expect(JSON.parse(await readFile(`${file}.backup`, "utf8")).comments[0].text).toBe("Draft 10");
  expect((await readdir(directory)).some((name) => name.endsWith(".tmp"))).toBe(false);
});

test("invalid revision context is rejected without modifying valid saved work", async () => {
  const { open, file } = await storage();
  await open().write({ ...createWorkspaceSession(), comments: [comment] });
  const original = await readFile(file, "utf8");
  expect(
    await open().write({
      ...createWorkspaceSession(),
      comments: [{ ...comment, headRef: undefined }],
    }),
  ).toMatchObject({ ok: false });
  expect(await readFile(file, "utf8")).toBe(original);
});
