// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { getGitRepositoryState, runGitCommand } from "./gitOperations";

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
