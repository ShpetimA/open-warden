import { lstat, mkdir, realpath, rmdir } from "node:fs/promises";
import path from "node:path";

import { repositorySetupSchema } from "../src/platform/desktop/repositoryManagement";
import {
  desktopFailure,
  desktopSuccess,
  type DesktopResult,
} from "../src/platform/desktop/failure";
import { gitAuthenticationEnvironment, type ProviderCredentials } from "./gitAuthentication";
import { classifyDesktopFailure } from "./desktop-failure";
import { expandRepositoryPath, runRepositoryGit } from "./repositoryManagement";

const preparing = new Set<string>();

export async function setupRepository(
  input: unknown,
  credentials: ProviderCredentials = async () => null,
): Promise<DesktopResult<string>> {
  const parsed = repositorySetupSchema.safeParse(input);

  if (!parsed.success)
    return {
      ok: false,
      error: desktopFailure(
        "setupRepository",
        "invalid-input",
        parsed.error.issues[0]?.message ?? "Check the repository details.",
      ),
    };

  const command = parsed.data;
  const expanded = expandRepositoryPath(command.destination);
  const destination = path.resolve(expanded);

  if (!path.isAbsolute(expanded) || destination === path.parse(destination).root)
    return {
      ok: false,
      error: desktopFailure(
        "setupRepository",
        "invalid-input",
        "Choose an absolute destination path below an existing folder.",
      ),
    };

  let target: string | undefined;
  let created = false;
  let createdIdentity: { dev: number; ino: number } | undefined;
  let ownsPreparation = false;

  try {
    const parent = await realpath(path.dirname(destination));
    target = path.join(parent, path.basename(destination));

    if (preparing.has(target))
      return {
        ok: false,
        error: desktopFailure(
          "setupRepository",
          "busy",
          "This repository is already being prepared.",
        ),
      };

    preparing.add(target);
    ownsPreparation = true;

    const entry = await lstat(target).catch((cause: unknown) => {
      if (cause instanceof Error && "code" in cause && cause.code === "ENOENT") return null;

      throw cause;
    });

    if (entry && (command.kind === "clone" || !entry.isDirectory() || entry.isSymbolicLink()))
      return {
        ok: false,
        error: desktopFailure(
          "setupRepository",
          "conflict",
          command.kind === "clone"
            ? "The destination already exists. Choose a new folder name; existing files are kept."
            : "Choose a regular folder for the repository.",
        ),
      };

    if (command.kind === "init") {
      const ancestor = await runRepositoryGit(entry ? target : parent, [
        "rev-parse",
        "--absolute-git-dir",
      ]);

      if (ancestor.ok)
        return {
          ok: false,
          error: desktopFailure(
            "setupRepository",
            "conflict",
            "This folder is already inside a Git repository. Open that repository or choose another folder.",
          ),
        };

      if (ancestor.error.code !== "not-found") return ancestor;

      const validBranch = await runRepositoryGit(parent, [
        "check-ref-format",
        "--branch",
        command.initialBranch,
      ]);

      if (!validBranch.ok) {
        if (validBranch.error.code !== "git-failed") return validBranch;

        return {
          ok: false,
          error: desktopFailure(
            "setupRepository",
            "invalid-input",
            "Enter a valid initial branch name, such as main.",
          ),
        };
      }
    }

    if (!entry) {
      await mkdir(target);
      created = true;
      createdIdentity = await lstat(target);
    }

    const result =
      command.kind === "clone"
        ? await runRepositoryGit(
            parent,
            ["clone", "--", expandRepositoryPath(command.source), target],
            {
              env: await gitAuthenticationEnvironment(command.source, credentials),
              timeout: 300_000,
            },
          )
        : await runRepositoryGit(target, [
            "init",
            `--initial-branch=${command.initialBranch}`,
            ".",
          ]);

    if (!result.ok) return result;

    return desktopSuccess(target);
  } catch (cause) {
    return { ok: false, error: classifyDesktopFailure(cause, "setupRepository") };
  } finally {
    if (target && ownsPreparation) {
      // Only an empty folder created by this operation can be removed after a failure.
      if (created && createdIdentity) {
        const entry = await lstat(target).catch(() => null);

        if (
          entry?.isDirectory() &&
          entry.dev === createdIdentity.dev &&
          entry.ino === createdIdentity.ino
        )
          await rmdir(target).catch(() => undefined);
      }

      preparing.delete(target);
    }
  }
}
