// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile, readdir, realpath } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test, vi } from "vitest";

import { setupRepository } from "./repositorySetup";
import { configureRepository, getRepositoryConfiguration } from "./repositoryManagement";
import type { RepositoryConfigurationCommand } from "../src/platform/desktop/repositoryManagement";
import { subscribeRepositoryWrites } from "./repositoryWrites";

const roots: string[] = [];

vi.setConfig({ testTimeout: 30_000 });

async function root() {
  const result = await mkdtemp(path.join(os.tmpdir(), "warden-repository-management-"));

  roots.push(result);

  return result;
}

function git(cwd: string, ...args: string[]) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

async function initialized() {
  const parent = await root();
  const repo = path.join(parent, "repo");

  const result = await setupRepository({ kind: "init", destination: repo, initialBranch: "main" });

  expect(result.ok).toBe(true);

  return { parent, repo };
}

async function change(
  repo: string,
  command: Omit<
    Extract<RepositoryConfigurationCommand, { kind: "add-remote" }>,
    "expectedRevision"
  >,
) {
  const config = await getRepositoryConfiguration(repo);

  if (!config.ok) throw new Error("Expected repository configuration");

  return configureRepository(repo, { ...command, expectedRevision: config.value.revision });
}

afterEach(async () => {
  for (const folder of roots.splice(0)) await rm(folder, { recursive: true, force: true });
});

test("initializes a new or existing folder without staging or changing its files", async () => {
  const { parent, repo } = await initialized();

  expect(git(repo, "symbolic-ref", "--short", "HEAD")).toBe("main");

  const existing = path.join(parent, "existing");

  await mkdir(existing);
  await writeFile(path.join(existing, "keep.txt"), "local work\r\n");

  expect(
    (await setupRepository({ kind: "init", destination: existing, initialBranch: "trunk" })).ok,
  ).toBe(true);
  expect(await readFile(path.join(existing, "keep.txt"), "utf8")).toBe("local work\r\n");
  expect(git(existing, "status", "--porcelain")).toBe("?? keep.txt");

  const nested = path.join(repo, "nested");

  expect(
    (await setupRepository({ kind: "init", destination: nested, initialBranch: "main" })).ok,
  ).toBe(false);
  expect((await readdir(repo)).includes("nested")).toBe(false);

  expect(
    (await setupRepository({ kind: "init", destination: repo, initialBranch: "other" })).ok,
  ).toBe(false);
  expect(git(repo, "symbolic-ref", "--short", "HEAD")).toBe("main");
});

test("clones committed data and preserves existing destinations on failure", async () => {
  const { parent, repo } = await initialized();

  git(repo, "config", "user.name", "Test");
  git(repo, "config", "user.email", "test@example.com");
  await writeFile(path.join(repo, "readme.txt"), "cloned content\n");
  git(repo, "add", ".");
  git(repo, "commit", "-m", "Initial");

  const clone = path.join(parent, "clone");
  const result = await setupRepository({ kind: "clone", source: repo, destination: clone });

  expect(result).toEqual({ ok: true, value: await realpath(clone) });
  expect(await readFile(path.join(clone, "readme.txt"), "utf8")).toBe("cloned content\n");
  expect(git(clone, "config", "branch.main.remote")).toBe("origin");

  expect((await setupRepository({ kind: "clone", source: repo, destination: clone })).ok).toBe(
    false,
  );
  expect(await readFile(path.join(clone, "readme.txt"), "utf8")).toBe("cloned content\n");

  const failed = path.join(parent, "failed");

  expect(
    (
      await setupRepository({
        kind: "clone",
        source: path.join(parent, "absent"),
        destination: failed,
      })
    ).ok,
  ).toBe(false);
  expect((await readdir(parent)).includes("failed")).toBe(false);

  expect((await setupRepository({ kind: "clone", source: repo, destination: failed })).ok).toBe(
    true,
  );
});

test("rejects unsafe locations and invalid branches before changing disk", async () => {
  const parent = await root();

  for (const source of [
    "--upload-pack=bad",
    "ext::command",
    "https://user:secret@github.com/org/repo",
    "https://github.com/org/repo?token=secret",
  ]) {
    const result = await setupRepository({
      kind: "clone",
      source,
      destination: path.join(parent, "target"),
    });

    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("secret");
  }

  expect(
    (
      await setupRepository({
        kind: "init",
        destination: path.join(parent, "target"),
        initialBranch: "--bad",
      })
    ).ok,
  ).toBe(false);
  expect(await readdir(parent)).toEqual([]);

  const normalizedRoot = path.join(path.parse(parent).root, "tmp") + "/..";

  expect(
    (await setupRepository({ kind: "init", destination: normalizedRoot, initialBranch: "main" }))
      .ok,
  ).toBe(false);
});

test("serializes setup for the same destination without removing the successful repository", async () => {
  const parent = await root();
  const destination = path.join(parent, "repo");

  const results = await Promise.all([
    setupRepository({ kind: "init", destination, initialBranch: "main" }),
    setupRepository({ kind: "init", destination, initialBranch: "main" }),
  ]);

  expect(results.filter((result) => result.ok)).toHaveLength(1);
  expect(results.some((result) => !result.ok && result.error.code === "busy")).toBe(true);
  expect(git(destination, "symbolic-ref", "--short", "HEAD")).toBe("main");
});

test("adds, edits, renames and removes remotes and emits shared configuration events", async () => {
  const { repo } = await initialized();
  const notices: string[] = [];
  const dispose = subscribeRepositoryWrites((event) =>
    notices.push(`${event.operation}:${event.impact.kinds.join(",")}`),
  );

  try {
    expect(
      (
        await change(repo, {
          kind: "add-remote",
          name: "origin",
          url: "https://bitbucket.org/workspace/repo.git",
        })
      ).ok,
    ).toBe(true);

    let current = await getRepositoryConfiguration(repo);

    if (!current.ok) throw new Error("Expected configuration");

    expect(current.value.remotes[0]?.fetchUrls).toEqual([
      "https://bitbucket.org/workspace/repo.git",
    ]);

    expect(
      (
        await configureRepository(repo, {
          kind: "edit-remote",
          name: "origin",
          url: "~/warden-test-remote.git",
          expectedRevision: current.value.revision,
        })
      ).ok,
    ).toBe(true);
    expect(git(repo, "remote", "get-url", "origin")).toBe(
      path.join(os.homedir(), "warden-test-remote.git"),
    );

    current = await getRepositoryConfiguration(repo);

    if (!current.ok) throw new Error("Expected configuration");

    expect(
      (
        await configureRepository(repo, {
          kind: "rename-remote",
          name: "origin",
          newName: "upstream",
          expectedRevision: current.value.revision,
        })
      ).ok,
    ).toBe(true);

    current = await getRepositoryConfiguration(repo);

    if (!current.ok) throw new Error("Expected configuration");

    expect(current.value.remotes.map((remote) => remote.name)).toEqual(["upstream"]);

    expect(
      (
        await configureRepository(repo, {
          kind: "remove-remote",
          name: "upstream",
          expectedRevision: current.value.revision,
        })
      ).ok,
    ).toBe(true);
    expect(git(repo, "remote")).toBe("");
    expect(notices).toEqual(Array(4).fill("configureRepository:refs,config"));
  } finally {
    dispose();
  }
});

test("rejects stale configuration instead of overwriting external edits", async () => {
  const { repo } = await initialized();

  await change(repo, {
    kind: "add-remote",
    name: "origin",
    url: "https://github.com/owner/original.git",
  });

  const current = await getRepositoryConfiguration(repo);

  if (!current.ok) throw new Error("Expected configuration");

  git(repo, "remote", "set-url", "origin", "https://github.com/owner/newer.git");

  const result = await configureRepository(repo, {
    kind: "edit-remote",
    name: "origin",
    url: "https://github.com/owner/stale.git",
    expectedRevision: current.value.revision,
  });

  expect(!result.ok && result.error.code).toBe("conflict");
  expect(git(repo, "remote", "get-url", "origin")).toBe("https://github.com/owner/newer.git");
});

test("sets and clears the existing upstream without pushing, and preserves a custom push URL", async () => {
  const { parent, repo } = await initialized();

  git(repo, "config", "user.name", "Test");
  git(repo, "config", "user.email", "test@example.com");
  git(repo, "commit", "--allow-empty", "-m", "Initial");
  git(parent, "init", "--bare", "remote.git");
  git(repo, "remote", "add", "origin", path.join(parent, "remote.git"));
  git(repo, "push", "origin", "main");

  let config = await getRepositoryConfiguration(repo);

  if (!config.ok) throw new Error("Expected configuration");

  expect(config.value.remoteBranches).toContain("origin/main");

  expect(
    (
      await configureRepository(repo, {
        kind: "set-upstream",
        branch: "main",
        upstream: "origin/main",
        expectedRevision: config.value.revision,
      })
    ).ok,
  ).toBe(true);
  expect(git(repo, "rev-parse", "--abbrev-ref", "@{upstream}")).toBe("origin/main");

  config = await getRepositoryConfiguration(repo);

  if (!config.ok) throw new Error("Expected configuration");

  expect(
    (
      await configureRepository(repo, {
        kind: "edit-push-url",
        name: "origin",
        url: "git@github.com:owner/repo.git",
        expectedRevision: config.value.revision,
      })
    ).ok,
  ).toBe(true);

  config = await getRepositoryConfiguration(repo);

  if (!config.ok) throw new Error("Expected configuration");

  expect(
    (
      await configureRepository(repo, {
        kind: "set-upstream",
        branch: "main",
        upstream: null,
        expectedRevision: config.value.revision,
      })
    ).ok,
  ).toBe(true);

  config = await getRepositoryConfiguration(repo);

  if (!config.ok) throw new Error("Expected configuration");

  expect(config.value.upstream).toBeNull();
  expect(config.value.remotes[0]?.pushUrls).toEqual(["git@github.com:owner/repo.git"]);
});

test("redacts embedded credentials in existing remote configuration", async () => {
  const { repo } = await initialized();

  git(repo, "remote", "add", "origin", "https://username:secret@github.com/org/repo.git");

  const result = await getRepositoryConfiguration(repo);

  expect(result.ok).toBe(true);
  expect(JSON.stringify(result)).not.toContain("secret");
  expect(JSON.stringify(result)).not.toContain("username");
});
