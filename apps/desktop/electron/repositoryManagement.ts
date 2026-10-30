import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";

import {
  repositoryConfigurationCommandSchema,
  type RepositoryConfiguration,
} from "../src/platform/desktop/repositoryManagement";
import {
  desktopFailure,
  desktopSuccess,
  type DesktopResult,
} from "../src/platform/desktop/failure";
import { classifyDesktopFailure } from "./desktop-failure";
import { coordinateRepositoryWrite } from "./repositoryWrites";

export function expandRepositoryPath(value: string) {
  return value.startsWith("~/") ? path.join(os.homedir(), value.slice(2)) : value;
}

export function runRepositoryGit(
  cwd: string,
  args: string[],
  options: { env?: NodeJS.ProcessEnv; timeout?: number } = {},
): Promise<DesktopResult<string>> {
  return new Promise((resolve) => {
    execFile(
      "git",
      args,
      {
        cwd,
        encoding: "utf8",
        maxBuffer: 8 * 1024 * 1024,
        timeout: options.timeout ?? 120_000,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never", ...options.env },
      },
      (error, stdout, stderr) => {
        resolve(
          error
            ? {
                ok: false,
                error: classifyDesktopFailure(
                  {
                    name: "GitCommandError",
                    code: error.code,
                    message: error.message,
                    stderr,
                    killed: error.killed,
                  },
                  "repositoryManagement",
                ),
              }
            : desktopSuccess(stdout),
        );
      },
    );
  });
}

function safeRemoteUrl(value: string) {
  try {
    const url = new URL(value);

    url.password = "";
    if (url.protocol !== "ssh:") url.username = "";
    url.search = "";
    url.hash = "";

    return url.toString();
  } catch {
    return value;
  }
}

export async function getRepositoryConfiguration(
  repoPath: string,
): Promise<DesktopResult<RepositoryConfiguration>> {
  if (!repoPath || repoPath.includes("\0"))
    return {
      ok: false,
      error: desktopFailure(
        "getRepositoryConfiguration",
        "invalid-input",
        "Choose a repository first.",
      ),
    };

  const config = await runRepositoryGit(repoPath, ["config", "--local", "--null", "--list"]);

  if (!config.ok) return config;

  const values = new Map<string, string[]>();

  for (const entry of config.value.split("\0").filter(Boolean)) {
    const newline = entry.indexOf("\n");
    const key = newline < 0 ? entry : entry.slice(0, newline);
    const value = newline < 0 ? "" : entry.slice(newline + 1);

    values.set(key, [...(values.get(key) ?? []), value]);
  }

  const [head, refs, names] = await Promise.all([
    runRepositoryGit(repoPath, ["symbolic-ref", "--quiet", "--short", "HEAD"]),
    runRepositoryGit(repoPath, [
      "for-each-ref",
      "--format=%(refname:strip=2)%09%(symref)",
      "refs/remotes",
    ]),
    runRepositoryGit(repoPath, ["remote"]),
  ]);

  if (!refs.ok) return refs;
  if (!names.ok) return names;

  const branch = head.ok ? head.value.trim() : "";
  const remote = values.get(`branch.${branch}.remote`)?.[0];
  const merge = values.get(`branch.${branch}.merge`)?.[0];
  let upstream: string | null = null;

  if (remote && merge) {
    const branchPrefix = "refs/heads/";
    const name = merge.startsWith(branchPrefix) ? merge.slice(branchPrefix.length) : merge;

    upstream = remote === "." ? name : `${remote}/${name}`;
  }

  return desktopSuccess({
    revision: createHash("sha256")
      .update(config.value)
      .update("\0" + branch)
      .digest("hex"),
    branch,
    upstream,
    remoteBranches: refs.value
      .split("\n")
      .filter(Boolean)
      .flatMap((line) => {
        const [name, symbolic] = line.split("\t");

        return name && !symbolic ? [name] : [];
      }),
    remotes: names.value
      .split("\n")
      .filter(Boolean)
      .map((name) => ({
        name,
        fetchUrls: (values.get(`remote.${name}.url`) ?? []).map(safeRemoteUrl),
        pushUrls: (values.get(`remote.${name}.pushurl`) ?? []).map(safeRemoteUrl),
      })),
  });
}

export async function configureRepository(
  repoPath: string,
  input: unknown,
): Promise<DesktopResult<void>> {
  const parsed = repositoryConfigurationCommandSchema.safeParse(input);

  if (!parsed.success)
    return {
      ok: false,
      error: desktopFailure(
        "configureRepository",
        "invalid-input",
        parsed.error.issues[0]?.message ?? "Check the remote configuration.",
      ),
    };

  const command = parsed.data;

  return coordinateRepositoryWrite(
    repoPath,
    {
      operation: "configureRepository",
      impact: { kinds: ["refs", "config"], paths: [], structure: false },
    },
    async () => {
      const current = await getRepositoryConfiguration(repoPath);

      if (!current.ok) return current;

      if (current.value.revision !== command.expectedRevision)
        return {
          ok: false,
          error: desktopFailure(
            "configureRepository",
            "conflict",
            "Repository configuration changed. Refresh before saving.",
          ),
        };

      if (command.kind !== "set-upstream") {
        const name = command.kind === "rename-remote" ? command.newName : command.name;
        const valid = await runRepositoryGit(repoPath, [
          "check-ref-format",
          `refs/remotes/${name}/branch`,
        ]);

        if (!valid.ok)
          return {
            ok: false,
            error: desktopFailure(
              "configureRepository",
              "invalid-input",
              "Enter a valid remote name, such as origin or upstream.",
            ),
          };

        const exists = current.value.remotes.some((remote) => remote.name === command.name);

        if ((command.kind === "add-remote") === exists)
          return {
            ok: false,
            error: desktopFailure(
              "configureRepository",
              "conflict",
              exists
                ? "A remote with this name already exists."
                : "This remote no longer exists. Refresh the configuration.",
            ),
          };
      }

      let args: string[];

      switch (command.kind) {
        case "add-remote":
          args = ["remote", "add", command.name, expandRepositoryPath(command.url)];
          break;
        case "edit-remote": {
          const remote = current.value.remotes.find((item) => item.name === command.name);

          if ((remote?.fetchUrls.length ?? 0) > 1)
            return {
              ok: false,
              error: desktopFailure(
                "configureRepository",
                "invalid-input",
                "This remote has multiple fetch URLs. Edit its Git configuration to preserve that setup.",
              ),
            };

          args = ["remote", "set-url", command.name, expandRepositoryPath(command.url)];
          break;
        }
        case "edit-push-url": {
          const remote = current.value.remotes.find((item) => item.name === command.name);

          if ((remote?.pushUrls.length ?? 0) > 1)
            return {
              ok: false,
              error: desktopFailure(
                "configureRepository",
                "invalid-input",
                "This remote has multiple push URLs. Edit its Git configuration to preserve that setup.",
              ),
            };

          if (!command.url && !remote?.pushUrls.length) return desktopSuccess(undefined);

          args = command.url
            ? [
                "config",
                "--local",
                `remote.${command.name}.pushurl`,
                expandRepositoryPath(command.url),
              ]
            : ["config", "--local", "--unset-all", `remote.${command.name}.pushurl`];
          break;
        }
        case "rename-remote":
          args = ["remote", "rename", command.name, command.newName];
          break;
        case "remove-remote":
          args = ["remote", "remove", command.name];
          break;
        case "set-upstream": {
          if (!current.value.branch || current.value.branch !== command.branch)
            return {
              ok: false,
              error: desktopFailure(
                "configureRepository",
                "conflict",
                "The checked-out branch changed. Refresh before setting its upstream.",
              ),
            };

          if (command.upstream && !current.value.remoteBranches.includes(command.upstream))
            return {
              ok: false,
              error: desktopFailure(
                "configureRepository",
                "not-found",
                "Fetch the remote branch before selecting it as upstream.",
              ),
            };

          const existingBranch = await runRepositoryGit(repoPath, [
            "show-ref",
            "--verify",
            `refs/heads/${command.branch}`,
          ]);

          if (!existingBranch.ok)
            return {
              ok: false,
              error: desktopFailure(
                "configureRepository",
                "invalid-input",
                "Create the first commit before setting an upstream for this branch.",
              ),
            };

          args = command.upstream
            ? ["branch", `--set-upstream-to=refs/remotes/${command.upstream}`, "--", command.branch]
            : ["branch", "--unset-upstream", "--", command.branch];
          break;
        }
      }

      const result = await runRepositoryGit(repoPath, args);

      return result.ok ? desktopSuccess(undefined) : result;
    },
  );
}
