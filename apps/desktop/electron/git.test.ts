import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import {
  commitStaged,
  discardAll,
  discardFile,
  discardFiles,
  getBranches,
  getBranchFileVersions,
  getBranchFiles,
  getCommitFileVersions,
  getCommitFiles,
  getCommitHistory,
  getFileVersions,
  getGitSnapshot,
  stageAll,
  stageFile,
  unstageAll,
  unstageFile,
} from "./git";

const tempDirs: string[] = [];

function makeRepo() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "open-warden-electron-"));
  tempDirs.push(dir);

  git(dir, ["init"]);
  git(dir, ["config", "user.name", "OpenWarden Test"]);
  git(dir, ["config", "user.email", "test@example.com"]);

  return dir;
}

function git(cwd: string, args: string[]) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
  }).trim();
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("electron git backend", () => {
  test("reads snapshot buckets from system git", async () => {
    const repo = makeRepo();

    writeFileSync(path.join(repo, "tracked.txt"), "v1\n");
    writeFileSync(path.join(repo, "deleted.txt"), "gone soon\n");
    git(repo, ["add", "tracked.txt"]);
    git(repo, ["add", "deleted.txt"]);
    git(repo, ["commit", "-m", "init"]);

    writeFileSync(path.join(repo, "tracked.txt"), "v2\n");
    writeFileSync(path.join(repo, "staged.txt"), "staged\n");
    writeFileSync(path.join(repo, "untracked.txt"), "untracked\n");
    unlinkSync(path.join(repo, "deleted.txt"));
    git(repo, ["add", "staged.txt"]);

    const snapshot = await getGitSnapshot(repo);

    expect(snapshot.branch).not.toEqual("");
    expect(realpathSync(snapshot.repoRoot)).toEqual(realpathSync(repo));
    expect(snapshot.unstaged).toEqual([
      {
        path: "deleted.txt",
        previousPath: null,
        status: "deleted",
      },
      {
        path: "tracked.txt",
        previousPath: null,
        status: "modified",
      },
    ]);
    expect(snapshot.staged.map((file) => file.path)).toEqual(["staged.txt"]);
    expect(snapshot.untracked.map((file) => file.path)).toEqual(["untracked.txt"]);
  });

  test("loads commit history and file versions", async () => {
    const repo = makeRepo();

    writeFileSync(path.join(repo, "notes.md"), "v1\n");
    git(repo, ["add", "notes.md"]);
    git(repo, ["commit", "-m", "add notes"]);

    writeFileSync(path.join(repo, "notes.md"), "v2\n");
    git(repo, ["add", "notes.md"]);
    git(repo, ["commit", "-m", "update notes"]);

    const history = await getCommitHistory(repo);
    const files = await getCommitFiles(repo, history[0]!.commitId);
    const rootFiles = await getCommitFiles(repo, history[1]!.commitId);
    const versions = await getCommitFileVersions(repo, history[0]!.commitId, "notes.md");

    expect(history[0]!.summary).toEqual("update notes");
    expect(files).toEqual([
      {
        path: "notes.md",
        previousPath: null,
        status: "modified",
      },
    ]);
    expect(rootFiles).toEqual([
      {
        path: "notes.md",
        previousPath: null,
        status: "added",
      },
    ]);
    expect(versions.oldFile?.contents.trim()).toEqual("v1");
    expect(versions.newFile?.contents.trim()).toEqual("v2");
  });

  test("compares branches with rename-aware and copy-aware diff metadata", async () => {
    const repo = makeRepo();
    const baseBranch = git(repo, ["branch", "--show-current"]);

    writeFileSync(path.join(repo, "file.txt"), "hello\n");
    git(repo, ["add", "file.txt"]);
    git(repo, ["commit", "-m", "init"]);

    git(repo, ["checkout", "-b", "feature"]);
    git(repo, ["mv", "file.txt", "renamed.txt"]);
    copyFileSync(path.join(repo, "renamed.txt"), path.join(repo, "copied.txt"));
    git(repo, ["add", "copied.txt"]);
    git(repo, ["commit", "-m", "rename file"]);

    const files = await getBranchFiles(repo, baseBranch, "feature");
    const renamedVersions = await getBranchFileVersions(
      repo,
      baseBranch,
      "feature",
      "renamed.txt",
      "file.txt",
    );
    const copiedVersions = await getBranchFileVersions(
      repo,
      baseBranch,
      "feature",
      "copied.txt",
      "file.txt",
    );

    expect(files).toEqual([
      {
        path: "copied.txt",
        previousPath: "file.txt",
        status: "copied",
      },
      {
        path: "renamed.txt",
        previousPath: "file.txt",
        status: "renamed",
      },
    ]);
    expect(renamedVersions.oldFile?.name).toEqual("file.txt");
    expect(renamedVersions.newFile?.name).toEqual("renamed.txt");
    expect(renamedVersions.oldFile?.contents).toEqual(renamedVersions.newFile?.contents);
    expect(copiedVersions.oldFile?.name).toEqual("file.txt");
    expect(copiedVersions.newFile?.name).toEqual("copied.txt");
    expect(copiedVersions.oldFile?.contents).toEqual(copiedVersions.newFile?.contents);
  });

  test("reports detached HEAD state and still lists branches", async () => {
    const repo = makeRepo();
    const initialBranch = git(repo, ["branch", "--show-current"]);

    writeFileSync(path.join(repo, "tracked.txt"), "v1\n");
    git(repo, ["add", "tracked.txt"]);
    git(repo, ["commit", "-m", "init"]);

    const commitId = git(repo, ["rev-parse", "HEAD"]);
    git(repo, ["checkout", commitId]);

    const snapshot = await getGitSnapshot(repo);
    const branches = await getBranches(repo);

    expect(snapshot.branch).toEqual("HEAD");
    expect(branches).toContain(initialBranch);
  });

  test("rejects binary file contents in a controlled way", async () => {
    const repo = makeRepo();

    writeFileSync(path.join(repo, "binary.bin"), Buffer.from([0x00, 0x01, 0x02]));
    git(repo, ["add", "binary.bin"]);
    git(repo, ["commit", "-m", "add binary"]);

    const history = await getCommitHistory(repo);

    await expect(getCommitFileVersions(repo, history[0]!.commitId, "binary.bin")).rejects.toThrow(
      /binary file is not supported/i,
    );
  });

  test("stages, unstages, discards, and commits without Rust", async () => {
    const repo = makeRepo();

    writeFileSync(path.join(repo, "tracked.txt"), "one\n");
    await stageAll(repo);
    const firstCommit = await commitStaged(repo, "initial commit");

    expect(firstCommit).toMatch(/^[0-9a-f]{40}$/);

    writeFileSync(path.join(repo, "tracked.txt"), "two\n");
    await stageFile(repo, "tracked.txt");
    await unstageFile(repo, "tracked.txt");

    let versions = await getFileVersions(repo, "tracked.txt", "unstaged");
    expect(versions.oldFile?.contents.trim()).toEqual("one");
    expect(versions.newFile?.contents.trim()).toEqual("two");

    await stageFile(repo, "tracked.txt");
    versions = await getFileVersions(repo, "tracked.txt", "staged");
    expect(versions.oldFile?.contents.trim()).toEqual("one");
    expect(versions.newFile?.contents.trim()).toEqual("two");

    await unstageAll(repo);
    await discardFile(repo, "tracked.txt", "unstaged");
    expect(readFileSync(path.join(repo, "tracked.txt"), "utf8")).toEqual("one\n");
  });

  test("handles deleted files, multi-file discard, and discardAll", async () => {
    const repo = makeRepo();

    writeFileSync(path.join(repo, "tracked.txt"), "one\n");
    writeFileSync(path.join(repo, "delete-me.txt"), "delete me\n");
    git(repo, ["add", "tracked.txt"]);
    git(repo, ["add", "delete-me.txt"]);
    git(repo, ["commit", "-m", "init"]);

    writeFileSync(path.join(repo, "tracked.txt"), "two\n");
    unlinkSync(path.join(repo, "delete-me.txt"));
    writeFileSync(path.join(repo, "scratch.txt"), "scratch\n");

    const versions = await getFileVersions(repo, "delete-me.txt", "unstaged");
    expect(versions.oldFile?.contents.trim()).toEqual("delete me");
    expect(versions.newFile).toBeNull();

    await stageAll(repo);

    const stagedDeletedVersions = await getFileVersions(repo, "delete-me.txt", "staged");
    expect(stagedDeletedVersions.oldFile?.contents.trim()).toEqual("delete me");
    expect(stagedDeletedVersions.newFile).toBeNull();

    await unstageAll(repo);

    await discardFiles(repo, [
      { relPath: "tracked.txt", bucket: "unstaged" },
      { relPath: "scratch.txt", bucket: "untracked" },
    ]);

    expect(readFileSync(path.join(repo, "tracked.txt"), "utf8")).toEqual("one\n");
    expect(existsSync(path.join(repo, "scratch.txt"))).toBe(false);

    writeFileSync(path.join(repo, "tracked.txt"), "three\n");
    writeFileSync(path.join(repo, "temp.txt"), "temp\n");

    await discardAll(repo);

    const snapshot = await getGitSnapshot(repo);
    expect(snapshot.staged).toEqual([]);
    expect(snapshot.unstaged).toEqual([]);
    expect(snapshot.untracked).toEqual([]);
    expect(readFileSync(path.join(repo, "tracked.txt"), "utf8")).toEqual("one\n");
    expect(readFileSync(path.join(repo, "delete-me.txt"), "utf8")).toEqual("delete me\n");
    expect(existsSync(path.join(repo, "temp.txt"))).toBe(false);
  });

  test("returns a clear error when git is unavailable", async () => {
    const repo = makeRepo();
    const previousPath = process.env.PATH;

    process.env.PATH = "";

    try {
      await expect(getBranches(repo)).rejects.toThrow(
        /git is not installed or not available in PATH/i,
      );
    } finally {
      process.env.PATH = previousPath;
    }
  });
});
