import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import type {
  GitProviderId,
  HostedRepoRef,
  PreparePullRequestWorkspaceInput,
  PreparedPullRequestWorkspace,
} from "../../src/platform/desktop/contracts";
import {
  createBitbucketGitAuthHeaders,
  fetchBitbucketPullRequest,
  pickBitbucketCloneUrl,
} from "../bitbucket-repo";
import { githubRequest, type GitHubPullRequestResponse } from "../github-repo";
import { getProviderConnection } from "../providerConnections";
import {
  createGitAuthHeaderFromConnection,
  GitCommandError,
  OPEN_WARDEN_REMOTE_PREFIX,
  pathExists,
  runGit,
  runGitInRepo,
} from "./git";
import { resolveHostedRepo } from "./repository";
import { missingConnectionMessage, providerDisplayName } from "./providers";

function toSafePathSegment(value: string) {
  return value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-");
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

async function writeManagedRepoState(preparedWorkspace: PreparedPullRequestWorkspace) {
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
        workspaces: dedupePreparedWorkspaces([normalizedPreparedWorkspace, ...remainingWorkspaces]),
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

  throw new Error(
    `${providerDisplayName(hostedRepo.providerId)} review workspaces are not supported yet.`,
  );
}
