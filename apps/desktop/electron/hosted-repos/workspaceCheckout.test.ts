import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ensurePreparedBranchCheckout, ensurePreparedWorktree } from "./workspace";

vi.setConfig({ testTimeout: 30_000 });

const roots: string[] = [];

function git(repo: string, ...args: string[]) {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
}

function repository() {
  const root = mkdtempSync(path.join(os.tmpdir(), "open-warden-worktree-"));
  roots.push(root);
  git(root, "init", "-q");
  git(root, "config", "user.name", "Open Warden Test");
  git(root, "config", "user.email", "test@open-warden.invalid");
  writeFileSync(path.join(root, "tracked.txt"), "first\n");
  git(root, "add", ".");
  git(root, "commit", "-qm", "first");
  git(root, "update-ref", "refs/remotes/open-warden/head/pr-1", "HEAD");
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("prepared PR checkouts", () => {
  it("preserves edits in an existing worktree and fast-forwards once they are cleared", async () => {
    const repo = repository();
    const worktree = path.join(repo, "..", `${path.basename(repo)}-pr`);
    roots.push(worktree);
    const branch = "open-warden/pr-1";
    const ref = "open-warden/head/pr-1";
    await ensurePreparedWorktree(repo, worktree, branch, ref);

    writeFileSync(path.join(worktree, "tracked.txt"), "local edit\n");
    writeFileSync(path.join(worktree, "untracked.txt"), "keep me\n");
    writeFileSync(path.join(repo, "tracked.txt"), "second\n");
    git(repo, "add", ".");
    git(repo, "commit", "-qm", "second");
    git(repo, "update-ref", "refs/remotes/open-warden/head/pr-1", "HEAD");

    await expect(ensurePreparedWorktree(repo, worktree, branch, ref)).rejects.toThrow(
      "local changes",
    );
    expect(readFileSync(path.join(worktree, "tracked.txt"), "utf8")).toBe("local edit\n");
    expect(readFileSync(path.join(worktree, "untracked.txt"), "utf8")).toBe("keep me\n");

    git(worktree, "restore", "tracked.txt");
    rmSync(path.join(worktree, "untracked.txt"));
    await ensurePreparedWorktree(repo, worktree, branch, ref);
    expect(git(worktree, "rev-parse", "HEAD")).toBe(git(repo, "rev-parse", "HEAD"));
  });

  it("refuses to overwrite a directory at the managed worktree path", async () => {
    const repo = repository();
    const worktree = path.join(repo, "occupied");
    writeFileSync(worktree, "keep me");
    await expect(
      ensurePreparedWorktree(repo, worktree, "open-warden/pr-1", "open-warden/head/pr-1"),
    ).rejects.toThrow("already contains files");
    expect(readFileSync(worktree, "utf8")).toBe("keep me");
  });

  it("refuses to switch branches with local edits", async () => {
    const repo = repository();
    writeFileSync(path.join(repo, "tracked.txt"), "local edit\n");
    await expect(
      ensurePreparedBranchCheckout(repo, "pr-1", "open-warden/head/pr-1"),
    ).rejects.toThrow("local changes");
    expect(readFileSync(path.join(repo, "tracked.txt"), "utf8")).toBe("local edit\n");
  });

  it("preserves local commits on an existing managed branch", async () => {
    const repo = repository();
    const originalHead = git(repo, "rev-parse", "HEAD");
    git(repo, "branch", "open-warden/pr-1");
    git(repo, "checkout", "-q", "open-warden/pr-1");
    writeFileSync(path.join(repo, "tracked.txt"), "local commit\n");
    git(repo, "add", ".");
    git(repo, "commit", "-qm", "local");
    const localHead = git(repo, "rev-parse", "HEAD");
    git(repo, "checkout", "-q", "-B", "main", originalHead);

    const worktree = path.join(repo, "..", `${path.basename(repo)}-pr`);
    roots.push(worktree);
    await expect(
      ensurePreparedWorktree(repo, worktree, "open-warden/pr-1", "open-warden/head/pr-1"),
    ).rejects.toThrow("local commits");
    expect(git(repo, "rev-parse", "refs/heads/open-warden/pr-1")).toBe(localHead);
    expect(existsSync(worktree)).toBe(false);
  });
});
