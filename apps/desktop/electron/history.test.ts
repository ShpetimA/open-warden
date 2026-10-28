import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { writeFile } from "node:fs/promises";

import { getCommitHistory, getHistoryGraph } from "./history";
import { getCommitFiles, getCommitFileVersions } from "./git";

const directories: string[] = [];
async function repository() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "warden-history-"));
  directories.push(dir);
  execFileSync("git", ["init", "-b", "main"], { cwd: dir });
  return dir;
}
afterEach(async () => {
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function commit(mark: number, branch: string, subject: string, from?: number, merge?: number) {
  const who = mark % 2 ? "Alice <alice@example.com>" : "Bob <bob@example.com>";
  const lines = [
    `commit refs/heads/${branch}`,
    `mark :${mark}`,
    `author ${who} ${1700000000 + mark} +0000`,
    `committer ${who} ${1700000000 + mark} +0000`,
    `data ${Buffer.byteLength(subject)}`,
    subject,
  ];
  if (from) lines.push(`from :${from}`);
  if (merge) lines.push(`merge :${merge}`);
  return `${lines.join("\n")}\n\n`;
}

test("reads beyond 200 commits, keeps merge parents and refs, and includes other branch tips", async () => {
  const repo = await repository();
  let input = "";
  for (let i = 1; i <= 215; i++)
    input += commit(
      i,
      "main",
      i === 1 ? "Oldest searchable commit" : `Change ${i}`,
      i > 1 ? i - 1 : undefined,
    );
  input += commit(216, "feature", "Feature contribution", 100);
  input += commit(217, "main", "Merge feature", 215, 216);
  input += commit(218, "unmerged", "Work on a different branch", 90);
  input += commit(219, "internal-only", "Internal notes and stash metadata");
  execFileSync("git", ["fast-import", "--quiet"], { cwd: repo, input });
  const internal = execFileSync("git", ["rev-parse", "refs/heads/internal-only"], {
    cwd: repo,
    encoding: "utf8",
  }).trim();
  execFileSync("git", ["update-ref", "refs/notes/example", internal], { cwd: repo });
  execFileSync("git", ["update-ref", "refs/stash", internal], { cwd: repo });
  execFileSync("git", ["update-ref", "-d", "refs/heads/internal-only"], { cwd: repo });
  execFileSync("git", ["tag", "release,one", "HEAD"], { cwd: repo });
  execFileSync(
    "git",
    [
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "tag",
      "-a",
      "v1",
      "-m",
      "Release",
    ],
    { cwd: repo },
  );

  const history = await getCommitHistory(repo);
  expect(history).toHaveLength(217);
  expect(history.at(-1)?.summary).toBe("Oldest searchable commit");
  expect(await getCommitHistory(repo, 5)).toHaveLength(5);
  const graph = await getHistoryGraph(repo);
  expect(graph.commits).toHaveLength(218);
  const merge = graph.commits.find((item) => item.summary === "Merge feature");
  expect(merge?.parents).toHaveLength(2);
  expect(merge?.refs).toEqual(
    expect.arrayContaining(["HEAD", "refs/heads/main", "refs/tags/release,one", "refs/tags/v1"]),
  );
  expect(
    graph.commits.find((item) => item.summary === "Work on a different branch")?.refs,
  ).toContain("refs/heads/unmerged");
  const indices = new Map(graph.commits.map((item, index) => [item.commitId, index]));
  for (const [index, item] of graph.commits.entries()) {
    for (const parent of item.parents) expect(indices.get(parent)).toBeGreaterThan(index);
  }
  expect(graph.shallow).toBe(false);

  const shallow = path.join(await repository(), "clone");
  execFileSync("git", ["clone", "--depth=3", `file://${repo}`, shallow], { stdio: "ignore" });
  expect((await getHistoryGraph(shallow)).shallow).toBe(true);
});

test("handles unborn repositories and includes detached HEAD history", async () => {
  const repo = await repository();
  expect(await getCommitHistory(repo)).toEqual([]);
  expect(await getHistoryGraph(repo)).toEqual({ commits: [], shallow: false });
  execFileSync(
    "git",
    [
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "commit",
      "--allow-empty",
      "-m",
      "Root",
    ],
    { cwd: repo },
  );
  execFileSync("git", ["checkout", "--detach"], { cwd: repo, stdio: "ignore" });
  execFileSync(
    "git",
    [
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "commit",
      "--allow-empty",
      "-m",
      "Detached contribution",
    ],
    { cwd: repo },
  );
  expect((await getHistoryGraph(repo)).commits[0]).toMatchObject({
    summary: "Detached contribution",
    refs: ["HEAD"],
  });
});

test("opens merge changes against the same first parent used by the diff", async () => {
  const repo = await repository();
  function git(args: string[]) {
    return execFileSync(
      "git",
      ["-c", "user.name=Alice", "-c", "user.email=alice@example.com", ...args],
      { cwd: repo, encoding: "utf8" },
    ).trim();
  }
  await writeFile(path.join(repo, "base.txt"), "base\n");
  git(["add", "."]);
  git(["commit", "-m", "Root"]);
  git(["checkout", "-b", "feature"]);
  await writeFile(path.join(repo, "feature.txt"), "Feature contribution\n");
  git(["add", "."]);
  git(["commit", "-m", "Feature"]);
  git(["checkout", "main"]);
  await writeFile(path.join(repo, "main.txt"), "Main contribution\n");
  git(["add", "."]);
  git(["commit", "-m", "Main"]);
  git(["merge", "--no-ff", "feature", "-m", "Merge feature"]);
  const merge = git(["rev-parse", "HEAD"]);
  expect(await getCommitFiles(repo, merge)).toEqual([
    { path: "feature.txt", previousPath: null, status: "added" },
  ]);
  expect(await getCommitFileVersions(repo, merge, "feature.txt")).toEqual({
    oldFile: null,
    newFile: { name: "feature.txt", contents: "Feature contribution\n" },
  });
});
