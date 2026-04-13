import { execFile as nodeExecFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import type {
  AddPullRequestCommentInput,
  ConnectProviderInput,
  GitProviderId,
  HostedRepoRef,
  ListPullRequestsInput,
  PullRequestChangedFile,
  PullRequestConversation,
  PullRequestIssueComment,
  PullRequestLocatorInput,
  PullRequestPage,
  PullRequestReviewThread,
  PreparePullRequestWorkspaceInput,
  PreparedPullRequestWorkspace,
  ProviderConnection,
  ReplyToPullRequestThreadInput,
  SetPullRequestThreadResolvedInput,
} from "../src/platform/desktop/contracts";
import {
  bitbucketAuthorLogin,
  bitbucketPullRequestPath,
  bitbucketRequest,
  bitbucketThreadRootDatabaseId,
  createBitbucketGitAuthHeaders,
  fetchBitbucketConversation,
  fetchBitbucketPullRequest,
  fetchBitbucketPullRequestFiles,
  fetchBitbucketPullRequestPatch,
  listBitbucketPullRequests,
  pickBitbucketCloneUrl,
  toBitbucketIssueComment,
  type BitbucketCommentResponse,
  type BitbucketUserResponse,
} from "./bitbucket-repo";
import {
  fetchGitHubIssueComments,
  fetchGitHubPullRequest,
  fetchGitHubPullRequestFiles,
  fetchGitHubPullRequestPatch,
  fetchGitHubReviewThreads,
  githubGraphqlRequest,
  githubJsonRequest,
  githubRequest,
  listGitHubPullRequests,
  toPullRequestDetail,
  toPullRequestIssueComment,
  type GitHubIssueCommentResponse,
  type GitHubPullRequestResponse,
  type GitHubUserResponse,
} from "./github-repo";
import {
  deleteProviderConnection,
  getProviderConnection,
  listProviderConnections as listStoredProviderConnections,
  saveProviderConnection,
} from "./providerConnections";
import type { ProviderConnectionSecret } from "./providerConnections";

const execFile = promisify(nodeExecFile);
const MAX_BUFFER = 32 * 1024 * 1024;
const GIT_TIMEOUT_MS = 120_000;
const OPEN_WARDEN_REMOTE_PREFIX = "open-warden";

type GitExecutionOptions = {
  cwd?: string;
  allowFailure?: boolean;
  authHeader?: string;
};

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

function toSafePathSegment(value: string) {
  return value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-");
}

function providerWebOrigin(providerId: GitProviderId) {
  switch (providerId) {
    case "github":
      return "https://github.com";
    case "gitlab":
      return "https://gitlab.com";
    case "bitbucket":
      return "https://bitbucket.org";
  }
}

function createGitBasicAuthHeader(username: string, password: string) {
  const credentials = Buffer.from(`${username}:${password}`, "utf8").toString("base64");
  return `Authorization: Basic ${credentials}`;
}

function createGitBearerAuthHeader(token: string) {
  return `Authorization: Bearer ${token}`;
}

function createGitAuthHeaderFromConnection(connection: ProviderConnectionSecret) {
  if (connection.providerId === "github") {
    return createGitBasicAuthHeader("x-access-token", connection.token);
  }

  return createGitBearerAuthHeader(connection.token);
}

async function runGit(
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

async function runGitInRepo(
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

async function pathExists(targetPath: string) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export function parseRemoteUrl(remoteUrl: string): Omit<HostedRepoRef, "remoteName"> | null {
  const trimmedUrl = remoteUrl.trim();
  if (!trimmedUrl) {
    return null;
  }

  const sshMatch = trimmedUrl.match(/^git@([^:]+):([^/]+)\/(.+?)(?:\.git)?$/i);
  if (sshMatch) {
    const [, host, owner, repo] = sshMatch;
    return hostedRepoFromParts(host, owner, repo, trimmedUrl);
  }

  const sshProtocolMatch = trimmedUrl.match(/^ssh:\/\/git@([^/]+)\/([^/]+)\/(.+?)(?:\.git)?$/i);
  if (sshProtocolMatch) {
    const [, host, owner, repo] = sshProtocolMatch;
    return hostedRepoFromParts(host, owner, repo, trimmedUrl);
  }

  try {
    const url = new URL(trimmedUrl);
    const segments = url.pathname.replace(/^\/+/, "").split("/").filter(Boolean);
    if (segments.length < 2) {
      return null;
    }

    const owner = segments[0] ?? "";
    const repo = segments[1]?.replace(/\.git$/i, "") ?? "";
    return hostedRepoFromParts(url.hostname, owner, repo, trimmedUrl);
  } catch {
    return null;
  }
}

function hostedRepoFromParts(
  host: string,
  owner: string,
  repo: string,
  remoteUrl: string,
): Omit<HostedRepoRef, "remoteName"> | null {
  const normalizedHost = host.toLowerCase();
  const providerId =
    normalizedHost === "github.com"
      ? "github"
      : normalizedHost === "gitlab.com"
        ? "gitlab"
        : normalizedHost === "bitbucket.org"
          ? "bitbucket"
          : null;

  if (!providerId || !owner || !repo) {
    return null;
  }

  return {
    providerId,
    owner,
    repo,
    remoteUrl,
    webUrl: `${providerWebOrigin(providerId)}/${owner}/${repo}`,
  };
}

async function readFetchRemoteUrl(repoPath: string, remoteName: string) {
  const output = await runGitInRepo(repoPath, ["remote", "get-url", remoteName], {
    allowFailure: false,
  });
  return output.toString("utf8").trim();
}

async function listRemoteNames(repoPath: string) {
  const output = await runGitInRepo(repoPath, ["remote"]);
  return output
    .toString("utf8")
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);
}

function sortRemoteNames(remoteNames: string[]) {
  const uniqueNames = [...new Set(remoteNames)];
  return uniqueNames.sort((left, right) => {
    if (left === "origin") return -1;
    if (right === "origin") return 1;
    return left.localeCompare(right);
  });
}

async function getPreferredHostedRepo(repoPath: string): Promise<HostedRepoRef | null> {
  const remoteNames = sortRemoteNames(await listRemoteNames(repoPath));

  for (const remoteName of remoteNames) {
    try {
      const remoteUrl = await readFetchRemoteUrl(repoPath, remoteName);
      const parsed = parseRemoteUrl(remoteUrl);
      if (!parsed) {
        continue;
      }

      return {
        ...parsed,
        remoteName,
      };
    } catch {
      continue;
    }
  }

  return null;
}

function parseOAuthScopes(headerValue: string | null) {
  if (!headerValue) {
    return [];
  }

  return headerValue
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function providerDisplayName(providerId: GitProviderId) {
  if (providerId === "github") return "GitHub";
  if (providerId === "gitlab") return "GitLab";
  return "Bitbucket";
}

function missingConnectionMessage(providerId: GitProviderId) {
  return `${providerDisplayName(providerId)} is not connected.`;
}

async function resolvePullRequestContext(input: PullRequestLocatorInput) {
  const hostedRepo = await resolveHostedRepo(input.repoPath);
  if (!hostedRepo) {
    throw new Error("No supported hosted repository was found for the selected repo.");
  }

  const connection = await getProviderConnection(hostedRepo.providerId);
  if (!connection) {
    throw new Error(missingConnectionMessage(hostedRepo.providerId));
  }

  return { hostedRepo, connection };
}

function openWardenRootPath() {
  return path.join(os.homedir(), ".open-warden");
}

function managedRepoRootPath(hostedRepo: HostedRepoRef) {
  return path.join(
    openWardenRootPath(),
    "repositories",
    hostedRepo.providerId,
    toSafePathSegment(hostedRepo.owner),
    toSafePathSegment(hostedRepo.repo),
  );
}

function managedSourceRepoPath(hostedRepo: HostedRepoRef) {
  return path.join(managedRepoRootPath(hostedRepo), "source");
}

function managedWorktreePath(hostedRepo: HostedRepoRef, pullRequestNumber: number) {
  return path.join(
    managedRepoRootPath(hostedRepo),
    "worktrees",
    `pr-${String(pullRequestNumber)}`,
  );
}

function managedRepoStatePath(hostedRepo: HostedRepoRef) {
  return path.join(managedRepoRootPath(hostedRepo), "state.json");
}

async function ensureManagedSourceRepo(hostedRepo: HostedRepoRef, remoteUrl: string) {
  const sourceRepoPath = managedSourceRepoPath(hostedRepo);
  const gitDirPath = path.join(sourceRepoPath, ".git");

  if (!(await pathExists(gitDirPath))) {
    await fs.mkdir(path.dirname(sourceRepoPath), { recursive: true });
    await runGit(["init", sourceRepoPath], {
      cwd: path.dirname(sourceRepoPath),
    });
  }

  try {
    await runGitInRepo(sourceRepoPath, ["remote", "set-url", "origin", remoteUrl]);
  } catch {
    await runGitInRepo(sourceRepoPath, ["remote", "add", "origin", remoteUrl]);
  }

  return sourceRepoPath;
}

async function fetchRemoteBranch(
  repoPath: string,
  remoteUrl: string,
  branchName: string,
  targetRef: string,
  authHeader: string,
) {
  await runGitInRepo(
    repoPath,
    ["fetch", "--force", remoteUrl, `+refs/heads/${branchName}:${targetRef}`],
    { authHeader },
  );
}

function isGitAuthFailure(error: unknown) {
  if (!(error instanceof GitCommandError)) {
    return false;
  }

  const stderr = error.stderr.toLowerCase();
  return (
    stderr.includes("authentication failed") ||
    stderr.includes("could not read username") ||
    stderr.includes("access denied") ||
    stderr.includes("invalid username or password") ||
    stderr.includes("forbidden")
  );
}

async function fetchRemoteBranchWithFallbackAuth(
  repoPath: string,
  remoteUrl: string,
  branchName: string,
  targetRef: string,
  authHeaders: string[],
) {
  let lastError: unknown = null;
  for (const authHeader of authHeaders) {
    try {
      await fetchRemoteBranch(repoPath, remoteUrl, branchName, targetRef, authHeader);
      return;
    } catch (error) {
      lastError = error;
      if (!isGitAuthFailure(error)) {
        throw error;
      }
    }
  }

  const detail =
    lastError instanceof Error && lastError.message.trim()
      ? lastError.message.trim()
      : "Bitbucket git authentication failed.";
  throw new Error(
    `${detail} Verify your Bitbucket credentials include repository read access, and reconnect using your Bitbucket username for app passwords.`,
  );
}

async function resolveMergeBase(repoPath: string, baseRef: string, headRef: string) {
  const output = await runGitInRepo(repoPath, ["merge-base", baseRef, headRef]);
  const mergeBase = output.toString("utf8").trim();
  if (!mergeBase) {
    throw new Error(`Could not resolve merge base for ${baseRef} and ${headRef}.`);
  }

  return mergeBase;
}

async function ensurePreparedWorktree(
  sourceRepoPath: string,
  worktreePath: string,
  localBranch: string,
  headRefShort: string,
) {
  const worktreeGitPath = path.join(worktreePath, ".git");
  const worktreeParentPath = path.dirname(worktreePath);

  await runGitInRepo(sourceRepoPath, ["worktree", "prune"]);

  if (await pathExists(worktreeGitPath)) {
    await runGitInRepo(worktreePath, ["checkout", "-B", localBranch, headRefShort]);
    await runGitInRepo(worktreePath, ["reset", "--hard", headRefShort]);
    await runGitInRepo(worktreePath, ["clean", "-fd"]);
    return;
  }

  if (await pathExists(worktreePath)) {
    await fs.rm(worktreePath, { recursive: true, force: true });
  }

  await fs.mkdir(worktreeParentPath, { recursive: true });
  await runGitInRepo(sourceRepoPath, [
    "worktree",
    "add",
    "--force",
    "-B",
    localBranch,
    worktreePath,
    headRefShort,
  ]);
}

async function ensurePreparedBranchCheckout(
  repoPath: string,
  localBranch: string,
  headRefShort: string,
) {
  await runGitInRepo(repoPath, ["checkout", "-B", localBranch, headRefShort]);
  await runGitInRepo(repoPath, ["reset", "--hard", headRefShort]);
  await runGitInRepo(repoPath, ["clean", "-fd"]);
}

async function writeManagedRepoState(
  preparedWorkspace: PreparedPullRequestWorkspace,
) {
  const normalizedPreparedWorkspace = normalizePreparedWorkspace(preparedWorkspace);
  const statePath = managedRepoStatePath(preparedWorkspace.hostedRepo);
  const existingWorkspaces = await readManagedRepoWorkspaces(preparedWorkspace.hostedRepo);
  const remainingWorkspaces = existingWorkspaces.filter(
    (workspace) =>
      path.resolve(workspace.worktreePath) !== path.resolve(normalizedPreparedWorkspace.worktreePath),
  );
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.writeFile(
    statePath,
    JSON.stringify(
      {
        providerId: preparedWorkspace.hostedRepo.providerId,
        owner: preparedWorkspace.hostedRepo.owner,
        repo: preparedWorkspace.hostedRepo.repo,
        updatedAt: new Date().toISOString(),
        workspaces: dedupePreparedWorkspaces([
          normalizedPreparedWorkspace,
          ...remainingWorkspaces,
        ]),
      },
      null,
      2,
    ),
    "utf8",
  );
}

type ManagedPullRequestWorkspaceState = {
  providerId: GitProviderId;
  owner: string;
  repo: string;
  updatedAt: string;
  workspaces: PreparedPullRequestWorkspace[];
};

function normalizePreparedWorkspace(workspace: PreparedPullRequestWorkspace): PreparedPullRequestWorkspace {
  const normalizedWorktreePath = path.resolve(workspace.worktreePath);
  return {
    ...workspace,
    repoPath: normalizedWorktreePath,
    worktreePath: normalizedWorktreePath,
  };
}

function toPreparedWorkspace(
  value: Partial<PreparedPullRequestWorkspace> | null | undefined,
  hostedRepo: HostedRepoRef,
): PreparedPullRequestWorkspace | null {
  if (!value) {
    return null;
  }

  if (
    value.providerId !== hostedRepo.providerId ||
    value.owner !== hostedRepo.owner ||
    value.repo !== hostedRepo.repo ||
    typeof value.pullRequestNumber !== "number" ||
    typeof value.title !== "string" ||
    typeof value.baseRef !== "string" ||
    typeof value.headRef !== "string" ||
    typeof value.compareBaseRef !== "string" ||
    typeof value.compareHeadRef !== "string" ||
    typeof value.localBranch !== "string" ||
    typeof value.worktreePath !== "string"
  ) {
    return null;
  }

  const normalizedWorktreePath = path.resolve(value.worktreePath);
  return {
    providerId: value.providerId,
    owner: value.owner,
    repo: value.repo,
    pullRequestNumber: value.pullRequestNumber,
    title: value.title,
    baseRef: value.baseRef,
    headRef: value.headRef,
    compareBaseRef: value.compareBaseRef,
    compareHeadRef: value.compareHeadRef,
    localBranch: value.localBranch,
    worktreePath: normalizedWorktreePath,
    repoPath: normalizedWorktreePath,
    hostedRepo,
  };
}

function dedupePreparedWorkspaces(workspaces: PreparedPullRequestWorkspace[]) {
  const seen = new Set<string>();
  const deduped: PreparedPullRequestWorkspace[] = [];
  for (const workspace of workspaces) {
    const key = path.resolve(workspace.worktreePath);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(normalizePreparedWorkspace(workspace));
  }

  return deduped;
}

async function readManagedRepoWorkspaces(hostedRepo: HostedRepoRef) {
  const statePath = managedRepoStatePath(hostedRepo);
  if (!(await pathExists(statePath))) {
    return [] as PreparedPullRequestWorkspace[];
  }

  try {
    const raw = await fs.readFile(statePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<ManagedPullRequestWorkspaceState> & {
      workspaces?: Array<Partial<PreparedPullRequestWorkspace>>;
    };
    if (
      parsed.providerId !== hostedRepo.providerId ||
      parsed.owner !== hostedRepo.owner ||
      parsed.repo !== hostedRepo.repo
    ) {
      return [] as PreparedPullRequestWorkspace[];
    }

    const workspaces = (parsed.workspaces ?? [])
      .map((workspace) => toPreparedWorkspace(workspace, hostedRepo))
      .filter((workspace): workspace is PreparedPullRequestWorkspace => workspace !== null);

    return dedupePreparedWorkspaces(workspaces);
  } catch {
    return [] as PreparedPullRequestWorkspace[];
  }
}

async function readManagedRepoState(hostedRepo: HostedRepoRef, worktreePath: string) {
  const resolvedWorktreePath = path.resolve(worktreePath);
  const workspaces = await readManagedRepoWorkspaces(hostedRepo);
  for (const workspace of workspaces) {
    if (path.resolve(workspace.worktreePath) === resolvedWorktreePath) {
      return workspace;
    }
  }

  return null;
}

async function resolveGitHubPullRequestContext(input: PullRequestLocatorInput) {
  const { hostedRepo, connection } = await resolvePullRequestContext(input);
  if (hostedRepo.providerId !== "github") {
    throw new Error(`Cannot use ${providerDisplayName(hostedRepo.providerId)} pull request data in GitHub flow.`);
  }

  return { hostedRepo, connection };
}

async function readPullRequestReviewThread(
  input: PullRequestLocatorInput,
  threadId: string,
) {
  const { hostedRepo, connection } = await resolveGitHubPullRequestContext(input);
  const threads = await fetchGitHubReviewThreads(hostedRepo, connection.token, input.pullRequestNumber);
  const thread = threads.find((value) => value.id === threadId);
  if (!thread) {
    throw new Error("The selected review thread could not be found.");
  }

  return { thread, hostedRepo, connection };
}

function normalizeOptionalIdentifier(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function connectGitHubProvider(input: ConnectProviderInput): Promise<ProviderConnection> {
  const token = input.token.trim();
  if (!token) {
    throw new Error("Token is required.");
  }

  const { data, headers } = await githubRequest<GitHubUserResponse>("/user", token);

  return saveProviderConnection({
    ...input,
    token,
    identifier: null,
    authType: "bearer",
    login: data.login,
    displayName: data.name,
    avatarUrl: data.avatar_url,
    scopes: parseOAuthScopes(headers.get("x-oauth-scopes")),
  });
}

async function connectBitbucketProvider(input: ConnectProviderInput): Promise<ProviderConnection> {
  const token = input.token.trim();
  if (!token) {
    throw new Error("Token or app password is required.");
  }

  const identifier = normalizeOptionalIdentifier(input.identifier);
  const authAttempts: Array<{ authType: "basic" | "bearer"; identifier: string | null }> = [];
  if (input.authType === "basic") {
    if (!identifier) {
      throw new Error("Bitbucket username/email is required for basic authentication.");
    }
    authAttempts.push({ authType: "basic", identifier });
  } else if (input.authType === "bearer") {
    authAttempts.push({ authType: "bearer", identifier: null });
  } else {
    if (identifier) {
      authAttempts.push({ authType: "basic", identifier });
    }
    authAttempts.push({ authType: "bearer", identifier: null });
  }

  let lastError: unknown = null;
  for (const attempt of authAttempts) {
    try {
      const { data, headers } = await bitbucketRequest<BitbucketUserResponse>("/user", {
        token,
        authType: attempt.authType,
        identifier: attempt.identifier,
      });
      const login = bitbucketAuthorLogin(data) || "bitbucket-user";
      const displayName = data.display_name ?? null;
      const avatarUrl = data.links?.avatar?.href ?? null;
      const persistedIdentifier =
        attempt.authType === "basic" ? attempt.identifier ?? null : null;
      return saveProviderConnection({
        ...input,
        token,
        identifier: persistedIdentifier,
        authType: attempt.authType,
        login,
        displayName,
        avatarUrl,
        scopes: parseOAuthScopes(headers.get("x-oauth-scopes")),
      });
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Failed to validate Bitbucket credentials.");
}

export async function listProviderConnections(): Promise<ProviderConnection[]> {
  return listStoredProviderConnections();
}

export async function connectProvider(input: ConnectProviderInput): Promise<ProviderConnection> {
  if (input.providerId === "github") {
    return connectGitHubProvider(input);
  }

  if (input.providerId === "bitbucket") {
    return connectBitbucketProvider(input);
  }

  throw new Error(`${providerDisplayName(input.providerId)} connections are not supported yet.`);
}

export async function disconnectProvider(providerId: GitProviderId): Promise<void> {
  await deleteProviderConnection(providerId);
}

export async function resolveHostedRepo(repoPath: string): Promise<HostedRepoRef | null> {
  return getPreferredHostedRepo(repoPath);
}

export async function resolvePullRequestWorkspace(
  repoPath: string,
): Promise<PreparedPullRequestWorkspace | null> {
  const hostedRepo = await resolveHostedRepo(repoPath);
  if (!hostedRepo) {
    return null;
  }

  const state = await readManagedRepoState(hostedRepo, repoPath);
  if (!state) {
    return null;
  }

  return state;
}

export async function listPullRequests(input: ListPullRequestsInput): Promise<PullRequestPage> {
  const hostedRepo = await resolveHostedRepo(input.repoPath);
  if (!hostedRepo) {
    return {
      pullRequests: [],
      page: input.page,
      perPage: input.perPage,
      hasNextPage: false,
    };
  }

  const connection = await getProviderConnection(hostedRepo.providerId);
  if (!connection) {
    throw new Error(missingConnectionMessage(hostedRepo.providerId));
  }

  if (hostedRepo.providerId === "github") {
    return listGitHubPullRequests(hostedRepo, connection.token, input.page, input.perPage);
  }

  if (hostedRepo.providerId === "bitbucket") {
    return listBitbucketPullRequests(hostedRepo, connection, input.page, input.perPage);
  }

  throw new Error(`${providerDisplayName(hostedRepo.providerId)} pull request listing is not supported yet.`);
}

export async function getPullRequestConversation(
  input: PullRequestLocatorInput,
): Promise<PullRequestConversation> {
  const { hostedRepo, connection } = await resolvePullRequestContext(input);

  if (hostedRepo.providerId === "github") {
    const [pullRequest, issueComments, reviewThreads] = await Promise.all([
      fetchGitHubPullRequest(hostedRepo, connection.token, input.pullRequestNumber),
      fetchGitHubIssueComments(hostedRepo, connection.token, input.pullRequestNumber),
      fetchGitHubReviewThreads(hostedRepo, connection.token, input.pullRequestNumber),
    ]);

    return {
      detail: toPullRequestDetail(pullRequest, hostedRepo.providerId),
      issueComments,
      reviewThreads,
    };
  }

  if (hostedRepo.providerId === "bitbucket") {
    return fetchBitbucketConversation(hostedRepo, connection, input.pullRequestNumber);
  }

  throw new Error(
    `${providerDisplayName(hostedRepo.providerId)} pull request conversation is not supported yet.`,
  );
}

export async function getPullRequestFiles(
  input: PullRequestLocatorInput,
): Promise<PullRequestChangedFile[]> {
  const { hostedRepo, connection } = await resolvePullRequestContext(input);

  if (hostedRepo.providerId === "github") {
    return fetchGitHubPullRequestFiles(hostedRepo, connection.token, input.pullRequestNumber);
  }

  if (hostedRepo.providerId === "bitbucket") {
    return fetchBitbucketPullRequestFiles(hostedRepo, connection, input.pullRequestNumber);
  }

  throw new Error(
    `${providerDisplayName(hostedRepo.providerId)} pull request files are not supported yet.`,
  );
}

export async function getPullRequestPatch(input: PullRequestLocatorInput): Promise<string> {
  const { hostedRepo, connection } = await resolvePullRequestContext(input);

  if (hostedRepo.providerId === "github") {
    return fetchGitHubPullRequestPatch(hostedRepo, connection.token, input.pullRequestNumber);
  }

  if (hostedRepo.providerId === "bitbucket") {
    return fetchBitbucketPullRequestPatch(hostedRepo, connection, input.pullRequestNumber);
  }

  throw new Error(
    `${providerDisplayName(hostedRepo.providerId)} pull request patches are not supported yet.`,
  );
}

export async function addPullRequestComment(
  input: AddPullRequestCommentInput,
): Promise<PullRequestIssueComment> {
  const trimmedBody = input.body.trim();
  if (!trimmedBody) {
    throw new Error("Comment body cannot be empty.");
  }

  const { hostedRepo, connection } = await resolvePullRequestContext(input);

  if (hostedRepo.providerId === "github") {
    const response = await githubJsonRequest<GitHubIssueCommentResponse>(
      `/repos/${encodeURIComponent(hostedRepo.owner)}/${encodeURIComponent(hostedRepo.repo)}/issues/${String(input.pullRequestNumber)}/comments`,
      connection.token,
      {
        method: "POST",
        body: { body: trimmedBody },
      },
    );

    return toPullRequestIssueComment(response);
  }

  if (hostedRepo.providerId === "bitbucket") {
    const { data } = await bitbucketRequest<BitbucketCommentResponse>(
      `${bitbucketPullRequestPath(hostedRepo, input.pullRequestNumber)}/comments`,
      connection,
      {
        method: "POST",
        body: { content: { raw: trimmedBody } },
      },
    );

    return toBitbucketIssueComment(data);
  }

  throw new Error(`${providerDisplayName(hostedRepo.providerId)} comments are not supported yet.`);
}

export async function replyToPullRequestThread(
  input: ReplyToPullRequestThreadInput,
): Promise<PullRequestReviewThread> {
  const trimmedBody = input.body.trim();
  if (!trimmedBody) {
    throw new Error("Reply body cannot be empty.");
  }

  const { hostedRepo, connection } = await resolvePullRequestContext(input);
  if (hostedRepo.providerId === "github") {
    const { thread } = await readPullRequestReviewThread(input, input.threadId);
    const replyTargetId = thread.comments[thread.comments.length - 1]?.databaseId;
    if (!replyTargetId) {
      throw new Error("The selected review thread does not contain a reply target.");
    }

    await githubJsonRequest(
      `/repos/${encodeURIComponent(hostedRepo.owner)}/${encodeURIComponent(hostedRepo.repo)}/pulls/${String(input.pullRequestNumber)}/comments/${String(replyTargetId)}/replies`,
      connection.token,
      {
        method: "POST",
        body: { body: trimmedBody },
      },
    );

    const threads = await fetchGitHubReviewThreads(
      hostedRepo,
      connection.token,
      input.pullRequestNumber,
    );
    const refreshedThread = threads.find((value) => value.id === input.threadId);
    if (!refreshedThread) {
      throw new Error("The updated review thread could not be loaded.");
    }

    return refreshedThread;
  }

  if (hostedRepo.providerId === "bitbucket") {
    const currentConversation = await fetchBitbucketConversation(
      hostedRepo,
      connection,
      input.pullRequestNumber,
    );
    const existingThread = currentConversation.reviewThreads.find(
      (thread) => thread.id === input.threadId,
    );
    if (!existingThread) {
      throw new Error("The selected review thread could not be found.");
    }

    const rootId = bitbucketThreadRootDatabaseId(input.threadId);
    const replyTargetId =
      existingThread.comments[existingThread.comments.length - 1]?.databaseId ?? rootId;
    if (!replyTargetId) {
      throw new Error("The selected review thread does not contain a reply target.");
    }

    await bitbucketRequest<BitbucketCommentResponse>(
      `${bitbucketPullRequestPath(hostedRepo, input.pullRequestNumber)}/comments`,
      connection,
      {
        method: "POST",
        body: {
          content: { raw: trimmedBody },
          parent: { id: replyTargetId },
        },
      },
    );

    const refreshedConversation = await fetchBitbucketConversation(
      hostedRepo,
      connection,
      input.pullRequestNumber,
    );
    const refreshedThread = refreshedConversation.reviewThreads.find(
      (thread) => thread.id === input.threadId,
    );
    if (!refreshedThread) {
      throw new Error("The updated review thread could not be loaded.");
    }

    return refreshedThread;
  }

  throw new Error(`${providerDisplayName(hostedRepo.providerId)} thread replies are not supported yet.`);
}

export async function setPullRequestThreadResolved(
  input: SetPullRequestThreadResolvedInput,
): Promise<PullRequestReviewThread> {
  const { hostedRepo, connection } = await resolvePullRequestContext(input);
  if (hostedRepo.providerId === "github") {
    await githubGraphqlRequest(
      connection.token,
      input.resolved
        ? `
          mutation($threadId: ID!) {
            resolveReviewThread(input: { threadId: $threadId }) {
              thread { id isResolved }
            }
          }
        `
        : `
          mutation($threadId: ID!) {
            unresolveReviewThread(input: { threadId: $threadId }) {
              thread { id isResolved }
            }
          }
        `,
      {
        threadId: input.threadId,
      },
    );

    const threads = await fetchGitHubReviewThreads(
      hostedRepo,
      connection.token,
      input.pullRequestNumber,
    );
    const refreshedThread = threads.find((value) => value.id === input.threadId);
    if (!refreshedThread) {
      throw new Error("The updated review thread could not be loaded.");
    }

    return refreshedThread;
  }

  if (hostedRepo.providerId === "bitbucket") {
    const rootCommentId = bitbucketThreadRootDatabaseId(input.threadId);
    if (!rootCommentId) {
      throw new Error("The selected Bitbucket thread could not be resolved.");
    }

    await bitbucketRequest<unknown>(
      `${bitbucketPullRequestPath(
        hostedRepo,
        input.pullRequestNumber,
      )}/comments/${String(rootCommentId)}/resolve`,
      connection,
      {
        method: input.resolved ? "POST" : "DELETE",
        responseType: "text",
      },
    );

    const refreshedConversation = await fetchBitbucketConversation(
      hostedRepo,
      connection,
      input.pullRequestNumber,
    );
    const refreshedThread = refreshedConversation.reviewThreads.find(
      (thread) => thread.id === input.threadId,
    );
    if (!refreshedThread) {
      throw new Error("The updated review thread could not be loaded.");
    }

    return refreshedThread;
  }

  throw new Error(
    `${providerDisplayName(hostedRepo.providerId)} thread resolution is not supported yet.`,
  );
}

export async function preparePullRequestWorkspace(
  input: PreparePullRequestWorkspaceInput,
): Promise<PreparedPullRequestWorkspace> {
  const openMode = input.openMode ?? "worktree";
  const hostedRepo = await resolveHostedRepo(input.repoPath);
  if (!hostedRepo) {
    throw new Error("No supported hosted repository was found for the selected repo.");
  }

  const connection = await getProviderConnection(hostedRepo.providerId);
  if (!connection) {
    throw new Error(missingConnectionMessage(hostedRepo.providerId));
  }

  const authHeader = createGitAuthHeaderFromConnection(connection);
  if (hostedRepo.providerId === "github") {
    const { data: pullRequest } = await githubRequest<GitHubPullRequestResponse>(
      `/repos/${encodeURIComponent(hostedRepo.owner)}/${encodeURIComponent(hostedRepo.repo)}/pulls/${String(input.pullRequestNumber)}`,
      connection.token,
    );

    const baseRepo = pullRequest.base.repo;
    const headRepo = pullRequest.head.repo;
    if (!headRepo) {
      throw new Error("This pull request no longer has an accessible head repository.");
    }

    const sourceRepoPath =
      openMode === "branch"
        ? input.repoPath
        : await ensureManagedSourceRepo(hostedRepo, baseRepo.clone_url);
    const baseRefFull = `refs/remotes/${OPEN_WARDEN_REMOTE_PREFIX}/base/pr-${String(pullRequest.number)}`;
    const headRefFull = `refs/remotes/${OPEN_WARDEN_REMOTE_PREFIX}/head/pr-${String(pullRequest.number)}`;
    const baseRefShort = `${OPEN_WARDEN_REMOTE_PREFIX}/base/pr-${String(pullRequest.number)}`;
    const headRefShort = `${OPEN_WARDEN_REMOTE_PREFIX}/head/pr-${String(pullRequest.number)}`;
    const localBranch = `${OPEN_WARDEN_REMOTE_PREFIX}/pr-${String(pullRequest.number)}`;
    const worktreePath =
      openMode === "branch"
        ? path.resolve(input.repoPath)
        : managedWorktreePath(hostedRepo, pullRequest.number);

    await fetchRemoteBranch(
      sourceRepoPath,
      baseRepo.clone_url,
      pullRequest.base.ref,
      baseRefFull,
      authHeader,
    );
    await fetchRemoteBranch(
      sourceRepoPath,
      headRepo.clone_url,
      pullRequest.head.ref,
      headRefFull,
      authHeader,
    );
    const compareBaseRef = await resolveMergeBase(sourceRepoPath, baseRefShort, headRefShort);
    const compareHeadRef = headRefShort;
    if (openMode === "branch") {
      await ensurePreparedBranchCheckout(input.repoPath, localBranch, headRefShort);
    } else {
      await ensurePreparedWorktree(sourceRepoPath, worktreePath, localBranch, headRefShort);
    }
    const preparedWorkspace: PreparedPullRequestWorkspace = {
      providerId: hostedRepo.providerId,
      repoPath: worktreePath,
      worktreePath,
      owner: hostedRepo.owner,
      repo: hostedRepo.repo,
      pullRequestNumber: pullRequest.number,
      title: pullRequest.title,
      baseRef: pullRequest.base.ref,
      headRef: pullRequest.head.ref,
      compareBaseRef,
      compareHeadRef,
      localBranch,
      hostedRepo,
    };

    await writeManagedRepoState(preparedWorkspace);
    return preparedWorkspace;
  }

  if (hostedRepo.providerId === "bitbucket") {
    const pullRequest = await fetchBitbucketPullRequest(
      hostedRepo,
      connection,
      input.pullRequestNumber,
    );
    const pullRequestNumber = pullRequest.id;
    const baseRef = pullRequest.destination?.branch?.name?.trim() ?? "";
    const headRef = pullRequest.source?.branch?.name?.trim() ?? "";
    if (!baseRef || !headRef) {
      throw new Error("The Bitbucket pull request is missing source or destination branch data.");
    }

    const baseRepo = pullRequest.destination?.repository ?? null;
    const headRepo = pullRequest.source?.repository ?? pullRequest.destination?.repository ?? null;
    const baseCloneUrl = pickBitbucketCloneUrl(baseRepo, hostedRepo.owner, hostedRepo.repo);
    const headCloneUrl = pickBitbucketCloneUrl(headRepo, hostedRepo.owner, hostedRepo.repo);

    const sourceRepoPath =
      openMode === "branch"
        ? input.repoPath
        : await ensureManagedSourceRepo(hostedRepo, baseCloneUrl);
    const baseRefFull = `refs/remotes/${OPEN_WARDEN_REMOTE_PREFIX}/base/pr-${String(pullRequestNumber)}`;
    const headRefFull = `refs/remotes/${OPEN_WARDEN_REMOTE_PREFIX}/head/pr-${String(pullRequestNumber)}`;
    const baseRefShort = `${OPEN_WARDEN_REMOTE_PREFIX}/base/pr-${String(pullRequestNumber)}`;
    const headRefShort = `${OPEN_WARDEN_REMOTE_PREFIX}/head/pr-${String(pullRequestNumber)}`;
    const localBranch = `${OPEN_WARDEN_REMOTE_PREFIX}/pr-${String(pullRequestNumber)}`;
    const worktreePath =
      openMode === "branch"
        ? path.resolve(input.repoPath)
        : managedWorktreePath(hostedRepo, pullRequestNumber);
    const authHeaders = createBitbucketGitAuthHeaders(connection);
    await fetchRemoteBranchWithFallbackAuth(
      sourceRepoPath,
      baseCloneUrl,
      baseRef,
      baseRefFull,
      authHeaders,
    );
    await fetchRemoteBranchWithFallbackAuth(
      sourceRepoPath,
      headCloneUrl,
      headRef,
      headRefFull,
      authHeaders,
    );

    const compareBaseRef = await resolveMergeBase(sourceRepoPath, baseRefShort, headRefShort);
    const compareHeadRef = headRefShort;
    if (openMode === "branch") {
      await ensurePreparedBranchCheckout(input.repoPath, localBranch, headRefShort);
    } else {
      await ensurePreparedWorktree(sourceRepoPath, worktreePath, localBranch, headRefShort);
    }
    const preparedWorkspace: PreparedPullRequestWorkspace = {
      providerId: hostedRepo.providerId,
      repoPath: worktreePath,
      worktreePath,
      owner: hostedRepo.owner,
      repo: hostedRepo.repo,
      pullRequestNumber,
      title: pullRequest.title ?? `Pull request #${String(pullRequestNumber)}`,
      baseRef,
      headRef,
      compareBaseRef,
      compareHeadRef,
      localBranch,
      hostedRepo,
    };

    await writeManagedRepoState(preparedWorkspace);
    return preparedWorkspace;
  }

  throw new Error(`${providerDisplayName(hostedRepo.providerId)} review workspaces are not supported yet.`);
}
