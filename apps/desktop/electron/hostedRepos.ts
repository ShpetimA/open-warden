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
  PullRequestConversation,
  PullRequestDetail,
  PullRequestIssueComment,
  PullRequestLocatorInput,
  PullRequestPerson,
  PullRequestReviewComment,
  PullRequestReviewThread,
  PreparePullRequestWorkspaceInput,
  PreparedPullRequestWorkspace,
  ProviderConnection,
  PullRequestSummary,
  PullRequestState,
  ReplyToPullRequestThreadInput,
  SetPullRequestThreadResolvedInput,
} from "../src/platform/desktop/contracts";
import {
  deleteProviderConnection,
  getProviderConnection,
  listProviderConnections as listStoredProviderConnections,
  saveProviderConnection,
} from "./providerConnections";

const execFile = promisify(nodeExecFile);
const MAX_BUFFER = 32 * 1024 * 1024;
const GIT_TIMEOUT_MS = 120_000;
const OPEN_WARDEN_REMOTE_PREFIX = "open-warden";

type GitExecutionOptions = {
  cwd?: string;
  allowFailure?: boolean;
  authToken?: string;
};

type GitHubUserResponse = {
  login: string;
  name: string | null;
  avatar_url: string | null;
};

type GitHubRepoSummary = {
  clone_url: string;
  html_url: string;
  name: string;
  owner: {
    login: string;
  };
};

type GitHubPullRequestResponse = {
  id: number;
  number: number;
  title: string;
  draft: boolean;
  state: "open" | "closed";
  merged_at: string | null;
  html_url: string;
  updated_at: string;
  user: {
    login: string;
    name?: string | null;
  } | null;
  base: {
    ref: string;
    sha: string;
    repo: GitHubRepoSummary;
  };
  head: {
    ref: string;
    sha: string;
    repo: GitHubRepoSummary | null;
  };
  body?: string | null;
  created_at: string;
};

type GitHubIssueCommentResponse = {
  id: number;
  body: string;
  created_at: string;
  updated_at: string;
  html_url: string | null;
  user: {
    login: string;
    avatar_url: string | null;
  } | null;
};

type GitHubReviewThreadGraphResponse = {
  data?: {
    repository?: {
      pullRequest?: {
        reviewThreads?: {
          nodes?: Array<{
            id: string;
            isResolved: boolean;
            isOutdated: boolean;
            path: string;
            line: number | null;
            startLine: number | null;
            diffSide: "LEFT" | "RIGHT" | null;
            resolvedBy: {
              login: string;
              avatarUrl: string | null;
            } | null;
              comments?: {
                nodes?: Array<{
                  id: string;
                  databaseId: number;
                  body: string;
                  createdAt: string;
                  updatedAt?: string | null;
                  path: string;
                  line: number | null;
                  startLine: number | null;
                  url?: string | null;
                  author: {
                    login: string;
                    avatarUrl: string | null;
                } | null;
              }>;
            };
          }>;
        };
      };
    };
  };
  errors?: Array<{ message: string }>;
};

type GitHubReviewThreadNode = NonNullable<
  NonNullable<
    NonNullable<
      NonNullable<
        NonNullable<GitHubReviewThreadGraphResponse["data"]>["repository"]
      >["pullRequest"]
    >["reviewThreads"]
  >["nodes"]
>[number];

type GitHubReviewThreadCommentNode = NonNullable<
  NonNullable<GitHubReviewThreadNode["comments"]>["nodes"]
>[number];

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

function createGitHttpExtraHeader(token: string) {
  const credentials = Buffer.from(`x-access-token:${token}`, "utf8").toString("base64");
  return `AUTHORIZATION: basic ${credentials}`;
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

  const nextArgs = options.authToken
    ? ["-c", `http.extraheader=${createGitHttpExtraHeader(options.authToken)}`, ...args]
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

async function githubRequest<T>(pathname: string, token: string) {
  const response = await fetch(`https://api.github.com${pathname}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "open-warden",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `GitHub request failed with status ${response.status}`);
  }

  return {
    data: (await response.json()) as T,
    headers: response.headers,
  };
}

function githubPermissionErrorHint(message: string) {
  if (message.includes("Resource not accessible by personal access token")) {
    return "Your GitHub token cannot create pull request comments. Reconnect with Issues: write or Pull requests: write permissions for this repository.";
  }

  return null;
}

function parseGitHubErrorMessage(text: string, status: number) {
  try {
    const payload = JSON.parse(text) as {
      message?: unknown;
      documentation_url?: unknown;
      status?: unknown;
    };
    const message =
      typeof payload.message === "string" && payload.message.trim()
        ? payload.message
        : `GitHub request failed with status ${status}`;
    const hint = githubPermissionErrorHint(message);
    return hint ? `${message}. ${hint}` : message;
  } catch {
    const fallback = text.trim() || `GitHub request failed with status ${status}`;
    const hint = githubPermissionErrorHint(fallback);
    return hint ? `${fallback}. ${hint}` : fallback;
  }
}

async function githubJsonRequest<T>(
  pathname: string,
  token: string,
  init?: {
    method?: "GET" | "POST";
    body?: unknown;
  },
) {
  const response = await fetch(`https://api.github.com${pathname}`, {
    method: init?.method ?? "GET",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "open-warden",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(parseGitHubErrorMessage(message, response.status));
  }

  return (await response.json()) as T;
}

async function githubGraphqlRequest<T>(token: string, query: string, variables: Record<string, unknown>) {
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "open-warden",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({
      query,
      variables,
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(parseGitHubErrorMessage(message, response.status));
  }

  const payload = (await response.json()) as T & { errors?: Array<{ message: string }> };
  if (Array.isArray(payload.errors) && payload.errors.length > 0) {
    throw new Error(payload.errors[0]?.message ?? "GitHub GraphQL request failed.");
  }

  return payload;
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

function mapGitHubPullRequestState(pullRequest: GitHubPullRequestResponse): PullRequestState {
  if (pullRequest.merged_at) {
    return "merged";
  }

  return pullRequest.state;
}

function toPullRequestSummary(
  pullRequest: GitHubPullRequestResponse,
  providerId: GitProviderId,
): PullRequestSummary {
  return {
    id: `${providerId}:${pullRequest.number}`,
    providerId,
    number: pullRequest.number,
    title: pullRequest.title,
    state: mapGitHubPullRequestState(pullRequest),
    isDraft: pullRequest.draft,
    authorLogin: pullRequest.user?.login ?? "unknown",
    authorDisplayName: pullRequest.user?.name ?? null,
    url: pullRequest.html_url,
    baseRef: pullRequest.base.ref,
    headRef: pullRequest.head.ref,
    headOwner: pullRequest.head.repo?.owner.login ?? pullRequest.base.repo.owner.login,
    headRepo: pullRequest.head.repo?.name ?? pullRequest.base.repo.name,
    updatedAt: pullRequest.updated_at,
  };
}

function toPullRequestPerson(user: {
  login: string;
  avatar_url?: string | null;
  avatarUrl?: string | null;
  name?: string | null;
} | null): PullRequestPerson | null {
  if (!user) {
    return null;
  }

  return {
    login: user.login,
    displayName: user.name ?? null,
    avatarUrl: user.avatar_url ?? user.avatarUrl ?? null,
  };
}

function toPullRequestDetail(
  pullRequest: GitHubPullRequestResponse,
  providerId: GitProviderId,
): PullRequestDetail {
  return {
    id: `${providerId}:${String(pullRequest.number)}`,
    providerId,
    number: pullRequest.number,
    title: pullRequest.title,
    body: pullRequest.body ?? "",
    state: mapGitHubPullRequestState(pullRequest),
    isDraft: pullRequest.draft,
    url: pullRequest.html_url,
    author: toPullRequestPerson(pullRequest.user),
    baseRef: pullRequest.base.ref,
    headRef: pullRequest.head.ref,
    baseSha: pullRequest.base.sha,
    headSha: pullRequest.head.sha,
    createdAt: pullRequest.created_at,
    updatedAt: pullRequest.updated_at,
  };
}

function toPullRequestIssueComment(
  comment: GitHubIssueCommentResponse,
): PullRequestIssueComment {
  return {
    id: `issue-comment:${String(comment.id)}`,
    databaseId: comment.id,
    body: comment.body ?? "",
    createdAt: comment.created_at,
    updatedAt: comment.updated_at,
    author: toPullRequestPerson(comment.user),
    url: comment.html_url,
  };
}

function toPullRequestReviewThread(thread: GitHubReviewThreadNode): PullRequestReviewThread {
  return {
    id: thread.id,
    path: thread.path,
    line: thread.line ?? null,
    startLine: thread.startLine ?? null,
    diffSide: thread.diffSide ?? "RIGHT",
    isResolved: thread.isResolved,
    isOutdated: thread.isOutdated,
    resolvedBy: toPullRequestPerson(thread.resolvedBy),
      comments: (thread.comments?.nodes ?? []).map<PullRequestReviewComment>(
        (comment: GitHubReviewThreadCommentNode) => ({
          id: comment.id,
          databaseId: comment.databaseId,
          body: comment.body ?? "",
          createdAt: comment.createdAt,
          updatedAt: comment.updatedAt ?? comment.createdAt,
          author: toPullRequestPerson(comment.author),
          path: comment.path,
          line: comment.line ?? null,
          startLine: comment.startLine ?? null,
          url: comment.url ?? null,
        }),
      ),
    };
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
  token: string,
) {
  await runGitInRepo(
    repoPath,
    ["fetch", "--force", remoteUrl, `+refs/heads/${branchName}:${targetRef}`],
    { authToken: token },
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

async function writeManagedRepoState(
  preparedWorkspace: PreparedPullRequestWorkspace,
) {
  const existingWorkspaces = await readManagedRepoWorkspaces(preparedWorkspace.hostedRepo);
  const normalizedPreparedWorkspace = normalizePreparedWorkspace(preparedWorkspace);
  const mergedWorkspaces = [
    normalizedPreparedWorkspace,
    ...existingWorkspaces.filter(
      (workspace) => path.resolve(workspace.worktreePath) !== normalizedPreparedWorkspace.worktreePath,
    ),
  ];
  const statePath = managedRepoStatePath(preparedWorkspace.hostedRepo);
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.writeFile(
    statePath,
    JSON.stringify(
      {
        providerId: preparedWorkspace.hostedRepo.providerId,
        owner: preparedWorkspace.hostedRepo.owner,
        repo: preparedWorkspace.hostedRepo.repo,
        updatedAt: new Date().toISOString(),
        workspaces: mergedWorkspaces,
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
  const hostedRepo = await resolveHostedRepo(input.repoPath);
  if (!hostedRepo) {
    throw new Error("No supported hosted repository was found for the selected repo.");
  }

  if (hostedRepo.providerId !== "github") {
    throw new Error(`${hostedRepo.providerId} pull request review is not supported yet.`);
  }

  const connection = await getProviderConnection(hostedRepo.providerId);
  if (!connection) {
    throw new Error("GitHub is not connected.");
  }

  return { hostedRepo, connection };
}

async function fetchGitHubPullRequest(
  hostedRepo: HostedRepoRef,
  token: string,
  pullRequestNumber: number,
) {
  const { data } = await githubRequest<GitHubPullRequestResponse>(
    `/repos/${encodeURIComponent(hostedRepo.owner)}/${encodeURIComponent(hostedRepo.repo)}/pulls/${String(pullRequestNumber)}`,
    token,
  );

  return data;
}

async function fetchGitHubIssueComments(
  hostedRepo: HostedRepoRef,
  token: string,
  pullRequestNumber: number,
) {
  const comments = await githubJsonRequest<GitHubIssueCommentResponse[]>(
    `/repos/${encodeURIComponent(hostedRepo.owner)}/${encodeURIComponent(hostedRepo.repo)}/issues/${String(pullRequestNumber)}/comments?per_page=100`,
    token,
  );

  return comments.map(toPullRequestIssueComment).sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt),
  );
}

async function fetchGitHubReviewThreads(
  hostedRepo: HostedRepoRef,
  token: string,
  pullRequestNumber: number,
) {
  const query = `
    query($owner: String!, $repo: String!, $number: Int!) {
      repository(owner: $owner, name: $repo) {
        pullRequest(number: $number) {
          reviewThreads(first: 100) {
            nodes {
              id
              isResolved
              isOutdated
              path
              line
              startLine
              diffSide
              resolvedBy {
                login
                avatarUrl
              }
              comments(first: 30) {
                nodes {
                  id
                  databaseId
                  body
                  createdAt
                  updatedAt
                  path
                  line
                  startLine
                  url
                  author {
                    login
                    avatarUrl
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  const payload = await githubGraphqlRequest<GitHubReviewThreadGraphResponse>(
    token,
    query,
    {
      owner: hostedRepo.owner,
      repo: hostedRepo.repo,
      number: pullRequestNumber,
    },
  );

  const nodes = payload.data?.repository?.pullRequest?.reviewThreads?.nodes ?? [];
  return nodes
    .map(toPullRequestReviewThread)
    .sort((left, right) => {
      const leftCreatedAt = left.comments[0]?.createdAt ?? "";
      const rightCreatedAt = right.comments[0]?.createdAt ?? "";
      return leftCreatedAt.localeCompare(rightCreatedAt);
    });
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

export async function listProviderConnections(): Promise<ProviderConnection[]> {
  return listStoredProviderConnections();
}

export async function connectProvider(input: ConnectProviderInput): Promise<ProviderConnection> {
  if (input.providerId !== "github") {
    throw new Error(`${input.providerId} connections are not supported yet.`);
  }

  const { data, headers } = await githubRequest<GitHubUserResponse>("/user", input.token);

  return saveProviderConnection({
    ...input,
    login: data.login,
    displayName: data.name,
    avatarUrl: data.avatar_url,
    scopes: parseOAuthScopes(headers.get("x-oauth-scopes")),
  });
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

export async function listPullRequests(repoPath: string): Promise<PullRequestSummary[]> {
  const hostedRepo = await resolveHostedRepo(repoPath);
  if (!hostedRepo) {
    return [];
  }

  if (hostedRepo.providerId !== "github") {
    throw new Error(`${hostedRepo.providerId} pull request listing is not supported yet.`);
  }

  const connection = await getProviderConnection(hostedRepo.providerId);
  if (!connection) {
    throw new Error("GitHub is not connected.");
  }

  const { data } = await githubRequest<GitHubPullRequestResponse[]>(
    `/repos/${encodeURIComponent(hostedRepo.owner)}/${encodeURIComponent(hostedRepo.repo)}/pulls?state=open&per_page=50`,
    connection.token,
  );

  return data
    .map((pullRequest) => toPullRequestSummary(pullRequest, hostedRepo.providerId))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function getPullRequestConversation(
  input: PullRequestLocatorInput,
): Promise<PullRequestConversation> {
  const { hostedRepo, connection } = await resolveGitHubPullRequestContext(input);
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

export async function addPullRequestComment(
  input: AddPullRequestCommentInput,
): Promise<PullRequestIssueComment> {
  const { hostedRepo, connection } = await resolveGitHubPullRequestContext(input);
  const trimmedBody = input.body.trim();
  if (!trimmedBody) {
    throw new Error("Comment body cannot be empty.");
  }

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

export async function replyToPullRequestThread(
  input: ReplyToPullRequestThreadInput,
): Promise<PullRequestReviewThread> {
  const trimmedBody = input.body.trim();
  if (!trimmedBody) {
    throw new Error("Reply body cannot be empty.");
  }

  const { thread, hostedRepo, connection } = await readPullRequestReviewThread(input, input.threadId);
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

  const threads = await fetchGitHubReviewThreads(hostedRepo, connection.token, input.pullRequestNumber);
  const refreshedThread = threads.find((value) => value.id === input.threadId);
  if (!refreshedThread) {
    throw new Error("The updated review thread could not be loaded.");
  }

  return refreshedThread;
}

export async function setPullRequestThreadResolved(
  input: SetPullRequestThreadResolvedInput,
): Promise<PullRequestReviewThread> {
  const { hostedRepo, connection } = await resolveGitHubPullRequestContext(input);

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

  const threads = await fetchGitHubReviewThreads(hostedRepo, connection.token, input.pullRequestNumber);
  const refreshedThread = threads.find((value) => value.id === input.threadId);
  if (!refreshedThread) {
    throw new Error("The updated review thread could not be loaded.");
  }

  return refreshedThread;
}

export async function preparePullRequestWorkspace(
  input: PreparePullRequestWorkspaceInput,
): Promise<PreparedPullRequestWorkspace> {
  const hostedRepo = await resolveHostedRepo(input.repoPath);
  if (!hostedRepo) {
    throw new Error("No supported hosted repository was found for the selected repo.");
  }

  if (hostedRepo.providerId !== "github") {
    throw new Error(`${hostedRepo.providerId} review workspaces are not supported yet.`);
  }

  const connection = await getProviderConnection(hostedRepo.providerId);
  if (!connection) {
    throw new Error("GitHub is not connected.");
  }

  const { data: pullRequest } = await githubRequest<GitHubPullRequestResponse>(
    `/repos/${encodeURIComponent(hostedRepo.owner)}/${encodeURIComponent(hostedRepo.repo)}/pulls/${String(input.pullRequestNumber)}`,
    connection.token,
  );

  const baseRepo = pullRequest.base.repo;
  const headRepo = pullRequest.head.repo;
  if (!headRepo) {
    throw new Error("This pull request no longer has an accessible head repository.");
  }

  const sourceRepoPath = await ensureManagedSourceRepo(hostedRepo, baseRepo.clone_url);
  const baseRefFull = `refs/remotes/${OPEN_WARDEN_REMOTE_PREFIX}/base/pr-${String(pullRequest.number)}`;
  const headRefFull = `refs/remotes/${OPEN_WARDEN_REMOTE_PREFIX}/head/pr-${String(pullRequest.number)}`;
  const baseRefShort = `${OPEN_WARDEN_REMOTE_PREFIX}/base/pr-${String(pullRequest.number)}`;
  const headRefShort = `${OPEN_WARDEN_REMOTE_PREFIX}/head/pr-${String(pullRequest.number)}`;
  const localBranch = `${OPEN_WARDEN_REMOTE_PREFIX}/pr-${String(pullRequest.number)}`;
  const worktreePath = managedWorktreePath(hostedRepo, pullRequest.number);

  await fetchRemoteBranch(
    sourceRepoPath,
    baseRepo.clone_url,
    pullRequest.base.ref,
    baseRefFull,
    connection.token,
  );
  await fetchRemoteBranch(
    sourceRepoPath,
    headRepo.clone_url,
    pullRequest.head.ref,
    headRefFull,
    connection.token,
  );
  const compareBaseRef = await resolveMergeBase(sourceRepoPath, baseRefShort, headRefShort);
  const compareHeadRef = headRefShort;
  await ensurePreparedWorktree(sourceRepoPath, worktreePath, localBranch, headRefShort);
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
