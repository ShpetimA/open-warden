import type {
  AddPullRequestCommentInput,
  ListPullRequestsInput,
  PullRequestChangedFile,
  PullRequestConversation,
  PullRequestIssueComment,
  PullRequestLocatorInput,
  PullRequestPage,
  PullRequestReviewDraftCommentInput,
  PullRequestReviewThread,
  PullRequestSummary,
  ResolveActivePullRequestForBranchInput,
  ReplyToPullRequestThreadInput,
  SetPullRequestThreadResolvedInput,
  SubmitPullRequestReviewCommentsInput,
  SubmitPullRequestReviewCommentsResult,
} from "../../src/platform/desktop/contracts";
import {
  bitbucketPullRequestPath,
  bitbucketRequest,
  bitbucketThreadRootDatabaseId,
  fetchBitbucketConversation,
  fetchBitbucketPullRequest,
  fetchBitbucketPullRequestFiles,
  fetchBitbucketPullRequestPatch,
  listBitbucketPullRequests,
  resolveBitbucketOpenPullRequestForBranch,
  toBitbucketIssueComment,
  toBitbucketPullRequestSummary,
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
  resolveGitHubOpenPullRequestForBranch,
  toPullRequestDetail,
  toPullRequestSummary,
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

type GitHubPullRequestReviewResponse = {
  id?: number;
};

function errorMessageFromUnknown(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function managedPullRequestNumberFromBranch(branch: string) {
  const match = /^open-warden\/pr-(\d+)$/.exec(branch.trim());
  if (!match) {
    return null;
  }

  const pullRequestNumber = Number.parseInt(match[1] ?? "", 10);
  if (!Number.isFinite(pullRequestNumber) || pullRequestNumber <= 0) {
    return null;
  }

  return pullRequestNumber;
}

function normalizePullRequestReviewComments(
  comments: SubmitPullRequestReviewCommentsInput["comments"],
) {
  return comments.map((comment) => {
    const path = comment.path.trim();
    const body = comment.body.trim();

    if (!comment.draftId.trim()) {
      throw new Error("Each review draft must include a draft ID.");
    }

    if (!path) {
      throw new Error("Review draft comments must target a file path.");
    }

    if (!body) {
      throw new Error("Review draft comments cannot be empty.");
    }

    if (!Number.isInteger(comment.line) || comment.line <= 0) {
      throw new Error(`Review draft comments must target a valid line for ${path}.`);
    }

    if (comment.startLine !== null && comment.startLine !== undefined) {
      if (!Number.isInteger(comment.startLine) || comment.startLine <= 0) {
        throw new Error(`Review draft comments must include a valid start line for ${path}.`);
      }
    }

    return {
      ...comment,
      draftId: comment.draftId.trim(),
      path,
      body,
    } satisfies PullRequestReviewDraftCommentInput;
  });
}

function toGitHubReviewCommentInput(comment: PullRequestReviewDraftCommentInput) {
  return {
    body: comment.body,
    path: comment.path,
    line: comment.line,
    side: comment.side,
    ...(comment.startLine == null
      ? {}
      : {
          start_line: comment.startLine,
          start_side: comment.startSide ?? comment.side,
        }),
  };
}

function toBitbucketInline(comment: PullRequestReviewDraftCommentInput) {
  const inline: {
    path: string;
    from?: number;
    to?: number;
    start_from?: number;
    start_to?: number;
  } = {
    path: comment.path,
  };

  if (comment.side === "LEFT") {
    inline.from = comment.line;
  } else {
    inline.to = comment.line;
  }

  if (comment.startLine != null) {
    const startSide = comment.startSide ?? comment.side;
    if (startSide === "LEFT") {
      inline.start_from = comment.startLine;
    } else {
      inline.start_to = comment.startLine;
    }
  }

  return inline;
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

export async function resolveActivePullRequestForBranch(
  input: ResolveActivePullRequestForBranchInput,
): Promise<PullRequestSummary | null> {
  const normalizedBranch = input.branch.trim();
  if (!normalizedBranch) {
    return null;
  }

  const hostedRepo = await resolveHostedRepo(input.repoPath);
  if (!hostedRepo) {
    return null;
  }

  const connection = await getProviderConnection(hostedRepo.providerId);
  if (!connection) {
    return null;
  }

  const managedPullRequestNumber = managedPullRequestNumberFromBranch(normalizedBranch);

  if (hostedRepo.providerId === "github") {
    const matchingPullRequest = await resolveGitHubOpenPullRequestForBranch(
      hostedRepo,
      connection.token,
      normalizedBranch,
    );
    if (matchingPullRequest) {
      return matchingPullRequest;
    }

    if (!managedPullRequestNumber) {
      return null;
    }

    try {
      const pullRequest = await fetchGitHubPullRequest(
        hostedRepo,
        connection.token,
        managedPullRequestNumber,
      );
      const summary = toPullRequestSummary(pullRequest, hostedRepo.providerId);
      return summary.state === "open" ? summary : null;
    } catch {
      return null;
    }
  }

  if (hostedRepo.providerId === "bitbucket") {
    const matchingPullRequest = await resolveBitbucketOpenPullRequestForBranch(
      hostedRepo,
      connection,
      normalizedBranch,
    );
    if (matchingPullRequest) {
      return matchingPullRequest;
    }

    if (!managedPullRequestNumber) {
      return null;
    }

    try {
      const pullRequest = await fetchBitbucketPullRequest(
        hostedRepo,
        connection,
        managedPullRequestNumber,
      );
      const summary = toBitbucketPullRequestSummary(pullRequest, hostedRepo);
      return summary.state === "open" ? summary : null;
    } catch {
      return null;
    }
  }

  return null;
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

export async function submitPullRequestReviewComments(
  input: SubmitPullRequestReviewCommentsInput,
): Promise<SubmitPullRequestReviewCommentsResult> {
  const comments = normalizePullRequestReviewComments(input.comments);
  if (comments.length === 0) {
    return {
      submittedDraftIds: [],
      failedDraftId: null,
      failedMessage: null,
    };
  }

  const { hostedRepo, connection } = await resolvePullRequestContext(input);
  if (hostedRepo.providerId === "github") {
    const review = await githubJsonRequest<GitHubPullRequestReviewResponse>(
      `/repos/${encodeURIComponent(hostedRepo.owner)}/${encodeURIComponent(hostedRepo.repo)}/pulls/${String(input.pullRequestNumber)}/reviews`,
      connection.token,
      {
        method: "POST",
        body: {
          comments: comments.map(toGitHubReviewCommentInput),
        },
      },
    );

    if (!review.id) {
      throw new Error("GitHub did not return a review ID for the submitted comments.");
    }

    await githubJsonRequest(
      `/repos/${encodeURIComponent(hostedRepo.owner)}/${encodeURIComponent(hostedRepo.repo)}/pulls/${String(input.pullRequestNumber)}/reviews/${String(review.id)}/events`,
      connection.token,
      {
        method: "POST",
        body: {
          event: "COMMENT",
        },
      },
    );

    return {
      submittedDraftIds: comments.map((comment) => comment.draftId),
      failedDraftId: null,
      failedMessage: null,
    };
  }

  if (hostedRepo.providerId === "bitbucket") {
    const submittedDraftIds: string[] = [];

    for (const comment of comments) {
      try {
        await bitbucketRequest<BitbucketCommentResponse>(
          `${bitbucketPullRequestPath(hostedRepo, input.pullRequestNumber)}/comments`,
          connection,
          {
            method: "POST",
            body: {
              content: { raw: comment.body },
              inline: toBitbucketInline(comment),
            },
          },
        );
        submittedDraftIds.push(comment.draftId);
      } catch (error) {
        return {
          submittedDraftIds,
          failedDraftId: comment.draftId,
          failedMessage: errorMessageFromUnknown(error),
        };
      }
    }

    return {
      submittedDraftIds,
      failedDraftId: null,
      failedMessage: null,
    };
  }

  throw new Error(
    `${providerDisplayName(hostedRepo.providerId)} review comment submission is not supported yet.`,
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
