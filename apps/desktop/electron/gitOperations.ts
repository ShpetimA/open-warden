import { execFile } from "node:child_process";
import { z } from "zod";
import {
  gitCommandSchema,
  type GitCommand,
  type GitRepositoryState,
  type GitResult,
} from "../src/platform/desktop/gitOperations";

const repoSchema = z
  .string()
  .min(1)
  .refine((value) => !value.includes("\0"));
const running = new Set<string>();

function run(repoPath: string, args: string[]): Promise<GitResult<string>> {
  return new Promise((resolve) => {
    execFile(
      "git",
      args,
      {
        cwd: repoPath,
        encoding: "utf8",
        timeout: 120_000,
        maxBuffer: 8 * 1024 * 1024,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: "0",
          GIT_EDITOR: "true",
          GIT_SEQUENCE_EDITOR: "true",
        },
      },
      (error, stdout, stderr) => {
        if (error) {
          const message = (stderr || error.message)
            .replace(/https?:\/\/\S+/g, "[remote]")
            .slice(0, 4000);
          resolve({ ok: false, error: { code: "git-failed", message } });
        } else resolve({ ok: true, value: stdout.trim() });
      },
    );
  });
}

export async function getGitRepositoryState(input: string): Promise<GitResult<GitRepositoryState>> {
  const parsed = repoSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: { code: "invalid-input", message: "Repository path is required." } };
  const repo = parsed.data;
  const results = await Promise.all([
    run(repo, ["status", "--porcelain=v2", "--branch"]),
    run(repo, ["remote"]),
    run(repo, [
      "for-each-ref",
      "--format=%(refname)%09%(worktreepath)%09%(symref)",
      "refs/heads",
      "refs/remotes",
    ]),
  ]);
  const [status, remotes, refs] = results;
  if (!status.ok) return status;
  if (!remotes.ok) return remotes;
  if (!refs.ok) return refs;
  const lines = status.value.split("\n");
  const branch = lines.find((line) => line.startsWith("# branch.head "))?.slice(14) ?? "";
  const upstream = lines.find((line) => line.startsWith("# branch.upstream "))?.slice(18) ?? "";
  const counts = lines.find((line) => line.startsWith("# branch.ab "))?.match(/\+(\d+) -(\d+)/);
  const readLog = async (range: string) => {
    const result = await run(repo, ["log", "-30", "--format=%h%x09%s", range, "--"]);
    if (!result.ok) return result;
    return {
      ok: true as const,
      value: result.value
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [id = "", ...subject] = line.split("\t");
          return { id, subject: subject.join("\t") };
        }),
    };
  };
  const incoming = upstream ? await readLog("HEAD..@{upstream}") : { ok: true as const, value: [] };
  const outgoing = upstream ? await readLog("@{upstream}..HEAD") : { ok: true as const, value: [] };
  if (!incoming.ok) return incoming;
  if (!outgoing.ok) return outgoing;
  return {
    ok: true,
    value: {
      branch: branch === "(detached)" ? "" : branch,
      upstream,
      ahead: Number(counts?.[1] ?? 0),
      behind: Number(counts?.[2] ?? 0),
      remotes: remotes.value.split("\n").filter(Boolean),
      branches: refs.value
        .split("\n")
        .filter(Boolean)
        .flatMap((line) => {
          const [ref = "", worktree = "", symbolic = ""] = line.split("\t");
          if (symbolic) return [];
          const remote = ref.startsWith("refs/remotes/");
          return [{ name: ref.replace(/^refs\/(heads|remotes)\//, ""), remote, worktree }];
        }),
      incoming: incoming.value,
      outgoing: outgoing.value,
    },
  };
}

async function execute(repo: string, command: GitCommand): Promise<GitResult<string>> {
  switch (command.kind) {
    case "fetch":
      return run(repo, ["fetch", "--prune", command.remote]);
    case "pull":
      return run(repo, ["pull", "--ff-only"]);
    case "push": {
      const branch = await run(repo, ["symbolic-ref", "--short", "HEAD"]);
      if (!branch.ok) return branch;
      const remote = await run(repo, ["config", "--get", `branch.${branch.value}.remote`]);
      if (!remote.ok) return remote;
      const merge = await run(repo, ["config", "--get", `branch.${branch.value}.merge`]);
      if (!merge.ok) return merge;
      return run(repo, ["push", remote.value, `HEAD:${merge.value}`]);
    }
    case "publish": {
      const branch = await run(repo, ["symbolic-ref", "--short", "HEAD"]);
      if (!branch.ok) return branch;
      return run(repo, [
        "push",
        "--set-upstream",
        command.remote,
        `HEAD:refs/heads/${branch.value}`,
      ]);
    }
    case "switch":
      return run(repo, ["switch", "--", command.branch]);
    case "track":
      return run(repo, ["switch", "-c", command.branch, "--track", command.remoteBranch]);
    case "create":
      return run(repo, ["switch", "-c", command.branch, command.startPoint]);
    case "rename":
      return run(repo, ["branch", "-m", command.branch]);
    case "delete":
      return run(repo, ["branch", "-d", "--", command.branch]);
  }
}

export async function runGitCommand(
  repoInput: string,
  commandInput: GitCommand,
): Promise<GitResult<string>> {
  const repo = repoSchema.safeParse(repoInput);
  const command = gitCommandSchema.safeParse(commandInput);
  if (!repo.success || !command.success)
    return { ok: false, error: { code: "invalid-input", message: "Invalid Git operation." } };
  const root = await run(repo.data, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  if (!root.ok) return root;
  if (running.has(root.value))
    return {
      ok: false,
      error: { code: "busy", message: "Another Git operation is running for this repository." },
    };
  running.add(root.value);
  try {
    return await execute(repo.data, command.data);
  } finally {
    running.delete(root.value);
  }
}
