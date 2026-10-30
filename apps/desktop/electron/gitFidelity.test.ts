import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, truncate, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test, vi } from "vitest";

import {
  discardFile,
  getBranchFileVersions,
  getCommitFiles,
  getCommitFileVersions,
  getFileVersions,
  getGitSnapshot,
  getRepoFile,
  stageFile,
  stageFiles,
  unstageFile,
  unstageFiles,
} from "./git";
import { updateIndexFileContents, updateWorktreeFileContents } from "./fileEdits";

const roots: string[] = [];
const originalPath = "src/original [name].txt";
const renamedPath = "src/renamed [name].txt";
const originalText = Array.from({ length: 30 }, (_, index) => `Line ${index + 1}\n`).join("");

vi.setConfig({ testTimeout: 30_000 });

function git(repo: string, ...args: string[]) {
  return execFileSync("git", args, {
    cwd: repo,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

async function repository() {
  const repo = await mkdtemp(path.join(os.tmpdir(), "warden-git-fidelity-"));
  roots.push(repo);

  git(repo, "init", "--initial-branch=main");
  git(repo, "config", "user.name", "Test");
  git(repo, "config", "user.email", "test@example.com");
  await mkdir(path.join(repo, "src"));
  await writeFile(path.join(repo, originalPath), originalText);
  git(repo, "add", ".");
  git(repo, "commit", "-m", "Base");

  return repo;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("keeps rename paths and separates staged content from later worktree edits", async () => {
  const repo = await repository();
  const stagedText = originalText.replace("Line 2\n", "Staged change\n");
  const workingText = stagedText.replace("Line 3\n", "Working change\n");

  git(repo, "mv", originalPath, renamedPath);
  await writeFile(path.join(repo, renamedPath), stagedText);
  git(repo, "--literal-pathspecs", "add", "--", renamedPath);
  await writeFile(path.join(repo, renamedPath), workingText);

  const snapshot = await getGitSnapshot(repo);

  expect(snapshot.staged).toEqual([
    { path: renamedPath, previousPath: originalPath, status: "renamed" },
  ]);
  expect(snapshot.unstaged).toEqual([
    { path: renamedPath, previousPath: null, status: "modified" },
  ]);
  expect(await getFileVersions(repo, renamedPath, "staged", originalPath)).toEqual({
    oldFile: { name: originalPath, contents: originalText },
    newFile: { name: renamedPath, contents: stagedText },
  });
  expect(await getFileVersions(repo, renamedPath, "unstaged", null)).toEqual({
    oldFile: { name: renamedPath, contents: stagedText },
    newFile: { name: renamedPath, contents: workingText },
  });
});

test("unstages the whole rename and preserves other staged files and local content", async () => {
  const repo = await repository();
  git(repo, "mv", originalPath, renamedPath);
  await writeFile(path.join(repo, "unrelated.txt"), "Keep staged\n");
  git(repo, "add", "unrelated.txt");

  await unstageFile(repo, renamedPath);

  const snapshot = await getGitSnapshot(repo);

  expect(snapshot.staged).toEqual([{ path: "unrelated.txt", previousPath: null, status: "added" }]);
  expect(snapshot.unstaged).toContainEqual({
    path: originalPath,
    previousPath: null,
    status: "deleted",
  });
  expect(snapshot.untracked).toContainEqual({
    path: renamedPath,
    previousPath: null,
    status: "untracked",
  });
  expect(await readFile(path.join(repo, renamedPath), "utf8")).toBe(originalText);
});

test("batch index operations keep rename identities and literal paths", async () => {
  const repo = await repository();
  const selected = "src/selected [one]\nfile.txt";
  const unrelated = "unrelated.txt";

  git(repo, "mv", originalPath, renamedPath);
  await writeFile(path.join(repo, selected), "Selected\n");
  await writeFile(path.join(repo, unrelated), "Keep staged\n");

  await stageFiles(repo, [selected, unrelated]);
  await stageFiles(repo, []);
  await unstageFiles(repo, [renamedPath, selected]);
  await unstageFiles(repo, []);

  const snapshot = await getGitSnapshot(repo);

  expect(snapshot.staged).toEqual([{ path: unrelated, previousPath: null, status: "added" }]);
  expect(snapshot.untracked.map((file) => file.path)).toEqual(
    expect.arrayContaining([renamedPath, selected]),
  );
  expect(snapshot.unstaged).toContainEqual({
    path: originalPath,
    previousPath: null,
    status: "deleted",
  });
  expect(await readFile(path.join(repo, renamedPath), "utf8")).toBe(originalText);
});

test("batch path parsing rejects NUL separators before changing the index", async () => {
  const repo = await repository();
  await writeFile(path.join(repo, originalPath), "Local changes\n");

  await expect(stageFiles(repo, [originalPath + "\0another.txt"])).rejects.toMatchObject({
    failure: { code: "invalid-input" },
  });
  expect((await getGitSnapshot(repo)).staged).toEqual([]);
});

test("discarding a staged rename restores the original file and removes the renamed entry", async () => {
  const repo = await repository();
  git(repo, "mv", originalPath, renamedPath);

  await discardFile(repo, renamedPath, "staged");

  expect(await readFile(path.join(repo, originalPath), "utf8")).toBe(originalText);
  await expect(readFile(path.join(repo, renamedPath))).rejects.toMatchObject({ code: "ENOENT" });
  expect(git(repo, "status", "--porcelain")).toBe("");
});

test("a rename discard does not overwrite a new file at the original path", async () => {
  const repo = await repository();
  git(repo, "mv", originalPath, renamedPath);
  await writeFile(path.join(repo, originalPath), "New independent work\n");

  await expect(discardFile(repo, renamedPath, "staged")).rejects.toMatchObject({
    failure: { code: "conflict" },
  });

  expect(await readFile(path.join(repo, originalPath), "utf8")).toBe("New independent work\n");
  expect(await readFile(path.join(repo, renamedPath), "utf8")).toBe(originalText);
  expect((await getGitSnapshot(repo)).staged[0]?.status).toBe("renamed");
});

test("unstaging content from a renamed file retains the staged rename and worktree edits", async () => {
  const repo = await repository();
  const stagedText = originalText.replace("Line 2\n", "Staged change\n");

  git(repo, "mv", originalPath, renamedPath);
  await writeFile(path.join(repo, renamedPath), stagedText);
  git(repo, "--literal-pathspecs", "add", "--", renamedPath);

  const result = await updateIndexFileContents(repo, renamedPath, originalText, {
    kind: "diff",
    bucket: "staged",
    oldContents: originalText,
    newContents: stagedText,
  });

  expect(result).toEqual({ ok: true, value: undefined });
  expect(await getFileVersions(repo, renamedPath, "staged", originalPath)).toEqual({
    oldFile: { name: originalPath, contents: originalText },
    newFile: { name: renamedPath, contents: originalText },
  });
  expect(await readFile(path.join(repo, renamedPath), "utf8")).toBe(stagedText);
  expect((await getGitSnapshot(repo)).staged[0]?.status).toBe("renamed");
});

test("returns binary states for worktree, index, history, comparisons and renames", async () => {
  const repo = await repository();
  const before = Buffer.from([0, 1, 2, 3]);
  const after = Buffer.from([0, 4, 5, 6, 7]);

  await writeFile(path.join(repo, "asset.bin"), before);
  git(repo, "add", "asset.bin");
  git(repo, "commit", "-m", "Binary base");
  const base = git(repo, "rev-parse", "HEAD");
  await writeFile(path.join(repo, "asset.bin"), after);

  const expected = {
    oldFile: { kind: "binary", name: "asset.bin", byteLength: before.length },
    newFile: { kind: "binary", name: "asset.bin", byteLength: after.length },
  };

  expect(await getFileVersions(repo, "asset.bin", "unstaged", null)).toEqual(expected);
  expect(await getRepoFile({ repoPath: repo, relPath: "asset.bin" })).toEqual(expected.newFile);

  await stageFile(repo, "asset.bin");
  expect(await getFileVersions(repo, "asset.bin", "staged", null)).toEqual(expected);
  git(repo, "commit", "-m", "Binary update");
  const head = git(repo, "rev-parse", "HEAD");

  expect(await getCommitFileVersions(repo, head, "asset.bin")).toEqual(expected);
  expect(await getBranchFileVersions(repo, base, head, "asset.bin")).toEqual(expected);

  git(repo, "mv", "asset.bin", "renamed.bin");
  git(repo, "commit", "-m", "Rename binary");
  const renamed = git(repo, "rev-parse", "HEAD");

  expect(await getCommitFiles(repo, renamed)).toContainEqual({
    path: "renamed.bin",
    previousPath: "asset.bin",
    status: "renamed",
  });
  expect(await getCommitFileVersions(repo, renamed, "renamed.bin", "asset.bin")).toEqual({
    oldFile: expected.newFile,
    newFile: { ...expected.newFile, name: "renamed.bin" },
  });
});

test("distinguishes binary content, unsupported encoding and transitions to text", async () => {
  const repo = await repository();
  await writeFile(path.join(repo, "encoding.dat"), Buffer.from([0xc3, 0x28]));

  expect(await getRepoFile({ repoPath: repo, relPath: "encoding.dat" })).toEqual({
    kind: "binary",
    name: "encoding.dat",
    byteLength: 2,
  });

  await writeFile(path.join(repo, originalPath), Buffer.from([0, 1]));
  expect(await getFileVersions(repo, originalPath, "unstaged", null)).toEqual({
    oldFile: { name: originalPath, contents: originalText },
    newFile: { kind: "binary", name: originalPath, byteLength: 2 },
  });

  await stageFile(repo, originalPath);
  await writeFile(path.join(repo, originalPath), "Now text\n");

  expect(await getFileVersions(repo, originalPath, "unstaged", null)).toEqual({
    oldFile: { kind: "binary", name: originalPath, byteLength: 2 },
    newFile: { name: originalPath, contents: "Now text\n" },
  });
});

test("returns size metadata for large worktree and Git objects without loading their contents", async () => {
  const repo = await repository();
  const byteLength = 32 * 1024 * 1024 + 1;
  const largePath = path.join(repo, "large.bin");
  await writeFile(largePath, "");
  await truncate(largePath, byteLength);

  const expected = { kind: "too-large", name: "large.bin", byteLength };

  expect(await getRepoFile({ repoPath: repo, relPath: "large.bin" })).toEqual(expected);
  await stageFile(repo, "large.bin");
  expect(await getFileVersions(repo, "large.bin", "staged", null)).toEqual({
    oldFile: null,
    newFile: expected,
  });
});

test("rejects text writes to binary files and preserves their bytes", async () => {
  const repo = await repository();
  const bytes = Buffer.from([0, 1, 2]);
  await writeFile(path.join(repo, originalPath), bytes);
  await stageFile(repo, originalPath);

  const working = await updateWorktreeFileContents(repo, originalPath, "replacement", {
    kind: "worktree",
    contents: bytes.toString("utf8"),
  });
  const index = await updateIndexFileContents(repo, originalPath, "replacement", {
    kind: "diff",
    bucket: "staged",
    oldContents: originalText,
    newContents: null,
  });

  expect(working).toMatchObject({ ok: false, error: { code: "invalid-input" } });
  expect(index).toMatchObject({ ok: false, error: { code: "invalid-input" } });
  expect(await readFile(path.join(repo, originalPath))).toEqual(bytes);
  expect(await getRepoFile({ repoPath: repo, relPath: originalPath, revision: "HEAD" })).toEqual({
    name: originalPath,
    contents: originalText,
  });
});
