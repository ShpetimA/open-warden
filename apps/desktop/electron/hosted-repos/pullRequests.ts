import type {
  AddPullRequestCommentInput,
  PullRequestChangedFile,
  PullRequestConversation,
  PullRequestIssueComment,
  PullRequestLocatorInput,
  PullRequestPage,
  PullRequestReviewThread,
  ReplyToPullRequestThreadInput,
  SetPullRequestThreadResolvedInput,
  ListPullRequestsInput,
} from "../../src/platform/desktop/contracts";
import {
  bitbucketPullRequestPath,
  bitbucketRequest,
  bitbucketThreadRootDatabaseId,
  fetchBitbucketConversation,
  fetchBitbucketPullRequestFiles,
  fetchBitbucketPullRequestPatch,
  listBitbucketPullRequests,
  toBitbucketIssueComment,
  type BitbucketCommentResponse,
} from "../bitbucket-repo";
import {
  fetchGitHubIssueComments,
  fetchGitHubPullRequest,
  fetchGitHubPullRequestFiles,
  fetchGitHubPullRequestPatch,
  fetchGitHubReviewThreads,
  githubGraphqlRequest,
  githubJsonRequest,
  listGitHubPullRequests,
  toPullRequestDetail,
  toPullRequestIssueComment,
  type GitHubIssueCommentResponse,
} from "../github-repo";
import { getProviderConnection } from "../providerConnections";
import { resolveHostedRepo } from "./repository";
import { missingConnectionMessage, providerDisplayName } from "./providers";

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

async function resolveGitHubPullRequestContext(input: PullRequestLocatorInput) {
  const { hostedRepo, connection } = await resolvePullRequestContext(input);
  if (hostedRepo.providerId !== "github") {
    throw new Error(
      `Cannot use ${providerDisplayName(hostedRepo.providerId)} pull request data in GitHub flow.`,
    );
  }

  return { hostedRepo, connection };
}

async function readPullRequestReviewThread(input: PullRequestLocatorInput, threadId: string) {
  const { hostedRepo, connection } = await resolveGitHubPullRequestContext(input);
  const threads = await fetchGitHubReviewThreads(
    hostedRepo,
    connection.token,
    input.pullRequestNumber,
  );
  const thread = threads.find((value) => value.id === threadId);
  if (!thread) {
    throw new Error("The selected review thread could not be found.");
  }

  return { thread, hostedRepo, connection };
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

  throw new Error(
    `${providerDisplayName(hostedRepo.providerId)} pull request listing is not supported yet.`,
  );
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

  throw new Error(
    `${providerDisplayName(hostedRepo.providerId)} thread replies are not supported yet.`,
  );
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
