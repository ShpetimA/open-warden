// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { resolveHostedRepo } from "./repository";

const roots: string[] = [];

function git(repo: string, ...args: string[]) {
  return execFileSync("git", args, {
    cwd: repo,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

async function repository(remotes: ReadonlyArray<readonly [string, string]>) {
  const repo = await mkdtemp(path.join(os.tmpdir(), "warden-hosted-repo-"));

  roots.push(repo);
  git(repo, "init", "-q");

  for (const [name, url] of remotes) {
    git(repo, "remote", "add", name, url);
  }

  return repo;
}

beforeEach(() => {
  vi.stubEnv("GIT_CONFIG_GLOBAL", os.devNull);
  vi.stubEnv("GIT_CONFIG_NOSYSTEM", "1");
});

afterEach(async () => {
  vi.unstubAllEnvs();

  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

test.each([
  { providerId: "github", host: "github.com" },
  { providerId: "bitbucket", host: "bitbucket.org" },
])("prefers upstream over the fork on $providerId", async ({ providerId, host }) => {
  const repo = await repository([
    ["origin", `git@${host}:contributor/project.git`],
    ["upstream", `https://${host}/team/project.git`],
    ["aaa", `https://${host}/other/project.git`],
  ]);

  expect(await resolveHostedRepo(repo)).toEqual({
    providerId,
    owner: "team",
    repo: "project",
    remoteName: "upstream",
    remoteUrl: `https://${host}/team/project.git`,
    webUrl: `https://${host}/team/project`,
  });
});

test("uses origin when no supported upstream exists", async () => {
  const repo = await repository([
    ["upstream", "/local/project.git"],
    ["origin", "git@github.com:contributor/project.git"],
    ["aaa", "git@github.com:other/project.git"],
  ]);

  expect(await resolveHostedRepo(repo)).toMatchObject({
    owner: "contributor",
    remoteName: "origin",
  });
});

test("uses the fork when origin is the only remote", async () => {
  const repo = await repository([["origin", "git@bitbucket.org:contributor/project.git"]]);

  expect(await resolveHostedRepo(repo)).toMatchObject({
    providerId: "bitbucket",
    owner: "contributor",
    remoteName: "origin",
  });
});

test("falls back alphabetically to a supported remote", async () => {
  const repo = await repository([
    ["upstream", "/local/project.git"],
    ["origin", "https://unsupported.example/project.git"],
    ["zebra", "git@github.com:last/project.git"],
    ["aaa", "/another/local/project.git"],
    ["team", "git@github.com:team/project.git"],
  ]);

  expect(await resolveHostedRepo(repo)).toMatchObject({ owner: "team", remoteName: "team" });
});

test.each([
  { label: "no remotes", remotes: [] },
  { label: "only unsupported remotes", remotes: [["origin", "/local/project.git"]] },
] satisfies ReadonlyArray<{
  label: string;
  remotes: ReadonlyArray<readonly [string, string]>;
}>)("returns null with $label", async ({ remotes }) => {
  const repo = await repository(remotes);

  expect(await resolveHostedRepo(repo)).toBeNull();
});

test("rereads the target when upstream is added or removed", async () => {
  const repo = await repository([["origin", "git@github.com:contributor/project.git"]]);

  expect((await resolveHostedRepo(repo))?.remoteName).toBe("origin");

  git(repo, "remote", "add", "upstream", "git@github.com:team/project.git");

  expect((await resolveHostedRepo(repo))?.remoteName).toBe("upstream");

  git(repo, "remote", "remove", "upstream");

  expect((await resolveHostedRepo(repo))?.remoteName).toBe("origin");
});

test("keeps Git push and tracking settings separate from the hosted target", async () => {
  const repo = await repository([
    ["origin", "https://github.com/contributor/project.git"],
    ["upstream", "https://github.com/team/project.git"],
  ]);

  git(repo, "config", "branch.feature.remote", "origin");
  git(repo, "config", "branch.feature.merge", "refs/heads/feature");
  git(repo, "config", "branch.feature.pushRemote", "origin");
  git(repo, "config", "remote.pushDefault", "origin");
  git(repo, "remote", "set-url", "--push", "origin", "git@github.com:contributor/project.git");

  const before = git(repo, "config", "--local", "--list");

  expect((await resolveHostedRepo(repo))?.remoteName).toBe("upstream");
  expect(git(repo, "config", "--local", "--list")).toBe(before);
  expect(git(repo, "remote", "get-url", "--push", "origin")).toBe(
    "git@github.com:contributor/project.git",
  );
});
