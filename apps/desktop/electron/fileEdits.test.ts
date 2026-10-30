import { execFileSync } from "node:child_process";
import { chmod, lstat, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test, vi } from "vitest";

import type { DiffEditExpectation } from "../src/platform/desktop/fileEdits";
import { getFileVersions } from "./git";
import { updateIndexFileContents, updateWorktreeFileContents } from "./fileEdits";
import { runGitCommand } from "./gitOperations";
import { coordinateRepositoryWrite } from "./repositoryWrites";

vi.setConfig({ testTimeout: 30_000 });

function noop() {}

const directories: string[] = [];
function git(repo: string, args: string[]): string {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
}
async function repository(contents = "base\n") {
  const repo = await mkdtemp(path.join(os.tmpdir(), "warden-guarded-write-"));
  directories.push(repo);
  git(repo, ["init", "-q"]);
  git(repo, ["config", "user.name", "Test"]);
  git(repo, ["config", "user.email", "test@example.com"]);
  await writeFile(path.join(repo, "file.txt"), contents);
  git(repo, ["add", "."]);
  git(repo, ["commit", "-qm", "Base"]);
  return repo;
}
async function expectation(
  repo: string,
  bucket: "staged" | "unstaged",
): Promise<DiffEditExpectation> {
  const versions = await getFileVersions(repo, "file.txt", bucket);
  return {
    kind: "diff",
    bucket,
    oldContents: versions.oldFile?.contents ?? null,
    newContents: versions.newFile?.contents ?? null,
  };
}
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

test("a stale working-file save leaves external edits untouched", async () => {
  const repo = await repository();
  await writeFile(path.join(repo, "file.txt"), "external\n");
  const result = await updateWorktreeFileContents(repo, "file.txt", "draft\n", {
    kind: "worktree",
    contents: "base\n",
  });
  expect(result).toMatchObject({ ok: false, error: { code: "conflict" } });
  expect(await readFile(path.join(repo, "file.txt"), "utf8")).toBe("external\n");
});

test.each(["stage", "unstage", "discard"] as const)(
  "rejects %s from an obsolete diff",
  async (operation) => {
    const repo = await repository();
    await writeFile(path.join(repo, "file.txt"), "first\n");
    if (operation === "unstage") git(repo, ["add", "file.txt"]);
    const expected = await expectation(repo, operation === "unstage" ? "staged" : "unstaged");
    await writeFile(path.join(repo, "file.txt"), "newer\n");
    if (operation === "unstage") git(repo, ["add", "file.txt"]);
    const result =
      operation === "discard"
        ? await updateWorktreeFileContents(repo, "file.txt", "base\n", expected)
        : await updateIndexFileContents(repo, "file.txt", "base\n", expected);
    expect(result).toMatchObject({ ok: false, error: { code: "conflict" } });
    expect(await readFile(path.join(repo, "file.txt"), "utf8")).toBe("newer\n");
    expect(git(repo, ["show", ":file.txt"])).toBe(operation === "unstage" ? "newer" : "base");
  },
);

test("staging checks the index as well as the worktree and preserves unrelated staged files", async () => {
  const repo = await repository();
  await writeFile(path.join(repo, "file.txt"), "first\n");
  const old = await expectation(repo, "unstaged");
  git(repo, ["add", "file.txt"]);
  expect(await updateIndexFileContents(repo, "file.txt", "base\n", old)).toMatchObject({
    ok: false,
    error: { code: "conflict" },
  });
  await writeFile(path.join(repo, "other.txt"), "keep\n");
  git(repo, ["add", "other.txt"]);
  await writeFile(path.join(repo, "file.txt"), "second\n");
  const current = await expectation(repo, "unstaged");
  expect(await updateIndexFileContents(repo, "file.txt", "second\n", current)).toEqual({
    ok: true,
    value: undefined,
  });
  expect(git(repo, ["show", ":file.txt"])).toBe("second");
  expect(git(repo, ["show", ":other.txt"])).toBe("keep");
});

test("index edits respect an external Git index lock", async () => {
  const repo = await repository();
  await writeFile(path.join(repo, "file.txt"), "changed\n");
  const expected = await expectation(repo, "unstaged");
  const lock = path.join(repo, ".git", "index.lock");
  await writeFile(lock, "external lock");
  expect(await updateIndexFileContents(repo, "file.txt", "changed\n", expected)).toMatchObject({
    ok: false,
    error: { code: "busy" },
  });
  expect(await readFile(lock, "utf8")).toBe("external lock");
  expect(git(repo, ["show", ":file.txt"])).toBe("base");
});

test("working and index writes preserve executable modes, CRLF bytes, and a UTF-8 BOM", async () => {
  const repo = await repository("\ufeffbase\r\n");
  await chmod(path.join(repo, "file.txt"), 0o755);
  git(repo, ["add", "file.txt"]);
  await writeFile(path.join(repo, "file.txt"), "\ufeffchanged\r\n");
  expect(
    await updateIndexFileContents(
      repo,
      "file.txt",
      "changed\r\n",
      await expectation(repo, "unstaged"),
    ),
  ).toMatchObject({ ok: true });
  const indexBytes = execFileSync("git", ["show", ":file.txt"], { cwd: repo });
  expect(indexBytes).toEqual(Buffer.from("\ufeffchanged\r\n"));
  expect(git(repo, ["ls-files", "-s"])).toMatch(/^100755 /);
  expect(
    await updateWorktreeFileContents(repo, "file.txt", "saved\r\n", {
      kind: "worktree",
      contents: "changed\r\n",
    }),
  ).toMatchObject({ ok: true });
  expect(await readFile(path.join(repo, "file.txt"))).toEqual(Buffer.from("\ufeffsaved\r\n"));
  expect((await lstat(path.join(repo, "file.txt"))).mode & 0o777).toBe(0o755);
});

test("symbolic links cannot redirect a guarded working-file write", async () => {
  const repo = await repository();
  const external = path.join(repo, "outside.txt");
  await writeFile(external, "base\n");
  await symlink(external, path.join(repo, "link.txt"));
  expect(
    await updateWorktreeFileContents(repo, "link.txt", "overwrite\n", {
      kind: "worktree",
      contents: "base\n",
    }),
  ).toMatchObject({ ok: false, error: { code: "invalid-input" } });
  expect(await readFile(external, "utf8")).toBe("base\n");
});

test("native commands and file edits share one operation guard, which is released on failure", async () => {
  const repo = await repository();
  let release: () => void = noop;
  let started: () => void = noop;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  const pending = coordinateRepositoryWrite(repo, "test-operation", async () => {
    started();
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    throw new Error("operation failed");
  });
  await ready;
  expect(
    await runGitCommand(repo, { kind: "create", branch: "blocked", startPoint: "HEAD" }),
  ).toMatchObject({ ok: false, error: { code: "busy" } });
  expect(
    await updateWorktreeFileContents(repo, "file.txt", "draft\n", {
      kind: "worktree",
      contents: "base\n",
    }),
  ).toMatchObject({ ok: false, error: { code: "busy" } });
  release();
  expect(await pending).toMatchObject({ ok: false });
  expect(
    await updateWorktreeFileContents(repo, "file.txt", "draft\n", {
      kind: "worktree",
      contents: "base\n",
    }),
  ).toMatchObject({ ok: true });
});

test("two competing native saves cannot both replace the same original version", async () => {
  const repo = await repository();
  const outcomes = await Promise.all(
    ["first", "second"].map((value) =>
      updateWorktreeFileContents(repo, "file.txt", value, { kind: "worktree", contents: "base\n" }),
    ),
  );
  expect(outcomes.filter((outcome) => outcome.ok)).toHaveLength(1);
  expect(["first", "second"]).toContain(await readFile(path.join(repo, "file.txt"), "utf8"));
  expect(outcomes.find((outcome) => !outcome.ok)).toMatchObject({
    ok: false,
    error: { code: expect.stringMatching(/busy|conflict/) },
  });
});

test("fully unstaging a new file removes its index entry and keeps the working file", async () => {
  const repo = await repository();
  git(repo, ["rm", "--cached", "file.txt"]);
  git(repo, ["commit", "-qm", "Remove tracked entry"]);
  git(repo, ["add", "file.txt"]);
  const expected = await expectation(repo, "staged");
  expect(await updateIndexFileContents(repo, "file.txt", "", expected)).toMatchObject({ ok: true });
  expect(git(repo, ["ls-files", "file.txt"])).toBe("");
  expect(await readFile(path.join(repo, "file.txt"), "utf8")).toBe("base\n");
});

test("restoring staged and unstaged deletions preserves executable mode and BOM bytes", async () => {
  const repo = await repository("\ufeffbase\r\n");
  await chmod(path.join(repo, "file.txt"), 0o755);
  git(repo, ["add", "file.txt"]);
  git(repo, ["commit", "-qm", "Executable"]);
  await rm(path.join(repo, "file.txt"));
  expect(
    await updateWorktreeFileContents(
      repo,
      "file.txt",
      "base\r\n",
      await expectation(repo, "unstaged"),
    ),
  ).toMatchObject({ ok: true });
  expect(await readFile(path.join(repo, "file.txt"))).toEqual(Buffer.from("\ufeffbase\r\n"));
  expect((await lstat(path.join(repo, "file.txt"))).mode & 0o777).toBe(0o755);
  git(repo, ["rm", "file.txt"]);
  expect(
    await updateIndexFileContents(repo, "file.txt", "base\r\n", await expectation(repo, "staged")),
  ).toMatchObject({ ok: true });
  expect(execFileSync("git", ["show", ":file.txt"], { cwd: repo })).toEqual(
    Buffer.from("\ufeffbase\r\n"),
  );
  expect(git(repo, ["ls-files", "-s"])).toMatch(/^100755 /);
});

test("staging a complete deletion removes its index entry", async () => {
  const repo = await repository();
  await rm(path.join(repo, "file.txt"));
  expect(
    await updateIndexFileContents(repo, "file.txt", "", await expectation(repo, "unstaged")),
  ).toMatchObject({ ok: true });
  expect(git(repo, ["ls-files", "file.txt"])).toBe("");
});

test("working-file replacement preserves permission bits despite the process umask", async () => {
  const repo = await repository();
  await chmod(path.join(repo, "file.txt"), 0o664);
  expect(
    await updateWorktreeFileContents(repo, "file.txt", "saved\n", {
      kind: "worktree",
      contents: "base\n",
    }),
  ).toMatchObject({ ok: true });
  expect((await lstat(path.join(repo, "file.txt"))).mode & 0o777).toBe(0o664);
});

test("linked worktrees share the same native operation guard", async () => {
  const repo = await repository();
  const linked = await mkdtemp(path.join(os.tmpdir(), "warden-linked-write-"));
  directories.push(linked);
  git(repo, ["worktree", "add", "-b", "linked", linked]);
  let release: () => void = noop;
  let started: () => void = noop;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  const pending = coordinateRepositoryWrite(repo, "held-write", async () => {
    started();
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return { ok: true, value: undefined };
  });
  await ready;
  try {
    expect(
      await updateWorktreeFileContents(linked, "file.txt", "draft\n", {
        kind: "worktree",
        contents: "base\n",
      }),
    ).toMatchObject({ ok: false, error: { code: "busy" } });
    expect(await readFile(path.join(linked, "file.txt"), "utf8")).toBe("base\n");
  } finally {
    release();
    await pending;
  }
  expect(
    await updateWorktreeFileContents(linked, "file.txt", "draft\n", {
      kind: "worktree",
      contents: "base\n",
    }),
  ).toMatchObject({ ok: true });
});
