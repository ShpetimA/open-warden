import { gitCommandWriteEvent } from "./repositoryChangeDefinitions";
import { gitAuthenticationEnvironment, type ProviderCredentials } from "./gitAuthentication";
import { coordinateRepositoryWrite } from "./repositoryWrites";
import { classifyDesktopFailure } from "./desktop-failure";
import type { DesktopResult } from "../src/platform/desktop/failure";
import { realpath, stat } from "node:fs/promises";
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

function run(
  repoPath: string,
  args: string[],
  environment: NodeJS.ProcessEnv = {},
): Promise<GitResult<string>> {
  return new Promise((resolve) => {
    execFile(
      "git",
      ["--no-optional-locks", ...args],
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
          ...environment,
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
    run(repo, [
      "for-each-ref",
      "--format=%(refname:strip=2)%09%(*objectname)%09%(objectname)",
      "refs/tags",
    ]),
    run(repo, ["worktree", "list", "--porcelain", "-z"]),
  ]);
  const [status, remotes, refs, tags, worktrees] = results;
  if (!status.ok) return status;
  if (!remotes.ok) return remotes;
  if (!refs.ok) return refs;
  if (!tags.ok) return tags;
  if (!worktrees.ok) return worktrees;
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
  const conflicts = await run(repo, ["diff-files", "--name-only", "--diff-filter=U", "-z"]);
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
      tags: tags.value
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [name = "", peeled = "", object = ""] = line.split("\t");
          return { name, commitId: peeled || object };
        }),
      worktrees: worktrees.value
        .split("\0\0")
        .filter(Boolean)
        .flatMap((record) => {
          const fields = record.split("\0");
          const worktree = fields.find((field) => field.startsWith("worktree "))?.slice(9);
          const commitId = fields.find((field) => field.startsWith("HEAD "))?.slice(5);
          const branch =
            fields
              .find((field) => field.startsWith("branch "))
              ?.slice(7)
              .replace(/^refs\/heads\//, "") ?? "";
          return worktree && commitId ? [{ path: worktree, commitId, branch }] : [];
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

async function execute(
  repo: string,
  command: GitCommand,
  credentials: ProviderCredentials,
): Promise<GitResult<string>> {
  async function remoteRun(args: string[], remote: string, push = false) {
    if (remote === ".") return run(repo, args);

    const url = await run(repo, ["remote", "get-url", ...(push ? ["--push"] : []), remote]);

    if (!url.ok) return url;

    return run(repo, args, await gitAuthenticationEnvironment(url.value.trim(), credentials));
  }

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
    case "stash-staged": {
      const staged = await run(repo, ["diff", "--cached", "--name-only", "-z"]);
      if (!staged.ok) return staged;
      const unstaged = await run(repo, ["diff", "--name-only", "-z"]);
      if (!unstaged.ok) return unstaged;
      const untracked = await run(repo, ["ls-files", "--others", "--exclude-standard", "-z"]);
      if (!untracked.ok) return untracked;
      const stagedPaths = new Set(staged.value.split("\0").filter(Boolean));
      if (stagedPaths.size === 0) return failure("No staged changes to stash.");
      if (
        [...unstaged.value.split("\0"), ...untracked.value.split("\0")].some((file) =>
          stagedPaths.has(file),
        )
      ) {
        return failure("A staged path has other local changes. Stash those changes separately.");
      }
      return run(repo, ["stash", "push", "--staged"]);
    }
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
        credentials,
      );
      if (!switched.ok)
        return failure(switched.error.message + "\nYour saved work remains in Stashes.");
      return switched;
    }
    case "fetch":
      return remoteRun(["fetch", "--prune", command.remote], command.remote);
    case "pull": {
      const branch = await run(repo, ["symbolic-ref", "--short", "HEAD"]);

      if (!branch.ok) return branch;

      const remote = await run(repo, ["config", "--get", `branch.${branch.value}.remote`]);

      if (!remote.ok) return remote;

      return remoteRun(["pull", "--ff-only"], remote.value);
    }
    case "push": {
      const branch = await run(repo, ["symbolic-ref", "--short", "HEAD"]);

      if (!branch.ok) return branch;

      const remote = await run(repo, ["config", "--get", `branch.${branch.value}.remote`]);

      if (!remote.ok) return remote;

      const merge = await run(repo, ["config", "--get", `branch.${branch.value}.merge`]);

      if (!merge.ok) return merge;

      return remoteRun(["push", remote.value, `HEAD:${merge.value}`], remote.value, true);
    }
    case "publish": {
      const branch = await run(repo, ["symbolic-ref", "--short", "HEAD"]);

      if (!branch.ok) return branch;

      return remoteRun(
        ["push", "--set-upstream", command.remote, `HEAD:refs/heads/${branch.value}`],
        command.remote,
        true,
      );
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
    case "tag-create":
      return run(repo, ["tag", "--annotate", command.tag, "-m", command.tag]);
    case "tag-delete":
      return run(repo, ["tag", "--delete", "--", command.tag]);
    case "worktree-add": {
      if (!path.isAbsolute(command.path))
        return failure("Choose an absolute path for the worktree.");
      try {
        await stat(command.path);
        return failure("The worktree path already exists.");
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
          return failure("Could not inspect the worktree path.");
      }
      const state = await getGitRepositoryState(repo);
      if (!state.ok) return state;
      const branch = state.value.branches.find(
        (item) => item.name === command.branch && !item.remote,
      );
      if (!branch || branch.worktree)
        return failure("Choose a local branch that is not checked out elsewhere.");
      return run(repo, ["worktree", "add", "--", command.path, command.branch]);
    }
    case "worktree-remove": {
      const state = await getGitRepositoryState(repo);
      if (!state.ok) return state;
      let requested: string;
      let current: string;
      const root = await run(repo, ["rev-parse", "--show-toplevel"]);
      if (!root.ok) return root;
      try {
        [requested, current] = await Promise.all([realpath(command.path), realpath(root.value)]);
      } catch {
        return failure("This worktree no longer exists. Refresh and try again.");
      }
      if (requested === current) return failure("The current worktree cannot be removed.");
      const candidate = state.value.worktrees.find((item) => item.path === command.path);
      if (!candidate) return failure("This path is not a registered worktree for this repository.");
      const status = await run(command.path, ["status", "--porcelain", "--ignored", "-z"]);
      if (!status.ok) return status;
      if (status.value)
        return failure(
          "This worktree contains local or ignored files. Move or remove them before removing it.",
        );
      return run(repo, ["worktree", "remove", "--", command.path]);
    }
  }
}

export async function runGitCommand(
  repoInput: string,
  commandInput: GitCommand,
  credentials: ProviderCredentials = async () => null,
): Promise<DesktopResult<string>> {
  const repo = repoSchema.safeParse(repoInput);
  const command = gitCommandSchema.safeParse(commandInput);
  if (!repo.success || !command.success)
    return {
      ok: false,
      error: {
        operation: "runGitCommand",
        code: "invalid-input",
        message: "Invalid Git operation.",
      },
    };
  const result = await coordinateRepositoryWrite(
    repo.data,
    gitCommandWriteEvent(command.data.kind),
    async () => {
      const outcome = await (async () => {
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
        return await execute(repo.data, command.data, credentials);
      })();
      return outcome.ok
        ? outcome
        : {
            ok: false,
            error: {
              ...classifyDesktopFailure(outcome.error, "runGitCommand"),
              ...(outcome.error.code === "invalid-input" ? { message: outcome.error.message } : {}),
            },
          };
    },
  );
  return result;
}

function failure(message: string): GitResult<never> {
  return { ok: false, error: { code: "invalid-input", message } };
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
