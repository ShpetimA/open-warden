import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, unlink, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";

import { getGitSnapshot } from "./git";
import { getGitRepositoryState, runGitCommand } from "./gitOperations";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function createRepository() {
  const repo = await mkdtemp(path.join(os.tmpdir(), "warden-read-locks-"));
  roots.push(repo);

  function git(...args: string[]) {
    return execFileSync("git", args, {
      cwd: repo,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  }

  git("init", "--initial-branch=main");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.com");
  const file = path.join(repo, "invoice.txt");
  await writeFile(file, "Invoice\n");
  git("add", ".");
  git("commit", "-m", "Initial invoice");

  return { repo, file, git };
}

it.each(["snapshot", "repository state"] as const)(
  "%s reads do not refresh the index cache",
  async (reader) => {
    const { repo, file, git } = await createRepository();
    const index = path.join(repo, ".git/index");
    const before = await readFile(index);
    const changedTime = new Date(Date.now() + 60_000);
    await utimes(file, changedTime, changedTime);

    if (reader === "snapshot") {
      const result = await getGitSnapshot(repo);
      expect(result.unstaged).toEqual([]);
    } else {
      const result = await getGitRepositoryState(repo);
      expect(result.ok).toBe(true);
    }

    expect(await readFile(index)).toEqual(before);

    git("status", "--porcelain");
    expect(await readFile(index)).not.toEqual(before);
  },
);

it("still requires the index write lock for amendments", async () => {
  const { repo, git } = await createRepository();
  const expectedHead = git("rev-parse", "HEAD");
  const lock = path.join(repo, ".git/index.lock");
  await writeFile(lock, "Another writer owns this lock");

  const blocked = await runGitCommand(repo, {
    kind: "amend",
    expectedHead,
    message: "Updated invoice",
  });
  expect(blocked.ok).toBe(false);
  expect(git("rev-parse", "HEAD")).toBe(expectedHead);
  expect(await readFile(lock, "utf8")).toBe("Another writer owns this lock");

  await unlink(lock);
  const amended = await runGitCommand(repo, {
    kind: "amend",
    expectedHead,
    message: "Updated invoice",
  });
  expect(amended.ok).toBe(true);
  expect(git("log", "-1", "--format=%s")).toBe("Updated invoice");
});
