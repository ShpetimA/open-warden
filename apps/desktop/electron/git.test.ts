import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  symlinkSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { rename, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, test, vi } from "vitest";

import {
  commitStaged,
  createRepositoryEntry,
  getRepoFiles,
  trashRepositoryEntry,
  discardAll,
  discardFile,
  discardFiles,
  getBranches,
  getBranchCommits,
  getBranchFileVersions,
  getBranchFiles,
  getCommitFileVersions,
  getCommitFiles,
  getCommitHistory,
  getCommitDetails,
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

vi.setConfig({ testTimeout: 30_000 });

describe("electron git backend", () => {
  test("reads complete commit messages, identities, dates, and root or parent references", async () => {
    const repo = makeRepo();
    git(repo, ["commit", "--allow-empty", "-m", "Root commit"]);
    const root = git(repo, ["rev-parse", "HEAD"]);
    expect((await getCommitDetails(repo, root)).parents).toEqual([]);

    git(repo, [
      "commit",
      "--allow-empty",
      "-m",
      "Validate invoice exports",
      "-m",
      "Keep negative amounts out of generated invoices.\n\nRefs: OF-11384",
    ]);
    const head = git(repo, ["rev-parse", "HEAD"]);
    const details = await getCommitDetails(repo, head);
    expect(details).toMatchObject({
      commitId: head,
      summary: "Validate invoice exports",
      body: "Keep negative amounts out of generated invoices.\n\nRefs: OF-11384",
      author: "OpenWarden Test",
      authorEmail: "test@example.com",
      committer: "OpenWarden Test",
      committerEmail: "test@example.com",
      parents: [root],
    });
    expect(details.authoredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(details.committedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test("lists the full PR range independently of the checked out branch and compares each commit", async () => {
    const repo = makeRepo();
    writeFileSync(path.join(repo, "notes.md"), "original\n");
    git(repo, ["add", "."]);
    git(repo, ["commit", "-m", "base"]);
    const base = git(repo, ["rev-parse", "HEAD"]);

    git(repo, ["checkout", "-b", "feature"]);
    writeFileSync(path.join(repo, "notes.md"), "updated\n");
    git(repo, ["commit", "-am", "Update notes"]);
    const first = git(repo, ["rev-parse", "HEAD"]);
    git(repo, ["mv", "notes.md", "renamed.md"]);
    git(repo, ["commit", "-m", "Rename notes"]);
    const head = git(repo, ["rev-parse", "HEAD"]);
    git(repo, ["checkout", "-b", "destination", base]);
    writeFileSync(path.join(repo, "unrelated.md"), "destination only\n");
    git(repo, ["add", "."]);
    git(repo, ["commit", "-m", "Unrelated destination change"]);

    const commits = await getBranchCommits(repo, base, head);
    expect(commits.map((commit) => commit.commitId)).toEqual([head, first]);
    expect(commits.map((commit) => commit.summary)).toEqual(["Rename notes", "Update notes"]);
    expect(commits[0]?.author).toBe("OpenWarden Test");
    expect(await getBranchCommits(repo, head, head)).toEqual([]);
    expect(await getBranchFiles(repo, `${head}^`, head)).toEqual([
      { path: "renamed.md", previousPath: "notes.md", status: "renamed" },
    ]);
    const versions = await getBranchFileVersions(repo, `${head}^`, head, "renamed.md", "notes.md");
    expect(versions.oldFile?.contents).toBe("updated\n");
    expect(versions.newFile?.contents).toBe("updated\n");
  });

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
    const combinedBaseRef = `${history[1]!.commitId}^`;
    const combinedFiles = await getBranchFiles(repo, combinedBaseRef, history[0]!.commitId);
    const combinedVersions = await getBranchFileVersions(
      repo,
      combinedBaseRef,
      history[0]!.commitId,
      "notes.md",
    );
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
    expect(combinedFiles).toEqual([
      {
        path: "notes.md",
        previousPath: null,
        status: "added",
      },
    ]);
    expect(combinedVersions.oldFile).toBeNull();
    expect(combinedVersions.newFile?.contents.trim()).toEqual("v2");
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

  test("discards staged files that only exist in the index", async () => {
    const repo = makeRepo();

    writeFileSync(path.join(repo, "tracked.txt"), "one\n");
    git(repo, ["add", "tracked.txt"]);
    git(repo, ["commit", "-m", "init"]);

    writeFileSync(path.join(repo, "added.txt"), "new file\n");
    await stageFile(repo, "added.txt");

    await discardFile(repo, "added.txt", "staged");

    const snapshot = await getGitSnapshot(repo);
    expect(snapshot.staged).toEqual([]);
    expect(snapshot.unstaged).toEqual([]);
    expect(snapshot.untracked).toEqual([]);
    expect(existsSync(path.join(repo, "added.txt"))).toBe(false);
  });

  test("falls back to staged discard when an unstaged conflict path is unmerged", async () => {
    const repo = makeRepo();
    const defaultBranch = git(repo, ["branch", "--show-current"]);

    writeFileSync(path.join(repo, "tracked.txt"), "base\n");
    git(repo, ["add", "tracked.txt"]);
    git(repo, ["commit", "-m", "init"]);

    git(repo, ["checkout", "-b", "feature"]);
    writeFileSync(path.join(repo, "tracked.txt"), "feature\n");
    git(repo, ["add", "tracked.txt"]);
    git(repo, ["commit", "-m", "feature change"]);

    git(repo, ["checkout", defaultBranch]);
    writeFileSync(path.join(repo, "tracked.txt"), "main\n");
    git(repo, ["add", "tracked.txt"]);
    git(repo, ["commit", "-m", "main change"]);

    try {
      git(repo, ["merge", "feature"]);
    } catch {
      // Expected conflict.
    }

    await discardFile(repo, "tracked.txt", "unstaged");

    const snapshot = await getGitSnapshot(repo);
    expect(snapshot.staged).toEqual([]);
    expect(snapshot.unstaged).toEqual([]);
    expect(snapshot.untracked).toEqual([]);
    expect(readFileSync(path.join(repo, "tracked.txt"), "utf8")).toEqual("main\n");
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

describe("repository entry creation", () => {
  test("creates nested files and retains empty folders in the repository tree", async () => {
    const repo = makeRepo();
    expect(await createRepositoryEntry({ repoPath: repo, path: "src/nested/new.ts" })).toEqual({
      ok: true,
      value: { path: "src/nested/new.ts", kind: "file" },
    });
    expect(readFileSync(path.join(repo, "src/nested/new.ts"), "utf8")).toBe("");
    expect(await createRepositoryEntry({ repoPath: repo, path: "src/empty/deep/" })).toEqual({
      ok: true,
      value: { path: "src/empty/deep", kind: "directory" },
    });
    expect(await getRepoFiles(repo)).toEqual([
      { path: "src/nested/new.ts" },
      { path: "src/empty/deep/" },
    ]);
    expect(await getRepoFiles(repo)).toContainEqual({ path: "src/empty/deep/" });
  });

  test("preserves existing files, folders and symlinks", async () => {
    const repo = makeRepo();
    writeFileSync(path.join(repo, "keep.ts"), "keep me");
    mkdirSync(path.join(repo, "existing"));
    symlinkSync(path.join(repo, "keep.ts"), path.join(repo, "link.ts"));
    for (const entryPath of ["keep.ts", "existing/", "link.ts"]) {
      expect(await createRepositoryEntry({ repoPath: repo, path: entryPath })).toMatchObject({
        ok: false,
        error: { code: "conflict" },
      });
    }
    expect(readFileSync(path.join(repo, "keep.ts"), "utf8")).toBe("keep me");
  });

  test.each([
    "../escape.ts",
    "/tmp/escape.ts",
    "C:\\escape.ts",
    "a/../escape.ts",
    "a//file.ts",
    "./file.ts",
    ".git/config",
    "a/.GiT/config",
    "a/\0file.ts",
    "a/\nfile.ts",
    " ",
  ])("rejects unsafe path %j", async (entryPath) => {
    const repo = makeRepo();
    expect(await createRepositoryEntry({ repoPath: repo, path: entryPath })).toMatchObject({
      ok: false,
      error: { code: "invalid-input" },
    });
  });

  test("does not traverse symlink parents or enumerate ignored folders", async () => {
    const repo = makeRepo();
    const outside = makeRepo();
    symlinkSync(outside, path.join(repo, "linked"));
    expect(await createRepositoryEntry({ repoPath: repo, path: "linked/escape.ts" })).toMatchObject(
      { ok: false, error: { code: "invalid-input" } },
    );
    expect(existsSync(path.join(outside, "escape.ts"))).toBe(false);
    writeFileSync(path.join(repo, ".gitignore"), "node_modules/\n**/cache/\n");
    mkdirSync(path.join(repo, "node_modules/package/empty"), { recursive: true });
    mkdirSync(path.join(repo, "src/cache/empty"), { recursive: true });
    mkdirSync(path.join(repo, "src/visible/empty"), { recursive: true });
    expect(await getRepoFiles(repo)).toEqual([
      { path: ".gitignore" },
      { path: "linked" },
      { path: "src/visible/empty/" },
    ]);
  });
});

test("concurrent file creation chooses one result without overwriting, preserving path whitespace", async () => {
  const repo = makeRepo();
  const results = await Promise.all([
    createRepositoryEntry({ repoPath: repo, path: "src/spaced name.ts " }),
    createRepositoryEntry({ repoPath: repo, path: "src/spaced name.ts " }),
  ]);
  expect(results.filter((result) => result.ok)).toHaveLength(1);
  expect(results.filter((result) => !result.ok)).toMatchObject([
    { ok: false, error: { code: "conflict" } },
  ]);
  expect(await getRepoFiles(repo)).toEqual([{ path: "src/spaced name.ts " }]);
});

describe("repository Trash", () => {
  test("moves tracked files and folders through the Trash seam and removes them from Files", async () => {
    const repo = makeRepo();
    const trash = makeRepo();
    mkdirSync(path.join(repo, "src/nested"), { recursive: true });
    writeFileSync(path.join(repo, "src/file.ts"), "recoverable file");
    writeFileSync(path.join(repo, "src/nested/child.ts"), "recoverable child");
    git(repo, ["add", "."]);
    git(repo, ["commit", "-m", "Files to trash"]);
    const moveToTrash = async (absolute: string) => {
      await rename(absolute, path.join(trash, path.basename(absolute)));
    };
    expect(
      await trashRepositoryEntry({ repoPath: repo, path: "src/file.ts" }, moveToTrash),
    ).toEqual({ ok: true, value: undefined });
    expect(readFileSync(path.join(trash, "file.ts"), "utf8")).toBe("recoverable file");
    expect(await getRepoFiles(repo)).toEqual([{ path: "src/nested/child.ts" }]);
    expect((await getGitSnapshot(repo)).unstaged).toContainEqual({
      path: "src/file.ts",
      previousPath: null,
      status: "deleted",
    });
    expect(await trashRepositoryEntry({ repoPath: repo, path: "src/" }, moveToTrash)).toEqual({
      ok: true,
      value: undefined,
    });
    expect(readFileSync(path.join(trash, "src/nested/child.ts"), "utf8")).toBe("recoverable child");
    expect(await getRepoFiles(repo)).toEqual([]);
  });

  test("refuses repository roots, traversal, metadata and symlink parents", async () => {
    const repo = makeRepo();
    const outside = makeRepo();
    writeFileSync(path.join(outside, "keep.ts"), "keep");
    symlinkSync(outside, path.join(repo, "linked"));
    const requests: string[] = [];
    const moveToTrash = async (absolute: string) => {
      requests.push(absolute);
    };
    for (const entry of ["", ".", "/", "../", ".git", ".git/config", "linked/keep.ts"]) {
      expect(
        await trashRepositoryEntry({ repoPath: repo, path: entry }, moveToTrash),
      ).toMatchObject({ ok: false, error: { code: "invalid-input" } });
    }
    expect(requests).toEqual([]);
    expect(readFileSync(path.join(outside, "keep.ts"), "utf8")).toBe("keep");
  });

  test("trashes a symlink itself and preserves the original target", async () => {
    const repo = makeRepo();
    const trash = makeRepo();
    writeFileSync(path.join(repo, "keep.ts"), "keep");
    symlinkSync(path.join(repo, "keep.ts"), path.join(repo, "link.ts"));
    expect(
      await trashRepositoryEntry({ repoPath: repo, path: "link.ts" }, async (absolute) => {
        await rename(absolute, path.join(trash, "link.ts"));
      }),
    ).toEqual({ ok: true, value: undefined });
    expect(readFileSync(path.join(repo, "keep.ts"), "utf8")).toBe("keep");
    expect(existsSync(path.join(repo, "link.ts"))).toBe(false);
    expect(readFileSync(path.join(trash, "link.ts"), "utf8")).toBe("keep");
  });

  test("reports Trash failures without removing the source", async () => {
    const repo = makeRepo();
    writeFileSync(path.join(repo, "keep.ts"), "keep");
    const result = await trashRepositoryEntry({ repoPath: repo, path: "keep.ts" }, async () => {
      throw Object.assign(new Error("Trash unavailable"), { code: "EACCES" });
    });
    expect(result).toMatchObject({ ok: false, error: { code: "permission" } });
    expect(readFileSync(path.join(repo, "keep.ts"), "utf8")).toBe("keep");
  });
});
