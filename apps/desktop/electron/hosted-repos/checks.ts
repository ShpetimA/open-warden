import type {
  HostedRepoRef,
  PullRequestCheck,
  PullRequestChecksResult,
  PullRequestLocatorInput,
} from "../../src/platform/desktop/contracts";
import {
  bitbucketPullRequestPath,
  bitbucketRequest,
  fetchBitbucketPullRequest,
} from "../bitbucket-repo";
import { fetchGitHubPullRequest, githubJsonRequest } from "../github-repo";
import { getProviderConnection } from "../providerConnections";
import type { ProviderConnectionSecret } from "../providerConnections";
import { missingConnectionMessage } from "./providers";
import { resolveHostedRepo } from "./repository";

type GitHubCheckRun = {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  details_url: string | null;
  output?: { title?: string | null; summary?: string | null };
};

type GitHubCheckRunsPage = { total_count: number; check_runs: GitHubCheckRun[] };
type GitHubStatus = {
  id: number;
  context: string;
  state: string;
  description: string | null;
  target_url: string | null;
};
type GitHubCombinedStatus = { statuses: GitHubStatus[] };
type BitbucketStatus = {
  key: string;
  name?: string;
  description?: string;
  state: string;
  url?: string;
};
type BitbucketStatusPage = { values: BitbucketStatus[]; next?: string };

function safeCheckUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function combineGitHubChecks(runs: GitHubCheckRun[], statuses: GitHubStatus[]) {
  const latestRuns = new Map<string, GitHubCheckRun>();
  for (const run of runs) {
    const key = run.name.trim().toLowerCase();
    const previous = latestRuns.get(key);
    if (!previous || run.id > previous.id) latestRuns.set(key, run);
  }
  const runNames = new Set(latestRuns.keys());
  return [
    ...Array.from(latestRuns.values()).map(
      (run): PullRequestCheck => ({
        id: `run:${run.id}`,
        name: run.name,
        description: run.output?.title ?? null,
        state: githubCheckState(run),
        url: safeCheckUrl(run.details_url),
      }),
    ),
    ...statuses
      .filter((item) => !runNames.has(item.context.trim().toLowerCase()))
      .map(
        (item): PullRequestCheck => ({
          id: `status:${item.context}`,
          name: item.context,
          description: item.description,
          state: githubStatusState(item.state),
          url: safeCheckUrl(item.target_url),
        }),
      ),
  ];
}

export function githubCheckState(run: GitHubCheckRun): PullRequestCheck["state"] {
  if (run.status !== "completed") return "pending";
  if (
    run.conclusion === "success" ||
    run.conclusion === "neutral" ||
    run.conclusion === "skipped"
  ) {
    return "passed";
  }
  if (
    run.conclusion === "failure" ||
    run.conclusion === "timed_out" ||
    run.conclusion === "cancelled" ||
    run.conclusion === "action_required"
  )
    return "failed";
  return "pending";
}

export function githubStatusState(state: string): PullRequestCheck["state"] {
  if (state === "success") return "passed";
  if (state === "failure" || state === "error") return "failed";
  return "pending";
}

export function bitbucketStatusState(state: string): PullRequestCheck["state"] {
  if (state === "SUCCESSFUL") return "passed";
  if (state === "FAILED" || state === "STOPPED") return "failed";
  return "pending";
}

async function getGitHubChecks(
  hostedRepo: HostedRepoRef,
  token: string,
  pullRequestNumber: number,
): Promise<PullRequestChecksResult> {
  const pullRequest = await fetchGitHubPullRequest(hostedRepo, token, pullRequestNumber);
  const headSha = pullRequest.head.sha;
  const commitPath = `/repos/${encodeURIComponent(hostedRepo.owner)}/${encodeURIComponent(hostedRepo.repo)}/commits/${encodeURIComponent(headSha)}`;
  const [runsResult, statusResult] = await Promise.allSettled([
    githubJsonRequest<GitHubCheckRunsPage>(`${commitPath}/check-runs?per_page=100`, token),
    githubJsonRequest<GitHubCombinedStatus>(`${commitPath}/status?per_page=100`, token),
  ]);
  if (runsResult.status === "rejected" && statusResult.status === "rejected") {
    throw new Error("GitHub did not allow check runs or commit statuses to be read.");
  }
  const runs = runsResult.status === "fulfilled" ? runsResult.value : null;
  const status = statusResult.status === "fulfilled" ? statusResult.value : null;

  const checks = combineGitHubChecks(runs?.check_runs ?? [], status?.statuses ?? []);

  return {
    headSha,
    checks,
    complete: Boolean(
      runs && status && runs.total_count <= runs.check_runs.length && status.statuses.length < 100,
    ),
    mergeability:
      pullRequest.mergeable === true
        ? "mergeable"
        : pullRequest.mergeable === false
          ? "conflicting"
          : "unknown",
  };
}

async function getBitbucketChecks(
  hostedRepo: HostedRepoRef,
  connection: ProviderConnectionSecret,
  pullRequestNumber: number,
): Promise<PullRequestChecksResult> {
  const pullRequest = await fetchBitbucketPullRequest(hostedRepo, connection, pullRequestNumber);
  const headSha = pullRequest.source?.commit?.hash;
  if (!headSha) {
    throw new Error("Bitbucket did not return a head commit for this pull request.");
  }

  const checks: PullRequestCheck[] = [];
  let next: string | undefined =
    `${bitbucketPullRequestPath(hostedRepo, pullRequestNumber)}/statuses?pagelen=100`;
  let pages = 0;
  while (next && pages < 30) {
    const response: { data: BitbucketStatusPage } = await bitbucketRequest<BitbucketStatusPage>(
      next,
      connection,
    );
    checks.push(
      ...response.data.values.map((item) => ({
        id: `status:${item.key}`,
        name: item.name || item.key,
        description: item.description || null,
        state: bitbucketStatusState(item.state),
        url: safeCheckUrl(item.url),
      })),
    );
    next = response.data.next;
    pages += 1;
  }

  let mergeability: PullRequestChecksResult["mergeability"] = "unknown";
  try {
    const conflicts = await bitbucketRequest<{ values: unknown[]; next?: string }>(
      `${bitbucketPullRequestPath(hostedRepo, pullRequestNumber)}/conflicts`,
      connection,
    );
    if (Array.isArray(conflicts.data.values)) {
      mergeability =
        conflicts.data.values.length > 0
          ? "conflicting"
          : conflicts.data.next
            ? "unknown"
            : "mergeable";
    }
  } catch {
    // Bitbucket may not expose this endpoint to every token. Checks remain available.
  }

  return { headSha, checks, complete: !next, mergeability };
}

export async function getPullRequestChecks(
  input: PullRequestLocatorInput,
): Promise<PullRequestChecksResult> {
  const hostedRepo = await resolveHostedRepo(input.repoPath);
  if (!hostedRepo) {
    throw new Error("No supported hosted repository was found for the selected repo.");
  }
  const connection = await getProviderConnection(hostedRepo.providerId);
  if (!connection) {
    throw new Error(missingConnectionMessage(hostedRepo.providerId));
  }

  if (hostedRepo.providerId === "github") {
    return getGitHubChecks(hostedRepo, connection.token, input.pullRequestNumber);
  }
  if (hostedRepo.providerId === "bitbucket") {
    return getBitbucketChecks(hostedRepo, connection, input.pullRequestNumber);
  }
  throw new Error("Checks are not available for this provider.");
}
