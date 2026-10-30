import { execFile } from "node:child_process";
import type { Stats } from "node:fs";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import {
  diffEditExpectationSchema,
  fileEditExpectationSchema,
} from "../src/platform/desktop/fileEdits";
import {
  desktopFailure,
  desktopSuccess,
  type DesktopResult,
} from "../src/platform/desktop/failure";
import { getFileVersions } from "./git";
import {
  repositoryWriteEvents,
  worktreeFileWriteEvent,
  repositoryTemporaryFileName,
} from "./repositoryChangeDefinitions";
import { coordinateRepositoryWrite } from "./repositoryWrites";

const execute = promisify(execFile);
const decoder = new TextDecoder("utf-8", { fatal: true });
const byteOrderMark = Buffer.from([0xef, 0xbb, 0xbf]);
const editSchema = z.strictObject({
  repoPath: z.string().min(1),
  relPath: z
    .string()
    .min(1)
    .refine((value) => {
      const parts = value.split("/");
      return (
        !path.isAbsolute(value) &&
        !value.includes("\\") &&
        !value.includes("\0") &&
        !/^[a-zA-Z]:/.test(value) &&
        parts.every(
          (part) => part && part !== "." && part !== ".." && part.toLowerCase() !== ".git",
        )
      );
    }),
  contents: z
    .string()
    .refine(
      (value) => !value.includes("\0") && Buffer.from(value, "utf8").toString("utf8") === value,
    ),
  expected: fileEditExpectationSchema,
});
type Edit = z.infer<typeof editSchema>;

async function git(repoPath: string, args: string[], index?: string): Promise<Buffer> {
  const { stdout } = await execute("git", args, {
    cwd: repoPath,
    encoding: "buffer",
    timeout: 30_000,
    maxBuffer: 32 * 1024 * 1024,
    env: {
      ...process.env,
      GIT_LITERAL_PATHSPECS: "1",
      ...(index ? { GIT_INDEX_FILE: index } : {}),
    },
  });
  return stdout;
}

function stale(operation: string): DesktopResult<never> {
  return {
    ok: false,
    error: desktopFailure(
      operation,
      "conflict",
      "This file or its Git versions changed. Reload the latest changes before applying this edit.",
    ),
  };
}

function unsupported(operation: string): DesktopResult<never> {
  return {
    ok: false,
    error: desktopFailure(
      operation,
      "invalid-input",
      "This edit requires a regular file inside the repository. Symbolic links and shared hard links must be edited externally.",
    ),
  };
}

function isMissing(cause: unknown): boolean {
  return cause instanceof Error && "code" in cause && cause.code === "ENOENT";
}

async function inspectTarget(edit: Edit, operation: string): Promise<DesktopResult<string>> {
  let target = await fs.realpath(edit.repoPath);
  const segments = edit.relPath.split("/");
  for (const segment of segments.slice(0, -1)) {
    target = path.join(target, segment);
    const entry = await fs.lstat(target);
    if (!entry.isDirectory() || entry.isSymbolicLink()) return unsupported(operation);
  }
  target = path.join(target, segments.at(-1)!);
  try {
    const entry = await fs.lstat(target);
    if (!entry.isFile() || entry.isSymbolicLink() || entry.nlink > 1) return unsupported(operation);
  } catch (cause) {
    if (!isMissing(cause)) throw cause;
  }
  return desktopSuccess(target);
}

async function checkExpected(edit: Edit, operation: string): Promise<DesktopResult<void>> {
  if (edit.expected.kind === "diff") {
    const versions = await getFileVersions(edit.repoPath, edit.relPath, edit.expected.bucket);
    return (versions.oldFile?.contents ?? null) === edit.expected.oldContents &&
      (versions.newFile?.contents ?? null) === edit.expected.newContents
      ? desktopSuccess(undefined)
      : stale(operation);
  }

  try {
    const bytes = await fs.readFile(path.join(edit.repoPath, edit.relPath));
    return decoder.decode(bytes) === edit.expected.contents
      ? desktopSuccess(undefined)
      : stale(operation);
  } catch (cause) {
    if (isMissing(cause)) return stale(operation);
    throw cause;
  }
}

function encodeContents(contents: string, original: Buffer): Buffer {
  const encoded = Buffer.from(contents, "utf8");
  return original.subarray(0, 3).equals(byteOrderMark) &&
    !encoded.subarray(0, 3).equals(byteOrderMark)
    ? Buffer.concat([byteOrderMark, encoded])
    : encoded;
}

export async function updateIndexFileContents(
  repoPath: string,
  relPath: string,
  contents: string,
  expected: unknown,
): Promise<DesktopResult<void>> {
  const operation = "updateIndexFileContents";
  const input = editSchema.extend({ expected: diffEditExpectationSchema }).safeParse({
    repoPath,
    relPath,
    contents,
    expected,
  });
  if (!input.success) return invalidEdit(operation);
  const edit = input.data;
  return coordinateRepositoryWrite(
    repoPath,
    repositoryWriteEvents.updateIndexFileContents,
    async () => {
      const target = await inspectTarget(edit, operation);
      if (!target.ok) return target;
      const index = (
        await git(repoPath, ["rev-parse", "--path-format=absolute", "--git-path", "index"])
      )
        .toString("utf8")
        .trim();
      const lockPath = `${index}.lock`;
      let lock;
      try {
        lock = await fs.open(lockPath, "wx");
      } catch (cause) {
        if (cause instanceof Error && "code" in cause && cause.code === "EEXIST") {
          return {
            ok: false,
            error: desktopFailure(
              operation,
              "busy",
              "Another Git process is updating the index. Wait, then try again.",
            ),
          };
        }
        throw cause;
      }
      let temporary: string | undefined;
      let committed = false;
      try {
        const checked = await checkExpected(edit, operation);
        if (!checked.ok) return checked;
        const entries = (await git(repoPath, ["ls-files", "--stage", "-z", "--", relPath]))
          .toString("utf8")
          .split("\0")
          .filter(Boolean);
        const headEntry =
          entries.length === 0 &&
          edit.expected.bucket === "staged" &&
          edit.expected.oldContents !== null
            ? (await git(repoPath, ["ls-tree", "-z", "HEAD", "--", relPath])).toString("utf8")
            : "";
        const mode = entries[0]?.split(" ")[0] ?? (headEntry.split(" ")[0] || "100644");
        if (entries.length > 1 || !["100644", "100755"].includes(mode))
          return unsupported(operation);
        let originalBytes: Buffer;
        if (entries.length > 0) {
          originalBytes = await git(repoPath, ["show", `:${relPath}`]);
        } else if (edit.expected.bucket === "staged" && edit.expected.oldContents !== null) {
          originalBytes = await git(repoPath, ["show", `HEAD:${relPath}`]);
        } else if (edit.expected.newContents !== null) {
          originalBytes = await fs.readFile(target.value);
        } else {
          originalBytes = Buffer.alloc(0);
        }

        temporary = await fs.mkdtemp(path.join(os.tmpdir(), "open-warden-index-"));
        const alternateIndex = path.join(temporary, "index");
        try {
          await fs.copyFile(index, alternateIndex);
          await lock.chmod((await fs.stat(index)).mode & 0o777);
        } catch (cause) {
          if (!isMissing(cause)) throw cause;
        }
        const blob = path.join(temporary, "contents");
        await fs.writeFile(blob, encodeContents(contents, originalBytes));
        const oid = (await git(repoPath, ["hash-object", "-w", "--no-filters", blob]))
          .toString("utf8")
          .trim();
        const removingFile =
          contents === "" &&
          ((edit.expected.bucket === "staged" && edit.expected.oldContents === null) ||
            (edit.expected.bucket === "unstaged" && edit.expected.newContents === null));
        await git(
          repoPath,
          removingFile
            ? ["update-index", "--force-remove", "--", relPath]
            : ["update-index", "--add", "--cacheinfo", mode, oid, relPath],
          alternateIndex,
        );
        const latest = await checkExpected(edit, operation);
        if (!latest.ok) return latest;
        await lock.writeFile(await fs.readFile(alternateIndex));
        await lock.sync();
        await lock.close();
        await fs.rename(lockPath, index);
        committed = true;
        return desktopSuccess(undefined);
      } finally {
        await lock.close();
        if (!committed) await fs.rm(lockPath, { force: true });
        if (temporary) await fs.rm(temporary, { recursive: true, force: true });
      }
    },
  );
}

export async function updateWorktreeFileContents(
  repoPath: string,
  relPath: string,
  contents: string,
  expected: unknown,
): Promise<DesktopResult<void>> {
  const operation = "updateWorktreeFileContents";
  const input = editSchema.safeParse({ repoPath, relPath, contents, expected });
  if (
    !input.success ||
    (input.data.expected.kind === "diff" && input.data.expected.bucket !== "unstaged")
  )
    return invalidEdit(operation);
  const edit = input.data;
  return coordinateRepositoryWrite(
    repoPath,
    worktreeFileWriteEvent(relPath, {
      createsFile: edit.expected.kind === "diff" && edit.expected.newContents === null,
    }),
    async () => {
      const target = await inspectTarget(edit, operation);
      if (!target.ok) return target;
      const checked = await checkExpected(edit, operation);
      if (!checked.ok) return checked;
      let original: Buffer = Buffer.alloc(0);
      let originalStat: Stats | undefined;
      try {
        original = await fs.readFile(target.value);
        originalStat = await fs.lstat(target.value);
      } catch (cause) {
        if (!isMissing(cause)) throw cause;
      }
      let mode = originalStat ? originalStat.mode & 0o777 : 0o644;
      if (!originalStat && edit.expected.kind === "diff" && edit.expected.oldContents !== null) {
        original = await git(repoPath, ["show", `:${relPath}`]);
        const indexEntry = (
          await git(repoPath, ["ls-files", "--stage", "-z", "--", relPath])
        ).toString("utf8");
        mode = indexEntry.startsWith("100755 ") ? 0o755 : 0o644;
      }
      const temporary = path.join(
        path.dirname(target.value),
        repositoryTemporaryFileName(randomUUID()),
      );
      const handle = await fs.open(temporary, "wx", mode);
      try {
        await handle.chmod(mode);
        await handle.writeFile(encodeContents(contents, original));
        await handle.sync();
        await handle.close();
        const latestTarget = await inspectTarget(edit, operation);
        if (!latestTarget.ok) return latestTarget;
        const latest = await checkExpected(edit, operation);
        if (!latest.ok) return latest;
        if (originalStat) {
          const current = await fs.lstat(target.value);
          if (
            current.ino !== originalStat.ino ||
            current.dev !== originalStat.dev ||
            current.mtimeMs !== originalStat.mtimeMs ||
            current.ctimeMs !== originalStat.ctimeMs
          )
            return stale(operation);
          await fs.rename(temporary, target.value);
        } else {
          try {
            await fs.link(temporary, target.value);
          } catch (cause) {
            if (cause instanceof Error && "code" in cause && cause.code === "EEXIST")
              return stale(operation);
            throw cause;
          }
        }
        return desktopSuccess(undefined);
      } finally {
        await handle.close();
        await fs.rm(temporary, { force: true });
      }
    },
  );
}

function invalidEdit(operation: string): DesktopResult<never> {
  return {
    ok: false,
    error: desktopFailure(
      operation,
      "invalid-input",
      "Reload the file before applying this edit. Its expected version is required.",
    ),
  };
}
