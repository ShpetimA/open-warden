import { desktop } from "@/platform/desktop";

import type {
  AddPullRequestCommentInput,
  ConnectProviderInput,
  HostedRepoRef,
  PreparedPullRequestWorkspace,
  PreparePullRequestWorkspaceInput,
  ProviderConnection,
  PullRequestChangedFile,
  PullRequestConversation,
  PullRequestIssueComment,
  PullRequestLocatorInput,
  PullRequestReviewThread,
  PullRequestSummary,
  ReplyToPullRequestThreadInput,
  SetPullRequestThreadResolvedInput,
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

export async function resolvePullRequestWorkspace(repoPath: string) {
  return desktop.resolvePullRequestWorkspace(repoPath) as Promise<PreparedPullRequestWorkspace | null>;
}

export async function listPullRequests(repoPath: string) {
  return desktop.listPullRequests(repoPath) as Promise<PullRequestSummary[]>;
}

export async function getPullRequestConversation(input: PullRequestLocatorInput) {
  return desktop.getPullRequestConversation(input) as Promise<PullRequestConversation>;
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

export async function replyToPullRequestThread(input: ReplyToPullRequestThreadInput) {
  return desktop.replyToPullRequestThread(input) as Promise<PullRequestReviewThread>;
}

export async function setPullRequestThreadResolved(input: SetPullRequestThreadResolvedInput) {
  return desktop.setPullRequestThreadResolved(input) as Promise<PullRequestReviewThread>;
}

export async function preparePullRequestWorkspace(input: PreparePullRequestWorkspaceInput) {
  return desktop.preparePullRequestWorkspace(input) as Promise<PreparedPullRequestWorkspace>;
}
