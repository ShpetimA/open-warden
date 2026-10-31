import { spawn } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import { z } from "zod";

import type { HistoryCommit } from "../src/platform/desktop/contracts";
import type { HistoryGraph, HistoryGraphCommit } from "../src/platform/desktop/history";

class GitHistoryError extends Error {
  constructor(
    readonly stderr: string,
    readonly code: number | string | null,
  ) {
    super(stderr || "Git history could not be read.");
    this.name = "GitCommandError";
  }
}

async function readGitLines(repoPath: string, args: string[], onLine: (line: string) => void) {
  const child = spawn("git", args, {
    cwd: z.string().min(1).parse(repoPath),
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 30_000,
  });
  let stderr = "";
  child.stderr.on("data", (chunk: Buffer) => {
    stderr = (stderr + chunk.toString("utf8")).slice(0, 4096);
  });
  const completion = new Promise<{ code: number | null; error?: Error }>((resolve) => {
    child.once("error", (error) => resolve({ code: null, error }));
    child.once("close", (code) => resolve({ code }));
  });
  const decoder = new StringDecoder("utf8");
  let pending = "";

  try {
    for await (const chunk of child.stdout) {
      pending += decoder.write(chunk);
      let start = 0;
      let end = pending.indexOf("\n");
      while (end >= 0) {
        onLine(pending.slice(start, end));
        start = end + 1;
        end = pending.indexOf("\n", start);
      }
      pending = pending.slice(start);
    }
    pending += decoder.end();
    const result = await completion;
    if (result.error) throw result.error;
    if (result.code !== 0) throw new GitHistoryError(stderr, result.code);
    if (pending) onLine(pending);
  } finally {
    if (child.exitCode === null) child.kill();
    await completion;
  }
}

const commitFields = z.tuple([z.string().min(1), z.string(), z.string(), z.string(), z.string()]);

export async function getCommitHistory(repoPath: string, limit?: number): Promise<HistoryCommit[]> {
  const count = z.number().int().positive().optional().parse(limit);
  const commits: HistoryCommit[] = [];
  try {
    await readGitLines(
      repoPath,
      [
        "log",
        "--no-color",
        "--no-show-signature",
        "--encoding=UTF-8",
        "--topo-order",
        "--format=%H%x00%h%x00%s%x00%an%x00%ar",
        ...(count === undefined ? [] : [`--max-count=${count}`]),
      ],
      (line) => {
        const [commitId, shortId, summary, author, relativeTime] = commitFields.parse(
          line.split("\0"),
        );
        commits.push({ commitId, shortId, summary, author, relativeTime });
      },
    );
  } catch (error) {
    if (error instanceof GitHistoryError && /does not have any commits yet/.test(error.stderr))
      return [];
    throw error;
  }
  return commits;
}

const graphFields = z.tuple([
  z.string().min(1),
  z.string(),
  z.string(),
  z.string(),
  z.string(),
  z.string(),
  z.string(),
  z.string(),
]);
const refFields = z.tuple([z.string(), z.string(), z.string()]);

export async function getHistoryGraph(repoPath: string): Promise<HistoryGraph> {
  const refs = new Map<string, string[]>();
  let head = "";
  let shallow = false;
  await Promise.all([
    readGitLines(
      repoPath,
      [
        "for-each-ref",
        "--format=%(objectname)%00%(*objectname)%00%(refname)",
        "refs/heads",
        "refs/remotes",
        "refs/tags",
      ],
      (line) => {
        const [object, peeled, ref] = refFields.parse(line.split("\0"));
        const id = peeled || object;
        const names = refs.get(id) ?? [];
        names.push(ref);
        refs.set(id, names);
      },
    ),
    readGitLines(repoPath, ["rev-parse", "--verify", "HEAD"], (line) => {
      head = line;
    }).catch((error: unknown) => {
      if (
        error instanceof GitHistoryError &&
        /Needed a single revision|unknown revision|bad revision/.test(error.stderr)
      )
        return;
      throw error;
    }),
    readGitLines(repoPath, ["rev-parse", "--is-shallow-repository"], (line) => {
      shallow = z.enum(["true", "false"]).parse(line) === "true";
    }),
  ]);
  const commits: HistoryGraphCommit[] = [];
  await readGitLines(
    repoPath,
    [
      "log",
      "--branches",
      "--remotes",
      "--tags",
      "--topo-order",
      "--no-color",
      "--no-show-signature",
      "--encoding=UTF-8",
      "--format=%H%x00%h%x00%s%x00%aN%x00%aE%x00%ar%x00%aI%x00%P",
      ...(head ? [head] : []),
      "--",
    ],
    (line) => {
      const [commitId, shortId, summary, author, authorEmail, relativeTime, authoredAt, parents] =
        graphFields.parse(line.split("\0"));
      commits.push({
        commitId,
        shortId,
        summary,
        author,
        authorEmail,
        relativeTime,
        authoredAt,
        parents: parents ? parents.split(" ") : [],
        refs: [...(head === commitId ? ["HEAD"] : []), ...(refs.get(commitId) ?? [])],
      });
    },
  );
  return { commits, shallow };
}
