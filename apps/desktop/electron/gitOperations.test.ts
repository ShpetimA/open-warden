// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { getGitStashPatch, getGitRepositoryState, runGitCommand } from "./gitOperations";

const roots: string[] = [];
function git(repo: string, ...args: string[]) {
  return execFileSync("git", args, {
    cwd: repo,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "warden-git-ops-"));
  roots.push(root);
  git(root, "init", "--bare", "remote.git");
  git(root, "clone", path.join(root, "remote.git"), "repo");
  const repo = path.join(root, "repo");
  git(repo, "config", "user.name", "Test");
  git(repo, "config", "user.email", "test@example.com");
  git(repo, "switch", "-c", "main");
  await writeFile(path.join(repo, "file.txt"), "initial\n");
  git(repo, "add", ".");
  git(repo, "commit", "-m", "Initial");
  return { root, repo };
}
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

it("creates, publishes, tracks, switches, renames and deletes branches", async () => {
  const { repo } = await fixture();
  expect((await runGitCommand(repo, { kind: "publish", remote: "origin" })).ok).toBe(true);
  expect(
    (await runGitCommand(repo, { kind: "create", branch: "feature", startPoint: "HEAD" })).ok,
  ).toBe(true);
  expect((await runGitCommand(repo, { kind: "rename", branch: "renamed" })).ok).toBe(true);
  expect((await runGitCommand(repo, { kind: "switch", branch: "main" })).ok).toBe(true);
  expect((await runGitCommand(repo, { kind: "delete", branch: "renamed" })).ok).toBe(true);
  expect(
    (await runGitCommand(repo, { kind: "track", branch: "tracking", remoteBranch: "origin/main" }))
      .ok,
  ).toBe(true);
  const result = await getGitRepositoryState(repo);
  expect(result.ok && result.value.branch).toBe("tracking");
  expect(result.ok && result.value.upstream).toBe("origin/main");
});

it("fetches incoming commits, fast-forwards and pushes outgoing commits", async () => {
  const { root, repo } = await fixture();
  expect((await runGitCommand(repo, { kind: "publish", remote: "origin" })).ok).toBe(true);
  git(root, "clone", "-b", "main", path.join(root, "remote.git"), "peer");
  const peer = path.join(root, "peer");
  git(peer, "config", "user.name", "Peer");
  git(peer, "config", "user.email", "peer@example.com");
  await writeFile(path.join(peer, "remote.txt"), "remote\n");
  git(peer, "add", ".");
  git(peer, "commit", "-m", "Incoming");
  git(peer, "push");
  expect((await runGitCommand(repo, { kind: "fetch", remote: "origin" })).ok).toBe(true);
  const before = await getGitRepositoryState(repo);
  expect(before.ok && before.value.behind).toBe(1);
  expect(before.ok && before.value.incoming[0]?.subject).toBe("Incoming");
  expect((await runGitCommand(repo, { kind: "pull" })).ok).toBe(true);
  await writeFile(path.join(repo, "local.txt"), "local\n");
  git(repo, "add", ".");
  git(repo, "commit", "-m", "Outgoing");
  const ahead = await getGitRepositoryState(repo);
  expect(ahead.ok && ahead.value.ahead).toBe(1);
  expect((await runGitCommand(repo, { kind: "push" })).ok).toBe(true);
  const after = await getGitRepositoryState(repo);
  expect(after.ok && after.value.ahead).toBe(0);
});

it("does not overwrite dirty files when switching and refuses option-shaped names", async () => {
  const { repo } = await fixture();
  git(repo, "switch", "-c", "feature");
  await writeFile(path.join(repo, "file.txt"), "feature\n");
  git(repo, "commit", "-am", "Feature");
  git(repo, "switch", "main");
  await writeFile(path.join(repo, "file.txt"), "unsaved\n");
  expect((await runGitCommand(repo, { kind: "switch", branch: "feature" })).ok).toBe(false);
  expect(git(repo, "branch", "--show-current")).toBe("main");
  expect((await runGitCommand(repo, { kind: "switch", branch: "--discard-changes" })).ok).toBe(
    false,
  );
  expect(git(repo, "diff")).toContain("unsaved");
});

it("amends unpublished commits and undoes them while retaining staged changes", async () => {
  const { repo } = await fixture();
  git(repo, "commit", "--allow-empty", "-m", "Second");
  const expectedHead = git(repo, "rev-parse", "HEAD");
  expect(
    (await runGitCommand(repo, { kind: "amend", message: "Second\n\nDetails", expectedHead })).ok,
  ).toBe(true);
  expect(git(repo, "log", "-1", "--format=%B")).toBe("Second\n\nDetails");
  expect((await runGitCommand(repo, { kind: "undo", expectedHead })).ok).toBe(false);
  await writeFile(path.join(repo, "file.txt"), "updated\n");
  git(repo, "add", ".");
  expect(
    (
      await runGitCommand(repo, {
        kind: "amend",
        message: "Updated",
        expectedHead: git(repo, "rev-parse", "HEAD"),
      })
    ).ok,
  ).toBe(true);
  expect(
    (await runGitCommand(repo, { kind: "undo", expectedHead: git(repo, "rev-parse", "HEAD") })).ok,
  ).toBe(true);
  expect(git(repo, "diff", "--cached")).toContain("updated");
  expect(git(repo, "log", "-1", "--format=%s")).toBe("Initial");
});

it("protects published commits from amend and undo", async () => {
  const { repo } = await fixture();
  await runGitCommand(repo, { kind: "publish", remote: "origin" });
  const expectedHead = git(repo, "rev-parse", "HEAD");
  expect((await runGitCommand(repo, { kind: "amend", message: "Changed", expectedHead })).ok).toBe(
    false,
  );
  expect((await runGitCommand(repo, { kind: "undo", expectedHead })).ok).toBe(false);
  expect(git(repo, "rev-parse", "HEAD")).toBe(expectedHead);
});

it("saves untracked files, previews and applies a stash using its stable identity", async () => {
  const { repo } = await fixture();
  await writeFile(path.join(repo, "notes.txt"), "saved notes\n");
  expect(
    (await runGitCommand(repo, { kind: "stash-save", message: "Notes", includeUntracked: true }))
      .ok,
  ).toBe(true);
  const state = await getGitRepositoryState(repo);
  const oid = state.ok ? state.value.stashes[0]?.oid : undefined;
  if (!oid) throw new Error("Expected saved stash");
  const patch = await getGitStashPatch(repo, oid);
  expect(patch.ok && patch.value).toContain("saved notes");
  await writeFile(path.join(repo, "another.txt"), "another\n");
  await runGitCommand(repo, { kind: "stash-save", message: "Another", includeUntracked: true });
  expect((await runGitCommand(repo, { kind: "stash-pop", oid })).ok).toBe(true);
  expect(await readFile(path.join(repo, "notes.txt"), "utf8")).toBe("saved notes\n");
  expect(git(repo, "stash", "list")).toContain("Another");
  expect(git(repo, "stash", "list")).not.toContain("Notes");
});

it("retains the stash if applying it causes conflicts", async () => {
  const { repo } = await fixture();
  await writeFile(path.join(repo, "file.txt"), "stashed\n");
  await runGitCommand(repo, { kind: "stash-save", message: "Conflict", includeUntracked: false });
  const oid = git(repo, "rev-parse", "refs/stash");
  await writeFile(path.join(repo, "file.txt"), "committed\n");
  git(repo, "commit", "-am", "Conflict");
  expect((await runGitCommand(repo, { kind: "stash-pop", oid })).ok).toBe(false);
  expect(git(repo, "rev-parse", "refs/stash")).toBe(oid);
  expect(git(repo, "diff", "--name-only", "--diff-filter=U")).toBe("file.txt");
});
