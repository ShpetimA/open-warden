import { execFile as nodeExecFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { promisify } from "node:util";

import type { ProviderConnectionSecret } from "../providerConnections";

const execFile = promisify(nodeExecFile);
const MAX_BUFFER = 32 * 1024 * 1024;
const GIT_TIMEOUT_MS = 120_000;

export const OPEN_WARDEN_REMOTE_PREFIX = "open-warden";

type GitExecutionOptions = {
  cwd?: string;
  allowFailure?: boolean;
  authHeader?: string;
};

export class GitCommandError extends Error {
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

function createGitBasicAuthHeader(username: string, password: string) {
  const credentials = Buffer.from(`${username}:${password}`, "utf8").toString("base64");
  return `Authorization: Basic ${credentials}`;
}

function createGitBearerAuthHeader(token: string) {
  return `Authorization: Bearer ${token}`;
}

export function createGitAuthHeaderFromConnection(connection: ProviderConnectionSecret) {
  if (connection.providerId === "github") {
    return createGitBasicAuthHeader("x-access-token", connection.token);
  }

  return createGitBearerAuthHeader(connection.token);
}

export async function runGit(
  args: string[],
  options: GitExecutionOptions = {},
): Promise<Buffer> {
  try {
    const { stdout } = await execFile("git", args, {
      cwd: options.cwd,
      encoding: "buffer",
      maxBuffer: MAX_BUFFER,
      timeout: GIT_TIMEOUT_MS,
      killSignal: "SIGKILL",
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0",
        GIT_ASKPASS: "echo",
        SSH_ASKPASS: "echo",
        GCM_INTERACTIVE: "never",
      },
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

    if (options.allowFailure) {
      throw commandError;
    }

    throw commandError;
  }
}

export async function runGitInRepo(
  repoPath: string,
  args: string[],
  options: Omit<GitExecutionOptions, "cwd"> = {},
) {
  ensureRepoPath(repoPath);

  const nextArgs = options.authHeader
    ? ["-c", `http.extraheader=${options.authHeader}`, ...args]
    : args;

  return runGit(nextArgs, {
    cwd: repoPath,
    allowFailure: options.allowFailure,
  });
}

export async function pathExists(targetPath: string) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}
