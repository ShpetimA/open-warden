import { stat } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { z } from "zod";
import {
  gitCommandSchema,
  type GitOperation,
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
        } else resolve({ ok: true, value: stdout.replace(/\r?\n$/, "") });
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
  const upstreamExists = upstream
    ? (await run(repo, ["rev-parse", "--verify", "@{upstream}"])).ok
    : false;
  const incoming = upstreamExists
    ? await readLog("HEAD..@{upstream}")
    : { ok: true as const, value: [] };
  const outgoing = upstreamExists
    ? await readLog("@{upstream}..HEAD")
    : { ok: true as const, value: [] };
  if (!incoming.ok) return incoming;
  if (!outgoing.ok) return outgoing;
  const head = await run(repo, ["rev-parse", "--verify", "HEAD"]);
  const lastMessage = head.ok ? await run(repo, ["log", "-1", "--format=%B"]) : null;
  const published = head.ok ? await run(repo, ["branch", "-r", "--contains", "HEAD"]) : null;
  const stashes = await run(repo, ["stash", "list", "--format=%H%x09%gs"]);
  if (!stashes.ok) return stashes;
  const operation = await readOperation(repo);
  if (!operation.ok) return operation;
  const conflicts = await run(repo, ["diff", "--name-only", "--diff-filter=U", "-z"]);
  if (!conflicts.ok) return conflicts;
  return {
    ok: true,
    value: {
      branch: branch === "(detached)" ? "" : branch,
      upstream: upstreamExists ? upstream : "",
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
      operation: operation.value,
      conflicts: conflicts.value.split("\0").filter(Boolean),
      lastCommit:
        head.ok && lastMessage?.ok && published?.ok
          ? { id: head.value, message: lastMessage.value, published: Boolean(published.value) }
          : null,
      stashes: stashes.value
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [oid = "", ...label] = line.split("\t");
          return { oid, label: label.join("\t") };
        }),
      incoming: incoming.value,
      outgoing: outgoing.value,
    },
  };
}

async function execute(repo: string, command: GitCommand): Promise<GitResult<string>> {
  switch (command.kind) {
    case "merge":
    case "rebase":
    case "cherry-pick":
    case "revert": {
      const status = await run(repo, ["status", "--porcelain"]);
      if (!status.ok) return status;
      if (status.value)
        return failure("Commit or stash local changes before starting this operation.");
      if (command.kind === "merge") return run(repo, ["merge", "--no-edit", command.branch]);
      if (command.kind === "rebase") return run(repo, ["rebase", command.branch]);
      return run(repo, [command.kind, "--no-edit", command.commit]);
    }
    case "continue":
    case "abort":
    case "skip":
      return run(repo, [command.operation, "--" + command.kind]);
    case "restore-file": {
      const changes = await run(repo, [
        "--literal-pathspecs",
        "status",
        "--porcelain",
        "--",
        command.path,
      ]);
      if (!changes.ok) return changes;
      if (changes.value)
        return failure(
          "This file has local changes. Commit or stash them before restoring a revision.",
        );
      return run(repo, [
        "--literal-pathspecs",
        "restore",
        "--source=" + command.commit,
        "--worktree",
        "--",
        command.path,
      ]);
    }
    case "amend":
    case "undo": {
      const head = await run(repo, ["rev-parse", "--verify", "HEAD"]);
      if (!head.ok) return head;
      if (head.value !== command.expectedHead)
        return failure("HEAD changed. Refresh before editing this commit.");
      const published = await run(repo, ["branch", "-r", "--contains", "HEAD"]);
      if (!published.ok) return published;
      if (published.value)
        return failure(
          "This commit is on a remote-tracking branch. Use Revert to preserve published history.",
        );
      if (command.kind === "amend")
        return run(repo, ["commit", "--amend", "--allow-empty", "-m", command.message]);
      const parent = await run(repo, ["rev-parse", "--verify", "HEAD^"]);
      if (!parent.ok) return failure("The initial commit has no parent. Amend it instead.");
      return run(repo, ["reset", "--soft", parent.value]);
    }
    case "stash-save":
      return run(repo, [
        "stash",
        "push",
        ...(command.includeUntracked ? ["--include-untracked"] : []),
        "-m",
        command.message,
      ]);
    case "stash-apply":
      return run(repo, ["stash", "apply", command.oid]);
    case "stash-pop":
    case "stash-drop": {
      const list = await run(repo, ["stash", "list", "--format=%H%x09%gd"]);
      if (!list.ok) return list;
      const ref = list.value
        .split("\n")
        .find((line) => line.startsWith(command.oid + "\t"))
        ?.split("\t")[1];
      if (!ref) return failure("This stash no longer exists. Refresh the stash list.");
      if (command.kind === "stash-pop") {
        const applied = await run(repo, ["stash", "apply", command.oid]);
        if (!applied.ok) return applied;
      }
      return run(repo, ["stash", "drop", ref]);
    }
    case "stash-switch": {
      const saved = await run(repo, [
        "stash",
        "push",
        "--include-untracked",
        "-m",
        "Before switching to " + command.branch,
      ]);
      if (!saved.ok) return saved;
      const switched = await execute(
        repo,
        command.remote
          ? {
              kind: "track",
              remoteBranch: command.branch,
              branch: command.branch.slice(command.branch.indexOf("/") + 1),
            }
          : { kind: "switch", branch: command.branch },
      );
      if (!switched.ok)
        return failure(switched.error.message + "\nYour saved work remains in Stashes.");
      return switched;
    }
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
    const operation = await readOperation(repo.data);
    if (!operation.ok) return operation;
    if (
      command.data.kind === "continue" ||
      command.data.kind === "abort" ||
      command.data.kind === "skip"
    ) {
      if (operation.value !== command.data.operation)
        return failure("The Git operation changed. Refresh before continuing.");
    } else if (operation.value && command.data.kind !== "fetch") {
      return failure("Finish or abort the current " + operation.value + " first.");
    }
    return await execute(repo.data, command.data);
  } finally {
    running.delete(root.value);
  }
}

function failure(message: string): GitResult<never> {
  return { ok: false, error: { code: "git-failed", message } };
}

export async function getGitStashPatch(
  repoInput: string,
  oidInput: string,
): Promise<GitResult<string>> {
  const repo = repoSchema.safeParse(repoInput);
  const oid = z
    .string()
    .regex(/^[a-f0-9]{40,64}$/)
    .safeParse(oidInput);
  if (!repo.success || !oid.success) return failure("Invalid stash.");
  return run(repo.data, ["stash", "show", "--include-untracked", "--patch", oid.data]);
}

async function readOperation(repo: string): Promise<GitResult<GitOperation | null>> {
  const directory = await run(repo, ["rev-parse", "--absolute-git-dir"]);
  if (!directory.ok) return directory;
  const markers: ReadonlyArray<readonly [string, GitOperation]> = [
    ["rebase-merge", "rebase"],
    ["rebase-apply", "rebase"],
    ["MERGE_HEAD", "merge"],
    ["CHERRY_PICK_HEAD", "cherry-pick"],
    ["REVERT_HEAD", "revert"],
  ];
  for (const [marker, operation] of markers) {
    try {
      await stat(path.join(directory.value, marker));
      return { ok: true, value: operation };
    } catch (error: unknown) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
        return failure("Unable to read the current Git operation.");
    }
  }
  return { ok: true, value: null };
}
