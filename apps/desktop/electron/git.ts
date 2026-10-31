import { execFile as nodeExecFile } from "node:child_process";
import { constants, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { gitFileModeSchema, type GitFileMode } from "../src/platform/desktop/fileContent";
import { gitObjectIdSchema } from "../src/platform/desktop/gitObjectId";
import {
  IMAGE_PREVIEW_MAX_BYTES,
  imageSourceSchema,
  type ImageSource,
  type ImagePreviewData,
} from "../src/platform/desktop/imagePreview";
import { readImageFile, imageDigest } from "./imageContent";

import type {
  Bucket,
  DiscardFileInput,
  FileItem,
  FileStatus,
  FileVersions,
  FileContent,
  GitSnapshot,
  HistoryCommit,
  CommitDetails,
  RepoFileItem,
  RepositoryEntryPathInput,
  RepositoryEntry,
  GitBlameResult,
} from "../src/platform/desktop/contracts";

import { classifyDesktopFailure, DesktopAdapterError } from "./desktop-failure";
import {
  desktopFailure,
  desktopSuccess,
  type DesktopResult,
} from "../src/platform/desktop/failure";

export async function getGitBlame(
  repoPath: string,
  relPath: string,
  revision?: string | null,
): Promise<GitBlameResult> {
  const safePath = normalizeGitPath(relPath);
  if (revision && (revision.startsWith("-") || revision.includes("\0") || revision.includes("\n")))
    throw new Error("Invalid blame revision.");
  const output = decodeUtf8(
    await runGit(repoPath, [
      "blame",
      "--line-porcelain",
      ...(revision ? [revision] : []),
      "--",
      safePath,
    ]),
    safePath,
  );
  const lines: GitBlameResult["lines"] = [];
  let commitId = "";
  let line = 0;
  let author = "";
  let authoredAt: string | null = null;
  let summary = "";
  let totalLines = 0;
  for (const record of output.split("\n")) {
    const header = /^([a-f0-9^]{40,65}) \d+ (\d+)(?: \d+)?$/.exec(record);
    if (header) {
      commitId = header[1]!.replace(/^\^/, "");
      line = Number(header[2]);
      author = "";
      authoredAt = null;
      summary = "";
    } else if (record.startsWith("author ")) author = record.slice(7);
    else if (record.startsWith("author-time ")) {
      const seconds = Number(record.slice(12));
      authoredAt =
        Number.isFinite(seconds) && Math.abs(seconds) <= 8.64e9
          ? new Date(seconds * 1000).toISOString()
          : null;
    } else if (record.startsWith("summary ")) summary = record.slice(8);
    else if (record.startsWith("\t") && commitId) {
      totalLines += 1;
      if (lines.length < 5000) lines.push({ line, commitId, author, authoredAt, summary });
    }
  }
  return { lines, truncated: totalLines > lines.length };
}

const execFile = promisify(nodeExecFile);
const textDecoder = new TextDecoder("utf-8", { fatal: true });
const MAX_BUFFER = 32 * 1024 * 1024;
const GIT_TIMEOUT_MS = 30_000;
const GIT_WRITE_RETRY_COUNT = 3;
const GIT_WRITE_RETRY_DELAY_MS = 120;

class GitCommandError extends Error {
  constructor(
    readonly args: string[],
    readonly stderr: string,
    readonly code: number | string | null,
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

function readFileContent(buffer: Buffer, name: string): FileContent {
  if (!buffer.includes(0)) {
    try {
      return { name, contents: textDecoder.decode(buffer) };
    } catch {
      // Non-UTF-8 bytes need the same read-only state as other binary content.
    }
  }

  return { kind: "binary", name, byteLength: buffer.length };
}

async function runGit(
  repoPath: string,
  args: string[],
  options?: { allowFailure?: boolean },
): Promise<Buffer> {
  ensureRepoPath(repoPath);

  try {
    const { stdout } = await execFile("git", ["--no-optional-locks", ...args], {
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
      const repositoryExists = await fs.stat(repoPath).then(
        (entry) => entry.isDirectory(),
        () => false,
      );
      throw new GitCommandError(
        args,
        repositoryExists
          ? "git is not installed or not available in PATH"
          : "repository is no longer available",
        repositoryExists ? "UNAVAILABLE" : "ENOENT",
      );
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

function isGitLockError(error: unknown) {
  if (!(error instanceof GitCommandError)) return false;

  const stderr = error.stderr.toLowerCase();
  return (
    stderr.includes("index.lock") ||
    stderr.includes("another git process seems to be running") ||
    stderr.includes("could not lock")
  );
}

async function wait(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function runGitWrite(repoPath: string, args: string[]) {
  let attempt = 0;

  while (true) {
    try {
      await runGit(repoPath, args);
      return;
    } catch (error) {
      const canRetry = isGitLockError(error) && attempt + 1 < GIT_WRITE_RETRY_COUNT;
      if (!canRetry) throw error;
      attempt += 1;
      await wait(GIT_WRITE_RETRY_DELAY_MS * attempt);
    }
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
  return files.toSorted((a, b) => a.path.localeCompare(b.path));
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
    const unmerged = mapStatusCode(xy) === "unmerged";
    const pathname = entry.slice(3);

    if (!pathname) continue;

    if (xy === "??") {
      untracked.push(makeFileItem(pathname, "untracked"));
      continue;
    }

    const stagedRename = x === "R" || x === "C";
    const unstagedRename = y === "R" || y === "C";
    const previousPath = stagedRename || unstagedRename ? (entries[++index] ?? null) : null;

    if (x !== " ") {
      staged.push(
        makeFileItem(
          pathname,
          unmerged ? "unmerged" : mapStatusCode(x),
          stagedRename ? previousPath : null,
        ),
      );
    }

    if (y !== " ") {
      unstaged.push(
        makeFileItem(
          pathname,
          unmerged ? "unmerged" : mapStatusCode(y),
          unstagedRename ? previousPath : null,
        ),
      );
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

function parseRepoFilesOutput(output: Buffer): RepoFileItem[] {
  const paths = splitNullTerminated(output).filter((entry) => entry.length > 0);

  return [...new Set(paths)]
    .toSorted((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))
    .map((path) => ({ path }));
}

function isMissingGitObjectError(error: unknown) {
  if (!(error instanceof GitCommandError)) return false;

  return (
    error.stderr.includes("does not exist in") ||
    error.stderr.includes("exists on disk, but not in") ||
    error.stderr.includes("neither on disk nor in the index") ||
    error.stderr.includes("invalid object name") ||
    error.stderr.toLowerCase().includes("not a valid object name") ||
    error.stderr.includes("bad revision") ||
    error.stderr.includes("not in the index")
  );
}

type FileRead = Readonly<{ file: FileContent; mode: GitFileMode } | { file: null; mode: null }>;

const missingFile: FileRead = { file: null, mode: null };
const storedEntrySchema = z.strictObject({
  mode: gitFileModeSchema,
  objectId: gitObjectIdSchema,
  byteLength: z.number().int().nonnegative().nullable(),
});

async function readStoredFile(
  repoPath: string,
  revision: string | null,
  relPath: string,
): Promise<FileRead> {
  try {
    const args =
      revision === null
        ? ["--literal-pathspecs", "ls-files", "--stage", "--full-name", "-z", "--", relPath]
        : ["--literal-pathspecs", "ls-tree", "--full-tree", "-l", "-z", revision, "--", relPath];
    const records = splitNullTerminated(await runGit(repoPath, args));
    let entry: z.infer<typeof storedEntrySchema> | null = null;

    for (const record of records) {
      const separator = record.indexOf("\t");
      if (separator < 0 || record.slice(separator + 1) !== relPath) continue;

      const fields = record
        .slice(0, separator)
        .split(" ")
        .filter((field) => field !== "");
      if (fields[0] === "040000") return missingFile;
      if (revision === null && fields[2] !== "0") continue;

      entry = storedEntrySchema.parse({
        mode: fields[0],
        objectId: revision === null ? fields[1] : fields[2],
        byteLength: revision === null || fields[3] === "-" ? null : Number(fields[3]),
      });
      break;
    }

    if (!entry) return missingFile;

    if (entry.mode === "160000") {
      return {
        mode: entry.mode,
        file: { kind: "submodule", name: relPath, commitId: entry.objectId },
      };
    }

    let byteLength = entry.byteLength;

    if (byteLength === null) {
      const sizeOutput = await runGit(repoPath, ["cat-file", "-s", entry.objectId]);
      byteLength = z.coerce.number().int().nonnegative().parse(sizeOutput.toString("utf8").trim());
    }

    if (byteLength > MAX_BUFFER) {
      return { mode: entry.mode, file: { kind: "too-large", name: relPath, byteLength } };
    }

    const output = await runGit(repoPath, ["cat-file", "blob", entry.objectId]);
    const file: FileContent =
      entry.mode === "120000"
        ? { kind: "symlink", name: relPath, target: output.toString("utf8") }
        : (readImageFile(output, relPath, { kind: "git", repoPath, objectId: entry.objectId }) ??
          readFileContent(output, relPath));

    return { file, mode: entry.mode };
  } catch (error) {
    if (isMissingGitObjectError(error)) {
      return missingFile;
    }

    throw error;
  }
}

async function inspectWorktreePath(repoPath: string, relPath: string) {
  const parts = relPath.split("/");

  for (let index = 1; index < parts.length; index += 1) {
    const parent = await fs.lstat(path.join(repoPath, ...parts.slice(0, index)));

    if (parent.isSymbolicLink()) {
      throw new DesktopAdapterError(
        desktopFailure(
          "getRepoFile",
          "invalid-input",
          "Open the symbolic link itself. Files below a symbolic link are not read through the repository viewer.",
        ),
      );
    }
  }

  return fs.lstat(path.join(repoPath, relPath));
}

async function readWorktreeFile(repoPath: string, relPath: string): Promise<FileRead> {
  const fullPath = path.join(repoPath, relPath);

  try {
    const stats = await inspectWorktreePath(repoPath, relPath);

    if (stats.isSymbolicLink()) {
      return {
        mode: "120000",
        file: { kind: "symlink", name: relPath, target: await fs.readlink(fullPath) },
      };
    }

    if (stats.isDirectory()) return readWorktreeSubmodule(repoPath, relPath);
    if (!stats.isFile()) return missingFile;

    const mode = stats.mode & 0o100 ? "100755" : "100644";

    if (stats.size > MAX_BUFFER) {
      return { mode, file: { kind: "too-large", name: relPath, byteLength: stats.size } };
    }

    const contents = await fs.readFile(fullPath);

    const file =
      readImageFile(contents, relPath, { kind: "worktree", repoPath, relPath }) ??
      readFileContent(contents, relPath);

    return { mode, file };
  } catch (cause) {
    if (cause instanceof Error && "code" in cause && cause.code === "ENOENT") return missingFile;
    throw cause;
  }
}

async function readWorktreeSubmodule(repoPath: string, relPath: string): Promise<FileRead> {
  const stored = await readStoredFile(repoPath, null, relPath);
  if (!stored.file || !("kind" in stored.file) || stored.file.kind !== "submodule")
    return missingFile;

  const root = path.join(repoPath, relPath);
  const initialized = await fs.lstat(path.join(root, ".git")).then(
    () => true,
    (cause: unknown) => {
      if (cause instanceof Error && "code" in cause && cause.code === "ENOENT") return false;
      throw cause;
    },
  );

  if (!initialized) {
    return { mode: "160000", file: { ...stored.file, workingTree: { state: "uninitialized" } } };
  }

  const [head, statusOutput] = await Promise.all([
    runGit(root, ["rev-parse", "--verify", "HEAD"]),
    runGit(root, [
      "status",
      "--porcelain=v1",
      "-z",
      "--untracked-files=normal",
      "--ignore-submodules=none",
    ]),
  ]);
  const status = parseStatusOutput(statusOutput);

  return {
    mode: "160000",
    file: {
      kind: "submodule",
      name: relPath,
      commitId: gitObjectIdSchema.parse(head.toString("utf8").trim()),
      workingTree: {
        state: "checked-out",
        trackedChanges: status.staged.length > 0 || status.unstaged.length > 0,
        untrackedChanges: status.untracked.length > 0,
      },
    },
  };
}

function makeFileVersions(before: FileRead, after: FileRead): FileVersions {
  const versions: FileVersions = { oldFile: before.file, newFile: after.file };

  if (before.mode && after.mode && before.mode !== after.mode) {
    return { ...versions, modeChange: { before: before.mode, after: after.mode } };
  }

  return versions;
}

let imagePreviewQueue: Promise<void> = Promise.resolve();

export async function getImagePreview(input: unknown): Promise<DesktopResult<ImagePreviewData>> {
  const parsed = imageSourceSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      error: desktopFailure("getImagePreview", "invalid-input", "The image source is invalid."),
    };
  }

  // Serialize preview reads so multiple conversation cards cannot load large blobs at once.
  const pending = imagePreviewQueue.then(() => readImagePreview(parsed.data));
  imagePreviewQueue = pending.then(
    () => undefined,
    () => undefined,
  );

  return pending;
}

async function readImagePreview(source: ImageSource): Promise<DesktopResult<ImagePreviewData>> {
  const operation = "getImagePreview";

  try {
    let bytes: Buffer;
    let name: string;

    if (source.kind === "git") {
      const size = await runGit(source.repoPath, ["cat-file", "-s", source.objectId]);
      const byteLength = z.coerce.number().int().nonnegative().parse(size.toString("utf8").trim());

      if (byteLength > IMAGE_PREVIEW_MAX_BYTES) {
        return {
          ok: false,
          error: desktopFailure(
            operation,
            "invalid-input",
            "This image exceeds the 8 MiB preview limit.",
          ),
        };
      }

      bytes = await runGit(source.repoPath, ["cat-file", "blob", source.objectId]);
      name = source.objectId;
    } else {
      name = normalizeGitPath(source.relPath);
      const stats = await inspectWorktreePath(source.repoPath, name);

      if (!stats.isFile() || stats.isSymbolicLink()) {
        return {
          ok: false,
          error: desktopFailure(
            operation,
            "conflict",
            "This entry is no longer a regular image file. Refresh its file information.",
          ),
        };
      }

      const file = await fs.open(
        path.join(source.repoPath, name),
        constants.O_RDONLY | constants.O_NOFOLLOW,
      );

      try {
        const current = await file.stat();

        if (!current.isFile() || current.size > IMAGE_PREVIEW_MAX_BYTES) {
          return {
            ok: false,
            error: desktopFailure(
              operation,
              "invalid-input",
              "This image exceeds the 8 MiB preview limit.",
            ),
          };
        }

        const buffer = Buffer.alloc(current.size + 1);
        let offset = 0;

        while (offset < buffer.length) {
          const { bytesRead } = await file.read(buffer, offset, buffer.length - offset, offset);
          if (bytesRead === 0) break;
          offset += bytesRead;
        }

        bytes = buffer.subarray(0, offset);
      } finally {
        await file.close();
      }

      if (imageDigest(bytes) !== source.digest) {
        return {
          ok: false,
          error: desktopFailure(
            operation,
            "conflict",
            "This image changed. Refresh its file information to load the current version.",
          ),
        };
      }
    }

    const image = readImageFile(bytes, name, source);

    if (!image || image.preview.state !== "available") {
      return {
        ok: false,
        error: desktopFailure(
          operation,
          "invalid-input",
          "This image is unsupported, damaged, or above the preview limits.",
        ),
      };
    }

    return desktopSuccess({
      width: image.preview.width,
      height: image.preview.height,
      mimeType: image.preview.mimeType,
      byteLength: bytes.length,
      bytes: Uint8Array.from(bytes),
    });
  } catch (cause) {
    return { ok: false, error: classifyDesktopFailure(cause, operation) };
  }
}

async function hasHeadCommit(repoPath: string) {
  try {
    await runGit(repoPath, ["rev-parse", "--verify", "HEAD"], { allowFailure: true });
    return true;
  } catch {
    return false;
  }
}

async function existsInHead(repoPath: string, relPath: string) {
  try {
    await runGit(repoPath, ["cat-file", "-e", `HEAD:${relPath}`], { allowFailure: true });
    return true;
  } catch (error) {
    if (isMissingGitObjectError(error)) {
      return false;
    }

    throw error;
  }
}

async function removeWorktreePath(repoPath: string, relPath: string) {
  const fullPath = path.join(repoPath, relPath);
  await fs.rm(fullPath, { force: true, recursive: true });
}

function hasStatusPath(files: FileItem[], relPath: string) {
  return files.some((file) => file.path === relPath);
}

async function getBucketsForPath(repoPath: string, relPath: string): Promise<Bucket[]> {
  const statusOutput = await runGit(repoPath, [
    "status",
    "--porcelain=v1",
    "-z",
    "-uall",
    "--",
    relPath,
  ]);
  const status = parseStatusOutput(statusOutput);
  const buckets: Bucket[] = [];

  if (hasStatusPath(status.staged, relPath)) buckets.push("staged");
  if (hasStatusPath(status.unstaged, relPath)) buckets.push("unstaged");
  if (hasStatusPath(status.untracked, relPath)) buckets.push("untracked");

  return buckets;
}

function isRecoverableDiscardError(error: unknown) {
  if (!(error instanceof GitCommandError)) return false;

  const stderr = error.stderr.toLowerCase();
  return (
    stderr.includes("did not match any file") ||
    stderr.includes("pathspec") ||
    stderr.includes("is unmerged") ||
    stderr.includes("needs merge")
  );
}

async function discardFileForBucket(repoPath: string, relPath: string, bucket: Bucket) {
  if (bucket === "untracked") {
    await removeWorktreePath(repoPath, relPath);
    return;
  }

  if (bucket === "unstaged") {
    await runGitWrite(repoPath, ["restore", "--worktree", "--", relPath]);
    return;
  }

  const staged = (await getGitSnapshot(repoPath)).staged.find((file) => file.path === relPath);

  if (staged?.status === "renamed" && staged.previousPath) {
    const source = path.join(repoPath, staged.previousPath);
    const existing = await fs.lstat(source).catch((cause: unknown) => {
      if (cause instanceof Error && "code" in cause && cause.code === "ENOENT") return null;

      throw cause;
    });

    if (existing) {
      throw new DesktopAdapterError(
        desktopFailure(
          "discardFile",
          "conflict",
          "The original path contains another file. Move it before discarding this rename.",
        ),
      );
    }

    await runGitWrite(repoPath, [
      "--literal-pathspecs",
      "restore",
      "--source=HEAD",
      "--staged",
      "--worktree",
      "--",
      staged.previousPath,
      relPath,
    ]);
    return;
  }

  if (await hasHeadCommit(repoPath)) {
    if (await existsInHead(repoPath, relPath)) {
      await runGitWrite(repoPath, [
        "restore",
        "--source=HEAD",
        "--staged",
        "--worktree",
        "--",
        relPath,
      ]);
      return;
    }

    await runGitWrite(repoPath, ["rm", "--cached", "-f", "--", relPath]);
    await removeWorktreePath(repoPath, relPath);
    return;
  }

  await runGitWrite(repoPath, ["rm", "--cached", "-f", "--", relPath]);
  await removeWorktreePath(repoPath, relPath);
}

const EMPTY_TREE_OBJECT = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

async function resolveDiffBaseRef(repoPath: string, baseRef: string) {
  if (!baseRef.endsWith("^")) return baseRef;

  try {
    await runGit(repoPath, ["rev-parse", "--verify", baseRef], { allowFailure: true });
    return baseRef;
  } catch {
    return EMPTY_TREE_OBJECT;
  }
}

async function readCommitParent(repoPath: string, commitId: string) {
  const output = await runGit(repoPath, ["show", "-s", "--format=%P", commitId]);
  const firstParent = decodeUtf8(output, "commit parents").trim().split(/\s+/).find(Boolean);

  return firstParent ?? null;
}

export async function getGitSnapshot(repoPath: string): Promise<GitSnapshot> {
  const [repoRoot, statusOutput] = await Promise.all([
    resolveRepoRoot(repoPath),
    runGit(repoPath, ["status", "--porcelain=v1", "--renames", "-z", "-b", "-uall"]),
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

const repositoryEntryPathSchema = z.strictObject({
  repoPath: z.string().min(1),
  path: z.string().min(1).max(4096),
});

function parseRepositoryEntryInput(
  input: unknown,
  operation: string,
): DesktopResult<{
  repoPath: string;
  path: string;
  segments: string[];
  kind: "file" | "directory";
}> {
  const parsed = repositoryEntryPathSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: desktopFailure(operation, "invalid-input", "Enter a repository-relative path."),
    };
  }

  const normalizedPath = parsed.data.path.replaceAll("\\", "/");
  const kind = normalizedPath.endsWith("/") ? "directory" : "file";
  const segments = normalizedPath.replace(/\/$/, "").split("/");
  if (
    normalizedPath.startsWith("/") ||
    /^[a-zA-Z]:/.test(normalizedPath) ||
    normalizedPath.includes("\0") ||
    /[\r\n]/.test(normalizedPath) ||
    segments.some(
      (segment) =>
        !segment.trim() || segment === "." || segment === ".." || segment.toLowerCase() === ".git",
    )
  ) {
    return {
      ok: false,
      error: desktopFailure(
        operation,
        "invalid-input",
        "Use a relative path without empty segments, . or .., or .git.",
      ),
    };
  }

  return desktopSuccess({
    repoPath: parsed.data.repoPath,
    path: segments.join("/"),
    segments,
    kind,
  });
}

export async function createRepositoryEntry(
  input: RepositoryEntryPathInput,
): Promise<DesktopResult<RepositoryEntry>> {
  const operation = "createRepositoryEntry";
  const result = parseRepositoryEntryInput(input, operation);
  if (!result.ok) return result;
  const { repoPath, segments, kind, path: relativePath } = result.value;
  try {
    await runGit(repoPath, ["rev-parse", "--show-toplevel"]);
    let parent = await fs.realpath(repoPath);
    for (const segment of segments.slice(0, -1)) {
      parent = path.join(parent, segment);
      try {
        await fs.mkdir(parent);
      } catch (cause) {
        if (!(cause instanceof Error && "code" in cause && cause.code === "EEXIST")) throw cause;
      }
      const stat = await fs.lstat(parent);
      if (stat.isSymbolicLink() || !stat.isDirectory()) {
        return {
          ok: false,
          error: desktopFailure(
            operation,
            "invalid-input",
            "A parent path must be a folder, without symbolic links.",
          ),
        };
      }
    }

    const target = path.join(parent, segments.at(-1) ?? "");
    if (kind === "directory") {
      await fs.mkdir(target);
    } else {
      const file = await fs.open(target, "wx");
      await file.close();
    }
    return desktopSuccess({ path: relativePath, kind });
  } catch (cause) {
    if (cause instanceof Error && "code" in cause && cause.code === "EEXIST") {
      return {
        ok: false,
        error: desktopFailure(
          operation,
          "conflict",
          "A file or folder already exists at this path. Choose another name.",
        ),
      };
    }
    return { ok: false, error: classifyDesktopFailure(cause, operation) };
  }
}

export async function trashRepositoryEntry(
  input: RepositoryEntryPathInput,
  moveToTrash: (absolutePath: string) => Promise<void>,
): Promise<DesktopResult<void>> {
  const operation = "trashRepositoryEntry";
  const result = parseRepositoryEntryInput(input, operation);
  if (!result.ok) return result;
  const { repoPath, segments } = result.value;
  try {
    await runGit(repoPath, ["rev-parse", "--show-toplevel"]);
    let parent = await fs.realpath(repoPath);
    for (const segment of segments.slice(0, -1)) {
      parent = path.join(parent, segment);
      const stat = await fs.lstat(parent);
      if (!stat.isDirectory() || stat.isSymbolicLink()) {
        return {
          ok: false,
          error: desktopFailure(
            operation,
            "invalid-input",
            "A parent path must be a folder, without symbolic links.",
          ),
        };
      }
    }
    const target = path.join(parent, segments.at(-1) ?? "");
    await fs.lstat(target);
    await moveToTrash(target);
    return desktopSuccess(undefined);
  } catch (cause) {
    return { ok: false, error: classifyDesktopFailure(cause, operation) };
  }
}

export async function getRepoFiles(repoPath: string): Promise<RepoFileItem[]> {
  return (await getRepoFileListing(repoPath)).files;
}

export async function getRepoFileListing(repoPath: string): Promise<{
  files: RepoFileItem[];
  ignoredPaths: string[];
}> {
  const [output, directoryOutput, ignoredOutput, deletedOutput] = await Promise.all([
    runGit(repoPath, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"]),
    runGit(repoPath, ["ls-files", "-z", "--others", "--directory", "--exclude-standard"]),
    runGit(repoPath, [
      "ls-files",
      "-z",
      "--others",
      "--ignored",
      "--directory",
      "--exclude-standard",
    ]),
    runGit(repoPath, ["ls-files", "-z", "--deleted"]),
  ]);
  const deletedPaths = new Set(parseRepoFilesOutput(deletedOutput).map((file) => file.path));
  const files = parseRepoFilesOutput(output).filter((file) => !deletedPaths.has(file.path));
  const ignoredDirectories = new Set(
    parseRepoFilesOutput(ignoredOutput)
      .filter((file) => file.path.endsWith("/"))
      .map((file) => file.path),
  );
  const directoriesWithFiles = new Set<string>();
  for (const file of files) {
    const segments = file.path.split("/");
    for (let depth = 1; depth < segments.length; depth += 1) {
      directoriesWithFiles.add(`${segments.slice(0, depth).join("/")}/`);
    }
  }

  const pending = parseRepoFilesOutput(directoryOutput)
    .filter((file) => file.path.endsWith("/"))
    .map((file) => file.path);
  const emptyDirectories: RepoFileItem[] = [];
  const directoryReadBatchSize = 16;
  while (pending.length > 0) {
    const batch = pending.splice(0, directoryReadBatchSize);
    const results = await Promise.all(
      batch.map(async (directory) => {
        let entries;
        try {
          entries = await fs.readdir(path.join(repoPath, directory), { withFileTypes: true });
        } catch (cause) {
          if (
            cause instanceof Error &&
            "code" in cause &&
            (cause.code === "ENOENT" || cause.code === "ENOTDIR")
          ) {
            return { directory, children: null };
          }
          throw cause;
        }
        const children = entries
          .filter((entry) => entry.isDirectory() && entry.name !== ".git")
          .map((entry) => `${directory}${entry.name}/`)
          .filter((child) => !ignoredDirectories.has(child));
        return { directory, children };
      }),
    );
    for (const { directory, children } of results) {
      if (!children) continue;
      pending.push(...children);
      if (children.length === 0 && !directoriesWithFiles.has(directory)) {
        emptyDirectories.push({ path: directory });
      }
    }
  }
  return {
    files: [
      ...files,
      ...emptyDirectories.toSorted((left, right) => left.path.localeCompare(right.path)),
    ],
    ignoredPaths: parseRepoFilesOutput(ignoredOutput).map((file) =>
      file.path.endsWith("/") ? file.path.slice(0, -1) : file.path,
    ),
  };
}

export { getCommitHistory, getHistoryGraph } from "./history";

const commitDetailsFields = z.tuple([
  z.string().min(1),
  z.string(),
  z.string(),
  z.string(),
  z.string(),
  z.string(),
  z.string(),
  z.string(),
  z.string(),
  z.string(),
]);

export async function getCommitDetails(repoPath: string, commitId: string): Promise<CommitDetails> {
  const output = await runGit(repoPath, [
    "show",
    "--no-patch",
    "--format=%H%x00%s%x00%b%x00%an%x00%ae%x00%aI%x00%cn%x00%ce%x00%cI%x00%P",
    "--end-of-options",
    commitId,
    "--",
  ]);
  const [
    hash,
    summary,
    body,
    author,
    authorEmail,
    authoredAt,
    committer,
    committerEmail,
    committedAt,
    parents,
  ] = commitDetailsFields.parse(output.toString("utf8").trimEnd().split("\0"));

  return {
    commitId: hash,
    summary,
    body: body.trimEnd(),
    author,
    authorEmail,
    authoredAt,
    committer,
    committerEmail,
    committedAt,
    parents: parents ? parents.split(" ") : [],
  };
}

export async function getBranchCommits(
  repoPath: string,
  baseRef: string,
  headRef: string,
): Promise<HistoryCommit[]> {
  const output = await runGit(repoPath, [
    "log",
    "-z",
    "--topo-order",
    "--format=%H%x00%h%x00%s%x00%an%x00%ar%x00",
    `${baseRef}..${headRef}`,
    "--",
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

  return [...new Set(branches)].toSorted((a, b) => a.localeCompare(b));
}

export async function getBranchFiles(
  repoPath: string,
  baseRef: string,
  headRef: string,
): Promise<FileItem[]> {
  const resolvedBaseRef = await resolveDiffBaseRef(repoPath, baseRef);
  const output = await runGit(repoPath, [
    "diff",
    "--name-status",
    "-z",
    "--find-renames",
    "--find-copies",
    resolvedBaseRef,
    headRef,
  ]);

  return parseNameStatusOutput(output);
}

export async function getCommitFiles(repoPath: string, commitId: string): Promise<FileItem[]> {
  const output = await runGit(repoPath, [
    "diff-tree",
    "--root",
    "--diff-merges=first-parent",
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

  const [before, after] = await Promise.all([
    parent ? readStoredFile(repoPath, parent, previousLookupPath) : missingFile,
    readStoredFile(repoPath, commitId, normalizedPath),
  ]);

  return makeFileVersions(before, after);
}

export async function getFileVersions(
  repoPath: string,
  relPath: string,
  bucket: Bucket,
  previousPath: string | null,
): Promise<FileVersions> {
  const normalizedPath = normalizeGitPath(relPath);
  const previousLookupPath = normalizeGitPath(previousPath ?? relPath);

  if (bucket === "unstaged") {
    const [before, after] = await Promise.all([
      readStoredFile(repoPath, null, previousLookupPath),
      readWorktreeFile(repoPath, normalizedPath),
    ]);

    const regularModeChanged =
      (before.mode === "100644" && after.mode === "100755") ||
      (before.mode === "100755" && after.mode === "100644");

    if (regularModeChanged) {
      const fileMode = await runGit(repoPath, [
        "config",
        "--type=bool",
        "--get",
        "core.filemode",
      ]).catch((cause: unknown) => {
        if (cause instanceof GitCommandError && cause.code === 1 && !cause.stderr)
          return Buffer.from("true");
        throw cause;
      });

      if (fileMode.toString("utf8").trim() === "false") {
        return makeFileVersions(before, { ...after, mode: before.mode });
      }
    }

    return makeFileVersions(before, after);
  }

  if (bucket === "staged") {
    const [before, after] = await Promise.all([
      readStoredFile(repoPath, "HEAD", previousLookupPath),
      readStoredFile(repoPath, null, normalizedPath),
    ]);

    return makeFileVersions(before, after);
  }

  return makeFileVersions(missingFile, await readWorktreeFile(repoPath, normalizedPath));
}

export async function getRepoFile({
  repoPath,
  relPath,
  revision,
}: {
  repoPath: string;
  relPath: string;
  revision?: string | null;
}) {
  const normalizedPath = normalizeGitPath(relPath);
  const normalizedRevision = revision?.trim();

  if (normalizedRevision) {
    return (await readStoredFile(repoPath, normalizedRevision, normalizedPath)).file;
  }

  return (await readWorktreeFile(repoPath, normalizedPath)).file;
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
  const resolvedBaseRef = await resolveDiffBaseRef(repoPath, baseRef);

  const [before, after] = await Promise.all([
    readStoredFile(repoPath, resolvedBaseRef, previousLookupPath),
    readStoredFile(repoPath, headRef, normalizedPath),
  ]);

  return makeFileVersions(before, after);
}

export async function stageFile(repoPath: string, relPath: string) {
  await runGitWrite(repoPath, ["--literal-pathspecs", "add", "--", normalizeGitPath(relPath)]);
}

export async function unstageFile(repoPath: string, relPath: string) {
  await unstageFiles(repoPath, [relPath]);
}

export async function stageFiles(repoPath: string, relPaths: readonly string[]) {
  const paths = parseIndexPaths(relPaths, "stageFiles");

  await writeIndexPaths(repoPath, "add", paths);
}

export async function unstageFiles(repoPath: string, relPaths: readonly string[]) {
  const selectedPaths = parseIndexPaths(relPaths, "unstageFiles");
  if (!selectedPaths.length) return;

  const snapshot = await getGitSnapshot(repoPath);
  const stagedByPath = new Map(snapshot.staged.map((file) => [file.path, file]));
  const paths = new Set<string>();

  for (const normalizedPath of selectedPaths) {
    const file = stagedByPath.get(normalizedPath);

    paths.add(normalizedPath);

    if (file?.status === "renamed" && file.previousPath) {
      paths.add(file.previousPath);
    }
  }

  await writeIndexPaths(repoPath, "reset", [...paths]);
}

const indexPathsSchema = z.array(
  z
    .string()
    .min(1)
    .refine((value) => !value.includes("\0")),
);

function parseIndexPaths(input: unknown, operation: "stageFiles" | "unstageFiles"): string[] {
  const parsed = indexPathsSchema.safeParse(input);

  if (!parsed.success) {
    throw new DesktopAdapterError(
      desktopFailure(operation, "invalid-input", "Select valid repository file paths."),
    );
  }

  return parsed.data.map(normalizeGitPath);
}

async function writeIndexPaths(
  repoPath: string,
  operation: "add" | "reset",
  paths: readonly string[],
) {
  if (!paths.length) return;

  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "warden-index-paths-"));

  try {
    const pathList = path.join(temporary, "paths");
    await fs.writeFile(pathList, paths.join("\0") + "\0");
    await runGitWrite(repoPath, [
      "--literal-pathspecs",
      operation,
      `--pathspec-from-file=${pathList}`,
      "--pathspec-file-nul",
    ]);
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
}

export { updateIndexFileContents, updateWorktreeFileContents } from "./fileEdits";

export async function stageAll(repoPath: string) {
  await runGitWrite(repoPath, ["add", "-A", "--", "."]);
}

export async function unstageAll(repoPath: string) {
  await runGitWrite(repoPath, ["reset"]);
}

export async function discardFile(repoPath: string, relPath: string, bucket: Bucket) {
  const normalizedPath = normalizeGitPath(relPath);
  const attempted = new Set<Bucket>();
  const queue: Bucket[] = [bucket];

  while (queue.length > 0) {
    const currentBucket = queue.shift();
    if (!currentBucket || attempted.has(currentBucket)) continue;
    attempted.add(currentBucket);

    try {
      await discardFileForBucket(repoPath, normalizedPath, currentBucket);
      return;
    } catch (error) {
      if (!isRecoverableDiscardError(error)) {
        throw error;
      }

      const currentBuckets = await getBucketsForPath(repoPath, normalizedPath);
      if (currentBuckets.length === 0) {
        return;
      }

      for (const nextBucket of currentBuckets) {
        if (!attempted.has(nextBucket)) {
          queue.push(nextBucket);
        }
      }

      if (queue.length === 0) {
        throw error;
      }
    }
  }
}

export async function discardFiles(repoPath: string, files: DiscardFileInput[]) {
  const failures: string[] = [];

  for (const file of files) {
    try {
      await discardFile(repoPath, file.relPath, file.bucket);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${file.relPath}: ${message}`);
    }
  }

  if (failures.length === 0) return;
  if (failures.length === 1) throw new Error(failures[0]!);
  throw new Error(`Failed to discard ${failures.length} files:\n${failures.join("\n")}`);
}

export async function discardAll(repoPath: string) {
  if (await hasHeadCommit(repoPath)) {
    await runGitWrite(repoPath, ["reset", "--hard", "HEAD"]);
  }

  await runGitWrite(repoPath, ["clean", "-fd", "--", "."]);
}

export async function commitStaged(repoPath: string, message: string) {
  if (!message.trim()) {
    throw new Error("commit message is empty");
  }

  await runGitWrite(repoPath, ["commit", "-m", message]);
  const output = await runGit(repoPath, ["rev-parse", "HEAD"]);
  return decodeUtf8(output, "commit id").trim();
}
