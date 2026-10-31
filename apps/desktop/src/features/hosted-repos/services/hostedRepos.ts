import { desktop } from "@/platform/desktop";

import type {
  AddPullRequestCommentInput,
  CreatePullRequestInput,
  ConnectProviderInput,
  PreparePullRequestWorkspaceInput,
  ProviderConnection,
  ResolveActivePullRequestForBranchInput,
  ListPullRequestsInput,
  MergePullRequestInput,
  SetPullRequestReviewerInput,
  SubmitPullRequestReviewInput,
  SetPullRequestLabelsInput,
  RerunPullRequestWorkflowInput,
  AddPullRequestReactionInput,
  PullRequestLocatorInput,
  PullRequestLifecycleInput,
  SetPullRequestFileViewedInput,
  ReplyToPullRequestThreadInput,
  SetPullRequestThreadResolvedInput,
  SubmitPullRequestReviewCommentsInput,
  SubmitPullRequestDecisionInput,
} from "@/platform/desktop";

export async function listProviderConnections() {
  return desktop.listProviderConnections();
}

export async function connectProvider(input: ConnectProviderInput) {
  return desktop.connectProvider(input);
}

export async function disconnectProvider(providerId: ProviderConnection["providerId"]) {
  return desktop.disconnectProvider(providerId);
}

export async function resolveHostedRepo(repoPath: string) {
  return desktop.resolveHostedRepo(repoPath);
}

export async function listPullRequests(input: ListPullRequestsInput) {
  return desktop.listPullRequests(input);
}

export async function resolveActivePullRequestForBranch(
  input: ResolveActivePullRequestForBranchInput,
) {
  return desktop.resolveActivePullRequestForBranch(input);
}

export async function getPullRequestConversation(input: PullRequestLocatorInput) {
  return desktop.getPullRequestConversation(input);
}

export async function getPullRequestReviewOverview(input: PullRequestLocatorInput) {
  return desktop.getPullRequestReviewOverview(input);
}

export async function setPullRequestReviewer(input: SetPullRequestReviewerInput) {
  return desktop.setPullRequestReviewer(input);
}

export async function submitPullRequestReview(input: SubmitPullRequestReviewInput) {
  return desktop.submitPullRequestReview(input);
}

export async function runPullRequestLifecycle(input: PullRequestLifecycleInput) {
  return desktop.runPullRequestLifecycle(input);
}

export async function getPullRequestActivity(input: PullRequestLocatorInput) {
  return desktop.getPullRequestActivity(input);
}

export async function getPullRequestViewedFiles(input: PullRequestLocatorInput) {
  return desktop.getPullRequestViewedFiles(input);
}

export async function setPullRequestFileViewed(input: SetPullRequestFileViewedInput) {
  return desktop.setPullRequestFileViewed(input);
}

export async function getPullRequestChecks(input: PullRequestLocatorInput) {
  return desktop.getPullRequestChecks(input);
}

export async function getPullRequestExtras(input: PullRequestLocatorInput) {
  return desktop.getPullRequestExtras(input);
}

export async function setPullRequestLabels(input: SetPullRequestLabelsInput) {
  return desktop.setPullRequestLabels(input);
}

export async function rerunPullRequestWorkflow(input: RerunPullRequestWorkflowInput) {
  return desktop.rerunPullRequestWorkflow(input);
}

export async function cancelPullRequestWorkflow(input: RerunPullRequestWorkflowInput) {
  return desktop.cancelPullRequestWorkflow(input);
}

export async function addPullRequestReaction(input: AddPullRequestReactionInput) {
  return desktop.addPullRequestReaction(input);
}

export async function getPullRequestFiles(input: PullRequestLocatorInput) {
  return desktop.getPullRequestFiles(input);
}

export async function getPullRequestPatch(input: PullRequestLocatorInput) {
  return desktop.getPullRequestPatch(input);
}

export async function addPullRequestComment(input: AddPullRequestCommentInput) {
  return desktop.addPullRequestComment(input);
}

export async function createPullRequest(input: CreatePullRequestInput) {
  return desktop.createPullRequest(input);
}

export async function submitPullRequestDecision(input: SubmitPullRequestDecisionInput) {
  return desktop.submitPullRequestDecision(input);
}

export async function mergePullRequest(input: MergePullRequestInput) {
  return desktop.mergePullRequest(input);
}

export async function replyToPullRequestThread(input: ReplyToPullRequestThreadInput) {
  return desktop.replyToPullRequestThread(input);
}

export async function submitPullRequestReviewComments(input: SubmitPullRequestReviewCommentsInput) {
  return desktop.submitPullRequestReviewComments(input);
}

export async function setPullRequestThreadResolved(input: SetPullRequestThreadResolvedInput) {
  return desktop.setPullRequestThreadResolved(input);
}

export async function preparePullRequestCompareRefs(input: PullRequestLocatorInput) {
  return desktop.preparePullRequestCompareRefs(input);
}

export async function preparePullRequestWorkspace(input: PreparePullRequestWorkspaceInput) {
  return desktop.preparePullRequestWorkspace(input);
}
