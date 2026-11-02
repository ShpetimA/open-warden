// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test, vi } from "vitest";

import { getBranchFiles } from "../git";
import { fetchPullRequestComparison, type PullRequestComparisonInput } from "./comparison";
import { BitbucketCommitResolver } from "../BitbucketCommitResolver";

vi.setConfig({ testTimeout: 30_000 });

const roots: string[] = [];

function git(repo: string, ...args: string[]) {
  return execFileSync("git", args, {
    cwd: repo,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function configure(repo: string) {
  git(repo, "config", "user.name", "Comparison Test");
  git(repo, "config", "user.email", "comparison@open-warden.invalid");
  git(repo, "config", "commit.gpgsign", "false");
  git(repo, "config", "core.hooksPath", os.devNull);
}

async function commit(repo: string, file: string) {
  await writeFile(path.join(repo, file), `${file}\n`);
  git(repo, "add", file);
  git(repo, "commit", "-qm", file);

  return git(repo, "rev-parse", "HEAD");
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "warden-pr-comparison-"));

  roots.push(root);

  const upstream = path.join(root, "upstream");
  const fork = path.join(root, "fork");
  const repo = path.join(root, "checkout");

  await mkdir(upstream);
  await mkdir(repo);
  git(upstream, "init", "-q", "--initial-branch=main");
  configure(upstream);

  const shared = await commit(upstream, "shared.txt");

  git(root, "clone", "--no-local", upstream, fork);
  configure(fork);
  git(fork, "switch", "-c", "feature");

  const headSha = await commit(fork, "reviewed.txt");
  const baseSha = await commit(upstream, "base.txt");
  const latestBase = await commit(upstream, "newer-base.txt");

  git(fork, "reset", "--hard", shared);

  const latestHead = await commit(fork, "force-pushed.txt");

  git(repo, "init", "-q", "--initial-branch=local");
  await writeFile(path.join(repo, "keep.txt"), "staged local changes\n");
  git(repo, "add", "keep.txt");
  await writeFile(path.join(repo, "keep.txt"), "unstaged local changes\n");

  const input: PullRequestComparisonInput = {
    repoPath: repo,
    pullRequestNumber: 7,
    base: { remoteUrl: upstream, commitSha: baseSha },
    head: { remoteUrl: fork, commitSha: headSha },
    authHeaders: [""],
  };

  return { repo, upstream, fork, shared, baseSha, headSha, latestBase, latestHead, input };
}

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

test("compares the API commit snapshot after the base advances and the fork head is force-pushed", async () => {
  const f = await fixture();
  const status = git(f.repo, "status", "--porcelain");
  const result = await fetchPullRequestComparison(f.input);

  expect(result).toEqual({
    ok: true,
    value: { baseSha: f.baseSha, compareBaseRef: f.shared, compareHeadRef: f.headSha },
  });
  expect(git(f.upstream, "rev-parse", "main")).toBe(f.latestBase);
  expect(git(f.fork, "rev-parse", "feature")).toBe(f.latestHead);
  expect(git(f.repo, "rev-parse", "refs/remotes/open-warden/base/pr-7")).toBe(f.baseSha);
  expect(git(f.repo, "rev-parse", "refs/remotes/open-warden/head/pr-7")).toBe(f.headSha);

  if (!result.ok) throw new Error("Expected a prepared comparison");

  const files = await getBranchFiles(
    f.repo,
    result.value.compareBaseRef,
    result.value.compareHeadRef,
  );

  expect(files.map((file) => file.path)).toEqual(["reviewed.txt"]);
  expect(git(f.repo, "status", "--porcelain")).toBe(status);
  expect(git(f.repo, "symbolic-ref", "HEAD")).toBe("refs/heads/local");
  expect(git(f.repo, "show", ":keep.txt")).toBe("staged local changes");
  expect(await readFile(path.join(f.repo, "keep.txt"), "utf8")).toBe("unstaged local changes\n");
});

test("loads a retained PR commit after its source branch is deleted", async () => {
  const f = await fixture();

  git(f.fork, "switch", "main");
  git(f.fork, "branch", "-D", "feature");

  expect(await fetchPullRequestComparison(f.input)).toEqual({
    ok: true,
    value: { baseSha: f.baseSha, compareBaseRef: f.shared, compareHeadRef: f.headSha },
  });
});

test("compares Bitbucket's short commit snapshot after resolving both sides, despite moved branch tips", async () => {
  const f = await fixture();
  const headPrefix = f.headSha.slice(0, 12);
  const basePrefix = f.baseSha.slice(0, 12);
  const requests: string[] = [];
  const resolver = new BitbucketCommitResolver(async (pathname) => {
    requests.push(pathname);
    if (pathname === `/repositories/contributor/fork/commit/${headPrefix}?fields=hash`)
      return { hash: f.headSha };
    if (pathname === `/repositories/team/upstream/commit/${basePrefix}?fields=hash`)
      return { hash: f.baseSha };
    throw new Error("Unexpected commit lookup");
  });
  const head = await resolver.resolve({
    owner: "contributor",
    repo: "fork",
    reference: headPrefix,
  });
  const base = await resolver.resolve({ owner: "team", repo: "upstream", reference: basePrefix });
  if (!head.ok || !base.ok) throw new Error("Expected canonical Bitbucket commit IDs");

  const result = await fetchPullRequestComparison({
    ...f.input,
    head: { ...f.input.head, commitSha: head.value },
    base: { ...f.input.base, commitSha: base.value },
  });

  expect(result).toEqual({
    ok: true,
    value: { baseSha: f.baseSha, compareBaseRef: f.shared, compareHeadRef: f.headSha },
  });
  expect(requests).toHaveLength(2);
  expect(git(f.fork, "rev-parse", "feature")).toBe(f.latestHead);
  expect(git(f.upstream, "rev-parse", "main")).toBe(f.latestBase);
});

test("a later refresh can replace tracking refs without changing the earlier comparison", async () => {
  const f = await fixture();
  const first = await fetchPullRequestComparison(f.input);
  const second = await fetchPullRequestComparison({
    ...f.input,
    base: { ...f.input.base, commitSha: f.latestBase },
    head: { ...f.input.head, commitSha: f.latestHead },
  });

  expect(first).toEqual({
    ok: true,
    value: { baseSha: f.baseSha, compareBaseRef: f.shared, compareHeadRef: f.headSha },
  });
  expect(second).toEqual({
    ok: true,
    value: { baseSha: f.latestBase, compareBaseRef: f.shared, compareHeadRef: f.latestHead },
  });

  if (!first.ok || !second.ok) throw new Error("Expected both comparisons to load");

  expect(
    (await getBranchFiles(f.repo, first.value.compareBaseRef, first.value.compareHeadRef)).map(
      (file) => file.path,
    ),
  ).toEqual(["reviewed.txt"]);
  expect(
    (await getBranchFiles(f.repo, second.value.compareBaseRef, second.value.compareHeadRef)).map(
      (file) => file.path,
    ),
  ).toEqual(["force-pushed.txt"]);
});

test("fails when the requested commit is unavailable instead of comparing the current branch", async () => {
  const f = await fixture();
  const result = await fetchPullRequestComparison({
    ...f.input,
    head: { ...f.input.head, commitSha: "0".repeat(40) },
  });

  expect(result).toMatchObject({
    ok: false,
    error: { operation: "preparePullRequestCompareRefs" },
  });
  expect(git(f.repo, "for-each-ref", "refs/remotes/open-warden/head")).toBe("");
  expect(git(f.repo, "symbolic-ref", "HEAD")).toBe("refs/heads/local");
});

test.each(["", "main", "abc123", "--upload-pack=unexpected"])(
  "rejects an invalid provider commit ID before fetching: %j",
  async (commitSha) => {
    const f = await fixture();
    const result = await fetchPullRequestComparison({
      ...f.input,
      base: { ...f.input.base, commitSha },
    });

    expect(result).toMatchObject({ ok: false, error: { code: "unavailable" } });
    expect(git(f.repo, "for-each-ref", "refs/remotes/open-warden")).toBe("");
  },
);
