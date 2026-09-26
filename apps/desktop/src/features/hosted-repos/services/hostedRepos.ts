import { desktop } from "@/platform/desktop";

import type {
  AddPullRequestCommentInput,
  CreatePullRequestInput,
  ConnectProviderInput,
  HostedRepoRef,
  PreparedPullRequestWorkspace,
  PreparePullRequestWorkspaceInput,
  ProviderConnection,
  ResolveActivePullRequestForBranchInput,
  ListPullRequestsInput,
  MergePullRequestInput,
  PullRequestChangedFile,
  PullRequestCompareRefs,
  PullRequestConversation,
  PullRequestReviewOverview,
  SetPullRequestReviewerInput,
  SubmitPullRequestReviewInput,
  SubmitPullRequestReviewResult,
  PullRequestChecksResult,
  PullRequestExtras,
  SetPullRequestLabelsInput,
  RerunPullRequestWorkflowInput,
  AddPullRequestReactionInput,
  PullRequestIssueComment,
  PullRequestLocatorInput,
  PullRequestLifecycleInput,
  PullRequestLifecycleResult,
  PullRequestActivity,
  PullRequestViewedFiles,
  SetPullRequestFileViewedInput,
  PullRequestPage,
  PullRequestReviewThread,
  ReplyToPullRequestThreadInput,
  SetPullRequestThreadResolvedInput,
  SubmitPullRequestReviewCommentsInput,
  SubmitPullRequestReviewCommentsResult,
  SubmitPullRequestDecisionInput,
  PullRequestSummary,
} from "@/platform/desktop";

export async function listProviderConnections() {
  return desktop.listProviderConnections() as Promise<ProviderConnection[]>;
}

export async function connectProvider(input: ConnectProviderInput) {
  return desktop.connectProvider(input) as Promise<ProviderConnection>;
}

export async function disconnectProvider(providerId: ProviderConnection["providerId"]) {
  await desktop.disconnectProvider(providerId);
}

export async function resolveHostedRepo(repoPath: string) {
  return desktop.resolveHostedRepo(repoPath) as Promise<HostedRepoRef | null>;
}

export async function listPullRequests(input: ListPullRequestsInput) {
  return desktop.listPullRequests(input) as Promise<PullRequestPage>;
}

export async function resolveActivePullRequestForBranch(
  input: ResolveActivePullRequestForBranchInput,
) {
  return desktop.resolveActivePullRequestForBranch(input);
}

export async function getPullRequestConversation(input: PullRequestLocatorInput) {
  return desktop.getPullRequestConversation(input) as Promise<PullRequestConversation>;
}

export async function getPullRequestReviewOverview(input: PullRequestLocatorInput) {
  return desktop.getPullRequestReviewOverview(input) as Promise<PullRequestReviewOverview>;
}

export async function setPullRequestReviewer(input: SetPullRequestReviewerInput) {
  await desktop.setPullRequestReviewer(input);
}

export async function submitPullRequestReview(input: SubmitPullRequestReviewInput) {
  return desktop.submitPullRequestReview(input) as Promise<SubmitPullRequestReviewResult>;
}

export async function runPullRequestLifecycle(input: PullRequestLifecycleInput) {
  return desktop.runPullRequestLifecycle(input) as Promise<PullRequestLifecycleResult>;
}

export async function getPullRequestActivity(input: PullRequestLocatorInput) {
  return desktop.getPullRequestActivity(input) as Promise<PullRequestActivity>;
}

export async function getPullRequestViewedFiles(input: PullRequestLocatorInput) {
  return desktop.getPullRequestViewedFiles(input) as Promise<PullRequestViewedFiles>;
}

export async function setPullRequestFileViewed(input: SetPullRequestFileViewedInput) {
  await desktop.setPullRequestFileViewed(input);
}

export async function getPullRequestChecks(input: PullRequestLocatorInput) {
  return desktop.getPullRequestChecks(input) as Promise<PullRequestChecksResult>;
}

export async function getPullRequestExtras(input: PullRequestLocatorInput) {
  return desktop.getPullRequestExtras(input) as Promise<PullRequestExtras>;
}

export async function setPullRequestLabels(input: SetPullRequestLabelsInput) {
  await desktop.setPullRequestLabels(input);
}

export async function rerunPullRequestWorkflow(input: RerunPullRequestWorkflowInput) {
  await desktop.rerunPullRequestWorkflow(input);
}

export async function cancelPullRequestWorkflow(input: RerunPullRequestWorkflowInput) {
  await desktop.cancelPullRequestWorkflow(input);
}

export async function addPullRequestReaction(input: AddPullRequestReactionInput) {
  await desktop.addPullRequestReaction(input);
}

export async function getPullRequestFiles(input: PullRequestLocatorInput) {
  return desktop.getPullRequestFiles(input) as Promise<PullRequestChangedFile[]>;
}

export async function getPullRequestPatch(input: PullRequestLocatorInput) {
  return desktop.getPullRequestPatch(input) as Promise<string>;
}

export async function addPullRequestComment(input: AddPullRequestCommentInput) {
  return desktop.addPullRequestComment(input) as Promise<PullRequestIssueComment>;
}

export async function createPullRequest(input: CreatePullRequestInput) {
  return desktop.createPullRequest(input) as Promise<PullRequestSummary>;
}

export async function submitPullRequestDecision(input: SubmitPullRequestDecisionInput) {
  await desktop.submitPullRequestDecision(input);
}

export async function mergePullRequest(input: MergePullRequestInput) {
  return desktop.mergePullRequest(input);
}

export async function replyToPullRequestThread(input: ReplyToPullRequestThreadInput) {
  return desktop.replyToPullRequestThread(input) as Promise<PullRequestReviewThread>;
}

export async function submitPullRequestReviewComments(input: SubmitPullRequestReviewCommentsInput) {
  return desktop.submitPullRequestReviewComments(
    input,
  ) as Promise<SubmitPullRequestReviewCommentsResult>;
}

export async function setPullRequestThreadResolved(input: SetPullRequestThreadResolvedInput) {
  return desktop.setPullRequestThreadResolved(input) as Promise<PullRequestReviewThread>;
}

export async function preparePullRequestCompareRefs(input: PullRequestLocatorInput) {
  return desktop.preparePullRequestCompareRefs(input) as Promise<PullRequestCompareRefs>;
}

export async function preparePullRequestWorkspace(input: PreparePullRequestWorkspaceInput) {
  return desktop.preparePullRequestWorkspace(input) as Promise<PreparedPullRequestWorkspace>;
}
