import type {
  AddPullRequestReactionInput,
  PullRequestExtras,
  PullRequestLocatorInput,
  PullRequestStackLink,
  RerunPullRequestWorkflowInput,
  SetPullRequestLabelsInput,
} from "../../src/platform/desktop/contracts";
import { z } from "zod";
import { fetchGitHubPullRequest, githubEmptyRequest, githubJsonRequest } from "../github-repo";
import { resolvePullRequestContext } from "./pullRequests";

const labelListSchema = z.array(
  z.object({ name: z.string(), description: z.string().nullable().optional() }),
);
const workflowRunsSchema = z.object({
  total_count: z.number().int().nonnegative(),
  workflow_runs: z.array(
    z.object({
      id: z.number().int().positive(),
      name: z.string().nullable(),
      status: z.string(),
      conclusion: z.string().nullable(),
      html_url: z.string().url(),
      run_attempt: z.number().int().positive(),
    }),
  ),
});
const stackCandidatesSchema = z.array(
  z.object({
    number: z.number().int().positive(),
    title: z.string(),
    body: z.string().nullable().optional(),
    base: z.object({ ref: z.string() }),
    head: z.object({ ref: z.string(), repo: z.object({ full_name: z.string() }).nullable() }),
  }),
);

function parentNumbers(body: string | null | undefined) {
  return [...(body ?? "").matchAll(/^Depends on #(\d+)\s*$/gim)].map((match) => Number(match[1]));
}

export async function addPullRequestReaction(input: AddPullRequestReactionInput): Promise<void> {
  const { hostedRepo, connection } = await resolvePullRequestContext(input);
  if (hostedRepo.providerId !== "github")
    throw new Error("Reactions are unavailable on this provider.");
  if (!Number.isSafeInteger(input.commentId) || input.commentId < 1)
    throw new Error("Invalid comment.");
  const allowed = new Set(["+1", "-1", "laugh", "hooray", "confused", "heart", "rocket", "eyes"]);
  if (!allowed.has(input.content)) throw new Error("Invalid reaction.");
  const prefix = `/repos/${encodeURIComponent(hostedRepo.owner)}/${encodeURIComponent(hostedRepo.repo)}`;
  const comment = z
    .object({ issue_url: z.string().url() })
    .parse(
      await githubJsonRequest<unknown>(
        `${prefix}/issues/comments/${input.commentId}`,
        connection.token,
      ),
    );
  if (!comment.issue_url.endsWith(`/issues/${input.pullRequestNumber}`))
    throw new Error("This comment does not belong to the selected pull request.");
  await githubJsonRequest<unknown>(
    `${prefix}/issues/comments/${input.commentId}/reactions`,
    connection.token,
    { method: "POST", body: { content: input.content } },
  );
}

export async function getPullRequestExtras(
  input: PullRequestLocatorInput,
): Promise<PullRequestExtras> {
  const { hostedRepo, connection } = await resolvePullRequestContext(input);
  if (hostedRepo.providerId !== "github") {
    return {
      providerId: hostedRepo.providerId,
      labelsAvailable: false,
      workflowsAvailable: false,
      stackAvailable: false,
      availableLabels: [],
      workflowRuns: [],
      stack: [],
      stackCandidates: [],
      truncated: false,
    };
  }
  const prefix = `/repos/${encodeURIComponent(hostedRepo.owner)}/${encodeURIComponent(hostedRepo.repo)}`;
  const pullRequest = await fetchGitHubPullRequest(
    hostedRepo,
    connection.token,
    input.pullRequestNumber,
  );
  const [labelsResult, runsResult, stackResult] = await Promise.allSettled([
    githubJsonRequest<unknown>(`${prefix}/labels?per_page=100`, connection.token).then((value) =>
      labelListSchema.parse(value),
    ),
    githubJsonRequest<unknown>(
      `${prefix}/actions/runs?head_sha=${encodeURIComponent(pullRequest.head.sha)}&per_page=100`,
      connection.token,
    ).then((value) => workflowRunsSchema.parse(value)),
    githubJsonRequest<unknown>(`${prefix}/pulls?state=open&per_page=100`, connection.token).then(
      (value) => stackCandidatesSchema.parse(value),
    ),
  ]);
  const labels = labelsResult.status === "fulfilled" ? labelsResult.value : [];
  const runs = runsResult.status === "fulfilled" ? runsResult.value : null;
  const candidates = stackResult.status === "fulfilled" ? stackResult.value : [];
  const repoFullName = `${hostedRepo.owner}/${hostedRepo.repo}`.toLowerCase();
  const explicitParents = new Set(parentNumbers(pullRequest.body));
  const stack = candidates.flatMap<PullRequestStackLink>((candidate) => {
    if (candidate.number === input.pullRequestNumber) return [];
    if (
      explicitParents.has(candidate.number) ||
      (candidate.head.repo?.full_name.toLowerCase() === repoFullName &&
        candidate.head.ref === pullRequest.base.ref)
    ) {
      return [
        { number: candidate.number, title: candidate.title, relationship: "parent" as const },
      ];
    }
    if (
      parentNumbers(candidate.body).includes(input.pullRequestNumber) ||
      (candidate.head.repo?.full_name.toLowerCase() === repoFullName &&
        candidate.base.ref === pullRequest.head.ref)
    ) {
      return [{ number: candidate.number, title: candidate.title, relationship: "child" as const }];
    }
    return [];
  });
  for (const number of explicitParents) {
    if (
      number !== input.pullRequestNumber &&
      !stack.some((link) => link.relationship === "parent" && link.number === number)
    )
      stack.push({ number, title: "Pull request", relationship: "parent" });
  }
  return {
    providerId: "github",
    labelsAvailable: labelsResult.status === "fulfilled" && labels.length < 100,
    workflowsAvailable: runsResult.status === "fulfilled",
    stackAvailable: stackResult.status === "fulfilled",
    availableLabels: labels.flatMap((label) =>
      label.name ? [{ name: label.name, description: label.description ?? null }] : [],
    ),
    workflowRuns: (runs?.workflow_runs ?? []).map((run) => ({
      id: run.id,
      name: run.name || `Run ${run.id}`,
      status: run.status,
      conclusion: run.conclusion,
      url: run.html_url,
      attempt: run.run_attempt,
    })),
    stack,
    stackCandidates: candidates
      .filter((candidate) => candidate.number !== input.pullRequestNumber)
      .map((candidate) => ({ number: candidate.number, title: candidate.title })),
    truncated:
      labels.length >= 100 ||
      Boolean(runs && runs.total_count > runs.workflow_runs.length) ||
      candidates.length >= 100,
  };
}

export async function setPullRequestLabels(input: SetPullRequestLabelsInput): Promise<void> {
  const { hostedRepo, connection } = await resolvePullRequestContext(input);
  if (hostedRepo.providerId !== "github")
    throw new Error("Labels are unavailable on this provider.");
  const pullRequest = await fetchGitHubPullRequest(
    hostedRepo,
    connection.token,
    input.pullRequestNumber,
  );
  if (pullRequest.head.sha !== input.expectedHeadSha)
    throw new Error("The pull request changed. Refresh before editing labels.");
  const currentLabels = (pullRequest.labels ?? [])
    .flatMap((label) => (label.name ? [label.name] : []))
    .toSorted();
  const expectedLabels = [...input.expectedLabels].toSorted();
  if (
    currentLabels.length !== expectedLabels.length ||
    currentLabels.some((label, index) => label !== expectedLabels[index])
  )
    throw new Error("The pull request labels changed. Refresh before editing them.");
  const labels = [...new Set(input.labels.map((label) => label.trim()))];
  if (labels.some((label) => !label || label.length > 100)) throw new Error("Choose valid labels.");
  const prefix = `/repos/${encodeURIComponent(hostedRepo.owner)}/${encodeURIComponent(hostedRepo.repo)}`;
  await githubJsonRequest<unknown>(
    `${prefix}/issues/${input.pullRequestNumber}/labels`,
    connection.token,
    { method: "PUT", body: { labels } },
  );
}

async function mutateWorkflowRun(
  input: RerunPullRequestWorkflowInput,
  action: "rerun" | "cancel",
): Promise<void> {
  const { hostedRepo, connection } = await resolvePullRequestContext(input);
  if (hostedRepo.providerId !== "github")
    throw new Error("Workflow runs are unavailable on this provider.");
  if (!Number.isSafeInteger(input.runId) || input.runId < 1)
    throw new Error("Invalid workflow run.");
  const pullRequest = await fetchGitHubPullRequest(
    hostedRepo,
    connection.token,
    input.pullRequestNumber,
  );
  if (pullRequest.head.sha !== input.expectedHeadSha)
    throw new Error("The pull request changed. Refresh before rerunning a workflow.");
  const prefix = `/repos/${encodeURIComponent(hostedRepo.owner)}/${encodeURIComponent(hostedRepo.repo)}`;
  const run = z
    .object({ head_sha: z.string() })
    .parse(
      await githubJsonRequest<unknown>(`${prefix}/actions/runs/${input.runId}`, connection.token),
    );
  if (run.head_sha !== input.expectedHeadSha)
    throw new Error("This workflow run belongs to a different commit.");
  await githubEmptyRequest(
    `${prefix}/actions/runs/${input.runId}/${action}`,
    connection.token,
    "POST",
  );
}

export async function rerunPullRequestWorkflow(
  input: RerunPullRequestWorkflowInput,
): Promise<void> {
  await mutateWorkflowRun(input, "rerun");
}

export async function cancelPullRequestWorkflow(
  input: RerunPullRequestWorkflowInput,
): Promise<void> {
  await mutateWorkflowRun(input, "cancel");
}
