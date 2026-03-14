import { execFile as nodeExecFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import type {
  Bucket,
  DiscardFileInput,
  FileItem,
  FileStatus,
  FileVersions,
  GitSnapshot,
  HistoryCommit,
} from "../src/platform/desktop/contracts";

const execFile = promisify(nodeExecFile);
const textDecoder = new TextDecoder("utf-8", { fatal: true });
const MAX_BUFFER = 32 * 1024 * 1024;
const GIT_TIMEOUT_MS = 30_000;

class GitCommandError extends Error {
  constructor(
    readonly args: string[],
    readonly stderr: string,
    readonly code: number | null,
  ) {
    super(stderr || `git ${args.join(" ")} failed`);
    this.name = "GitCommandError";
  }
}

function ensureRepoPath(repoPath: string) {
  if (!repoPath.trim()) {
    throw new Error("repository path is empty");
  }
}

function validateRepoRelativePath(relPath: string) {
  if (!relPath.trim()) {
    throw new Error("path is empty");
  }

  if (path.isAbsolute(relPath) || /^[a-zA-Z]:[\\/]/.test(relPath)) {
    throw new Error("path must be repository-relative");
  }

  const parts = relPath.split(/[\\/]+/);
  if (parts.includes("..")) {
    throw new Error("path cannot contain '..'");
  }
}

function normalizeGitPath(relPath: string) {
  validateRepoRelativePath(relPath);
  return relPath.replace(/\\/g, "/");
}

function decodeUtf8(buffer: Buffer, label: string) {
  if (buffer.includes(0)) {
    throw new Error(`binary file is not supported: ${label}`);
  }

  try {
    return textDecoder.decode(buffer);
  } catch {
    throw new Error(`binary file is not supported: ${label}`);
  }
}

async function runGit(
  repoPath: string,
  args: string[],
  options?: { allowFailure?: boolean },
): Promise<Buffer> {
  ensureRepoPath(repoPath);

  try {
    const { stdout } = await execFile("git", args, {
      cwd: repoPath,
      encoding: "buffer",
      maxBuffer: MAX_BUFFER,
      timeout: GIT_TIMEOUT_MS,
      killSignal: "SIGKILL",
    });

    return Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout);
  } catch (error) {
    if (!(error instanceof Error)) {
      throw error;
    }

    const rawCode = "code" in error ? error.code : null;
    if (rawCode === "ENOENT") {
      throw new GitCommandError(args, "git is not installed or not available in PATH", null);
    }

    if ("killed" in error && error.killed) {
      throw new GitCommandError(args, `git command timed out after ${GIT_TIMEOUT_MS}ms`, null);
    }

    const stderr = "stderr" in error ? String(error.stderr ?? "").trim() : error.message;
    const code = typeof rawCode === "number" ? rawCode : null;
    const commandError = new GitCommandError(args, stderr, code);

    if (options?.allowFailure) {
      throw commandError;
    }

    throw commandError;
  }
}

function splitNullTerminated(buffer: Buffer) {
  return buffer.toString("utf8").split("\0").filter(Boolean);
}

function parseBranchHeader(header: string) {
  const value = header.slice(3);

  if (value.startsWith("No commits yet on ")) {
    return value.slice("No commits yet on ".length);
  }

  const branch = value.split("...")[0]?.trim();
  if (!branch || branch === "HEAD" || branch.startsWith("HEAD ")) {
    return "HEAD";
  }

  return branch;
}

function mapStatusCode(code: string) {
  if (
    code.includes("U") ||
    code === "AA" ||
    code === "DD" ||
    code === "AU" ||
    code === "UA" ||
    code === "DU" ||
    code === "UD"
  ) {
    return "unmerged";
  }

  if (code === "??") return "untracked";
  if (code.includes("A")) return "added";
  if (code.includes("D")) return "deleted";
  if (code.includes("R")) return "renamed";
  if (code.includes("C")) return "copied";
  if (code.includes("T")) return "type-changed";

  return "modified";
}

function makeFileItem(
  pathname: string,
  status: FileStatus,
  previousPath?: string | null,
): FileItem {
  return {
    path: pathname,
    previousPath: previousPath ?? null,
    status,
  };
}

function sortFiles(files: FileItem[]) {
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

function parseStatusOutput(
  output: Buffer,
): Pick<GitSnapshot, "branch" | "staged" | "unstaged" | "untracked"> {
  const entries = splitNullTerminated(output);
  let branch = "HEAD";

  if (entries[0]?.startsWith("## ")) {
    branch = parseBranchHeader(entries.shift()!);
  }

  const staged: FileItem[] = [];
  const unstaged: FileItem[] = [];
  const untracked: FileItem[] = [];

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const x = entry[0] ?? " ";
    const y = entry[1] ?? " ";
    const xy = `${x}${y}`;
    const status = mapStatusCode(xy);
    const pathname = entry.slice(3);

    if (!pathname) continue;

    if (xy === "??") {
      untracked.push(makeFileItem(pathname, "untracked"));
      continue;
    }

    if (x === "R" || x === "C" || y === "R" || y === "C") {
      index += 1;
    }

    if (x !== " ") {
      staged.push(makeFileItem(pathname, status));
    }

    if (y !== " ") {
      unstaged.push(makeFileItem(pathname, status));
    }
  }

  return {
    branch,
    staged: sortFiles(staged),
    unstaged: sortFiles(unstaged),
    untracked: sortFiles(untracked),
  };
}

function mapDiffStatus(code: string): FileStatus {
  const normalized = code[0] ?? "M";

  switch (normalized) {
    case "A":
      return "added";
    case "D":
      return "deleted";
    case "R":
      return "renamed";
    case "C":
      return "copied";
    case "T":
      return "type-changed";
    case "U":
      return "unmerged";
    default:
      return "modified";
  }
}

function parseNameStatusOutput(output: Buffer) {
  const entries = splitNullTerminated(output);
  const files: FileItem[] = [];

  for (let index = 0; index < entries.length; ) {
    const statusToken = entries[index++];
    if (!statusToken) continue;

    const status = mapDiffStatus(statusToken);

    if (statusToken.startsWith("R") || statusToken.startsWith("C")) {
      const previousPath = entries[index++] ?? "";
      const pathname = entries[index++] ?? "";
      if (!pathname) continue;
      files.push(makeFileItem(pathname, status, previousPath || null));
      continue;
    }

    const pathname = entries[index++] ?? "";
    if (!pathname) continue;
    files.push(makeFileItem(pathname, status));
  }

  return sortFiles(files);
}

async function resolveRepoRoot(repoPath: string) {
  const output = await runGit(repoPath, ["rev-parse", "--show-toplevel"]);
  return decodeUtf8(output, "repository root").trim();
}

function parseHistoryOutput(output: Buffer) {
  const entries = splitNullTerminated(output);
  const commits: HistoryCommit[] = [];

  for (let index = 0; index + 4 < entries.length; index += 5) {
    commits.push({
      commitId: entries[index] ?? "",
      shortId: entries[index + 1] ?? "",
      summary: entries[index + 2] ?? "",
      author: entries[index + 3] ?? "Unknown",
      relativeTime: entries[index + 4] ?? "",
    });
  }

  return commits;
}

function isMissingGitObjectError(error: unknown) {
  if (!(error instanceof GitCommandError)) return false;

  return (
    error.stderr.includes("does not exist in") ||
    error.stderr.includes("exists on disk, but not in") ||
    error.stderr.includes("neither on disk nor in the index") ||
    error.stderr.includes("invalid object name") ||
    error.stderr.includes("bad revision") ||
    error.stderr.includes("not in the index")
  );
}

async function readGitObject(
  repoPath: string,
  spec: string,
  label: string,
): Promise<{ name: string; contents: string } | null> {
  try {
    const output = await runGit(repoPath, ["show", "--no-ext-diff", "--no-textconv", spec], {
      allowFailure: true,
    });

    return {
      name: label,
      contents: decodeUtf8(output, label),
    };
  } catch (error) {
    if (isMissingGitObjectError(error)) {
      return null;
    }

    throw error;
  }
}

async function readWorktreeFile(repoPath: string, relPath: string, label: string) {
  const fullPath = path.join(repoPath, relPath);

  try {
    const stats = await fs.stat(fullPath);
    if (!stats.isFile()) return null;
  } catch {
    return null;
  }

  const contents = await fs.readFile(fullPath);
  return {
    name: label,
    contents: decodeUtf8(contents, label),
  };
}

async function hasHeadCommit(repoPath: string) {
  try {
    await runGit(repoPath, ["rev-parse", "--verify", "HEAD"], { allowFailure: true });
    return true;
  } catch {
    return false;
  }
}

async function removeWorktreePath(repoPath: string, relPath: string) {
  const fullPath = path.join(repoPath, relPath);
  await fs.rm(fullPath, { force: true, recursive: true });
}

async function readCommitParent(repoPath: string, commitId: string) {
  const output = await runGit(repoPath, ["show", "-s", "--format=%P", commitId]);
  const parents = decodeUtf8(output, "commit parents").trim().split(/\s+/).filter(Boolean);

  return parents[0] ?? null;
}

export async function getGitSnapshot(repoPath: string): Promise<GitSnapshot> {
  const [repoRoot, statusOutput] = await Promise.all([
    resolveRepoRoot(repoPath),
    runGit(repoPath, ["status", "--porcelain=v1", "-z", "-b"]),
  ]);
  const parsed = parseStatusOutput(statusOutput);

  return {
    repoRoot,
    branch: parsed.branch,
    unstaged: parsed.unstaged,
    staged: parsed.staged,
    untracked: parsed.untracked,
  };
}

export async function getCommitHistory(repoPath: string, limit = 200): Promise<HistoryCommit[]> {
  const normalizedLimit = limit > 0 ? String(limit) : "1";
  const output = await runGit(repoPath, [
    "log",
    "-z",
    "--format=%H%x00%h%x00%s%x00%an%x00%ar%x00",
    "-n",
    normalizedLimit,
  ]);

  return parseHistoryOutput(output);
}

export async function getBranches(repoPath: string): Promise<string[]> {
  const output = await runGit(repoPath, [
    "for-each-ref",
    "--format=%(refname:short)",
    "refs/heads",
    "refs/remotes",
  ]);
  const branches = decodeUtf8(output, "branches")
    .split("\n")
    .map((branch) => branch.trim())
    .filter(Boolean)
    .filter((branch) => !branch.endsWith("/HEAD"));

  return [...new Set(branches)].sort((a, b) => a.localeCompare(b));
}

export async function getBranchFiles(
  repoPath: string,
  baseRef: string,
  headRef: string,
): Promise<FileItem[]> {
  const output = await runGit(repoPath, [
    "diff",
    "--name-status",
    "-z",
    "--find-renames",
    "--find-copies",
    baseRef,
    headRef,
  ]);

  return parseNameStatusOutput(output);
}

export async function getCommitFiles(repoPath: string, commitId: string): Promise<FileItem[]> {
  const output = await runGit(repoPath, [
    "diff-tree",
    "--root",
    "--no-commit-id",
    "-r",
    "--name-status",
    "-z",
    "--find-renames",
    "--find-copies",
    commitId,
  ]);

  return parseNameStatusOutput(output);
}

export async function getCommitFileVersions(
  repoPath: string,
  commitId: string,
  relPath: string,
  previousPath?: string,
): Promise<FileVersions> {
  const normalizedPath = normalizeGitPath(relPath);
  const previousLookupPath = normalizeGitPath(previousPath ?? relPath);
  const parent = await readCommitParent(repoPath, commitId);

  const [oldFile, newFile] = await Promise.all([
    parent ? readGitObject(repoPath, `${parent}:${previousLookupPath}`, previousLookupPath) : null,
    readGitObject(repoPath, `${commitId}:${normalizedPath}`, normalizedPath),
  ]);

  return { oldFile, newFile };
}

export async function getFileVersions(
  repoPath: string,
  relPath: string,
  bucket: Bucket,
): Promise<FileVersions> {
  const normalizedPath = normalizeGitPath(relPath);

  if (bucket === "unstaged") {
    const [oldFile, newFile] = await Promise.all([
      readGitObject(repoPath, `:${normalizedPath}`, normalizedPath),
      readWorktreeFile(repoPath, normalizedPath, normalizedPath),
    ]);

    return { oldFile, newFile };
  }

  if (bucket === "staged") {
    const [oldFile, newFile] = await Promise.all([
      readGitObject(repoPath, `HEAD:${normalizedPath}`, normalizedPath),
      readGitObject(repoPath, `:${normalizedPath}`, normalizedPath),
    ]);

    return { oldFile, newFile };
  }

  return {
    oldFile: null,
    newFile: await readWorktreeFile(repoPath, normalizedPath, normalizedPath),
  };
}

export async function getBranchFileVersions(
  repoPath: string,
  baseRef: string,
  headRef: string,
  relPath: string,
  previousPath?: string,
): Promise<FileVersions> {
  const normalizedPath = normalizeGitPath(relPath);
  const previousLookupPath = normalizeGitPath(previousPath ?? relPath);

  const [oldFile, newFile] = await Promise.all([
    readGitObject(repoPath, `${baseRef}:${previousLookupPath}`, previousLookupPath),
    readGitObject(repoPath, `${headRef}:${normalizedPath}`, normalizedPath),
  ]);

  return { oldFile, newFile };
}

export async function stageFile(repoPath: string, relPath: string) {
  await runGit(repoPath, ["add", "--", normalizeGitPath(relPath)]);
}

export async function unstageFile(repoPath: string, relPath: string) {
  await runGit(repoPath, ["reset", "--", normalizeGitPath(relPath)]);
}

export async function stageAll(repoPath: string) {
  await runGit(repoPath, ["add", "-A", "--", "."]);
}

export async function unstageAll(repoPath: string) {
  await runGit(repoPath, ["reset"]);
}

export async function discardFile(repoPath: string, relPath: string, bucket: Bucket) {
  const normalizedPath = normalizeGitPath(relPath);

  if (bucket === "untracked") {
    await removeWorktreePath(repoPath, normalizedPath);
    return;
  }

  if (bucket === "unstaged") {
    await runGit(repoPath, ["restore", "--worktree", "--", normalizedPath]);
    return;
  }

  if (await hasHeadCommit(repoPath)) {
    await runGit(repoPath, [
      "restore",
      "--source=HEAD",
      "--staged",
      "--worktree",
      "--",
      normalizedPath,
    ]);
    return;
  }

  await runGit(repoPath, ["rm", "--cached", "-f", "--", normalizedPath]);
  await removeWorktreePath(repoPath, normalizedPath);
}

export async function discardFiles(repoPath: string, files: DiscardFileInput[]) {
  for (const file of files) {
    await discardFile(repoPath, file.relPath, file.bucket);
  }
}

export async function discardAll(repoPath: string) {
  if (await hasHeadCommit(repoPath)) {
    await runGit(repoPath, ["reset", "--hard", "HEAD"]);
  }

  await runGit(repoPath, ["clean", "-fd", "--", "."]);
}

export async function commitStaged(repoPath: string, message: string) {
  if (!message.trim()) {
    throw new Error("commit message is empty");
  }

  await runGit(repoPath, ["commit", "-m", message]);
  const output = await runGit(repoPath, ["rev-parse", "HEAD"]);
  return decodeUtf8(output, "commit id").trim();
}
