import type {
  HostedRepoRef,
  PullRequestConversation,
  PullRequestDetail,
  PullRequestIssueComment,
  PullRequestPerson,
  PullRequestReviewComment,
  PullRequestReviewThread,
  PullRequestState,
  PullRequestSummary,
} from "../src/platform/desktop/contracts";
import type { ProviderConnectionSecret } from "./providerConnections";

const BITBUCKET_API_BASE_URL = "https://api.bitbucket.org/2.0";

type BitbucketWorkspaceRef = {
  slug?: string;
  name?: string;
};

export type BitbucketRepoRef = {
  full_name?: string;
  name?: string;
  workspace?: BitbucketWorkspaceRef;
  links?: {
    html?: {
      href?: string;
    };
    clone?: Array<{
      name?: string;
      href?: string;
    }>;
  };
};

type BitbucketPullRequestSide = {
  branch?: {
    name?: string;
  };
  commit?: {
    hash?: string;
  };
  repository?: BitbucketRepoRef | null;
};

export type BitbucketPullRequestResponse = {
  id: number;
  title?: string;
  description?: string;
  state?: string;
  draft?: boolean;
  created_on?: string;
  updated_on?: string;
  links?: {
    html?: {
      href?: string;
    };
  };
  author?: {
    username?: string;
    nickname?: string;
    display_name?: string;
    uuid?: string;
    account_id?: string;
    links?: {
      avatar?: {
        href?: string;
      };
    };
  } | null;
  source?: BitbucketPullRequestSide | null;
  destination?: BitbucketPullRequestSide | null;
};

export type BitbucketCommentResponse = {
  type?: string;
  id: number;
  parent?: {
    id?: number;
  } | null;
  content?: {
    raw?: string;
  } | null;
  user?: {
    username?: string;
    nickname?: string;
    display_name?: string;
    uuid?: string;
    account_id?: string;
    links?: {
      avatar?: {
        href?: string;
      };
    };
  } | null;
  created_on?: string;
  updated_on?: string;
  deleted?: boolean;
  links?: {
    html?: {
      href?: string;
    };
  };
  inline?: {
    path?: string;
    from?: number;
    to?: number;
    start_from?: number;
    start_to?: number;
  } | null;
  resolution?: {
    type?: string;
    user?: {
      username?: string;
      nickname?: string;
      display_name?: string;
      uuid?: string;
      account_id?: string;
      links?: {
        avatar?: {
          href?: string;
        };
      };
    } | null;
    created_on?: string;
  } | null;
};

type BitbucketPaginatedResponse<T> = {
  values: T[];
  next?: string;
};

export type BitbucketUserResponse = {
  type?: string;
  uuid?: string;
  account_id?: string;
  nickname?: string;
  display_name?: string;
  created_on?: string;
  links?: {
    avatar?: {
      href?: string;
    };
  };
};

function createGitBasicAuthHeader(username: string, password: string) {
  const credentials = Buffer.from(`${username}:${password}`, "utf8").toString("base64");
  return `Authorization: Basic ${credentials}`;
}

function createGitBearerAuthHeader(token: string) {
  return `Authorization: Bearer ${token}`;
}

function normalizeCredentialIdentifier(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function createBitbucketGitAuthHeaders(connection: ProviderConnectionSecret) {
  const headers: string[] = [];
  const seen = new Set<string>();
  const push = (header: string) => {
    if (!seen.has(header)) {
      seen.add(header);
      headers.push(header);
    }
  };

  const identifier = normalizeCredentialIdentifier(connection.identifier);
  const login =
    normalizeCredentialIdentifier(connection.login) &&
    connection.login.trim().toLowerCase() !== "unknown"
      ? connection.login.trim()
      : null;

  if (connection.authType === "basic") {
    if (identifier) {
      push(createGitBasicAuthHeader(identifier, connection.token));
    }
    if (login && login !== identifier) {
      push(createGitBasicAuthHeader(login, connection.token));
    }
    push(createGitBasicAuthHeader("x-token-auth", connection.token));
    return headers;
  }

  push(createGitBasicAuthHeader("x-token-auth", connection.token));
  if (identifier) {
    push(createGitBasicAuthHeader(identifier, connection.token));
  }
  push(createGitBearerAuthHeader(connection.token));
  return headers;
}

function bitbucketUserAgent() {
  return "open-warden";
}

type BitbucketAuth = Pick<ProviderConnectionSecret, "authType" | "identifier" | "token">;

function bitbucketAuthorizationValue(connection: BitbucketAuth) {
  if (connection.authType === "basic") {
    if (!connection.identifier) {
      throw new Error("Bitbucket username/email is required for basic authentication.");
    }

    const credentials = Buffer.from(
      `${connection.identifier}:${connection.token}`,
      "utf8",
    ).toString("base64");
    return `Basic ${credentials}`;
  }

  return `Bearer ${connection.token}`;
}

function parseBitbucketErrorMessage(text: string, status: number) {
  try {
    const payload = JSON.parse(text) as {
      error?: {
        message?: string;
      };
      type?: string;
    };
    const message = payload.error?.message?.trim();
    if (message) {
      return message;
    }
  } catch {
    // no-op
  }

  return text.trim() || `Bitbucket request failed with status ${status}`;
}

export async function bitbucketRequest<T>(
  pathnameOrUrl: string,
  connection: BitbucketAuth,
  init?: {
    method?: "GET" | "POST" | "PUT" | "DELETE";
    body?: unknown;
    responseType?: "json" | "text";
  },
) {
  const absoluteUrl = pathnameOrUrl.startsWith("http://") || pathnameOrUrl.startsWith("https://");
  const url = absoluteUrl ? pathnameOrUrl : `${BITBUCKET_API_BASE_URL}${pathnameOrUrl}`;
  const response = await fetch(url, {
    method: init?.method ?? "GET",
    headers: {
      Accept: "application/json",
      Authorization: bitbucketAuthorizationValue(connection),
      ...(init?.body === undefined ? {} : { "Content-Type": "application/json" }),
      "User-Agent": bitbucketUserAgent(),
    },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(parseBitbucketErrorMessage(message, response.status));
  }

  if (init?.responseType === "text") {
    return {
      data: (await response.text()) as T,
      headers: response.headers,
    };
  }

  return {
    data: (await response.json()) as T,
    headers: response.headers,
  };
}

export function bitbucketAuthorLogin(author: {
  username?: string;
  nickname?: string;
  uuid?: string;
  account_id?: string;
} | null | undefined) {
  if (!author) {
    return "unknown";
  }

  const loginCandidate =
    author.username?.trim() ||
    author.nickname?.trim() ||
    author.account_id?.trim() ||
    author.uuid?.replace(/[{}]/g, "").trim();
  return loginCandidate || "unknown";
}

function toBitbucketPerson(user: {
  username?: string;
  nickname?: string;
  display_name?: string;
  uuid?: string;
  account_id?: string;
  links?: {
    avatar?: {
      href?: string;
    };
  };
} | null): PullRequestPerson | null {
  if (!user) {
    return null;
  }

  return {
    login: bitbucketAuthorLogin(user),
    displayName: user.display_name ?? null,
    avatarUrl: user.links?.avatar?.href ?? null,
  };
}

function mapBitbucketPullRequestState(value: string | undefined): PullRequestState {
  if (value === "MERGED") return "merged";
  if (value === "OPEN") return "open";
  return "closed";
}

function splitBitbucketFullName(fullName: string | undefined | null) {
  if (!fullName) {
    return null;
  }

  const [owner, repo] = fullName.split("/");
  if (!owner || !repo) {
    return null;
  }

  return { owner, repo };
}

function bitbucketRepoIdentity(
  repo: BitbucketRepoRef | null | undefined,
  fallbackOwner: string,
  fallbackRepo: string,
) {
  const fromFullName = splitBitbucketFullName(repo?.full_name);
  if (fromFullName) {
    return fromFullName;
  }

  const owner = repo?.workspace?.slug?.trim() || fallbackOwner;
  const name = repo?.name?.trim() || fallbackRepo;
  return { owner, repo: name };
}

function toBitbucketPullRequestSummary(
  pullRequest: BitbucketPullRequestResponse,
  hostedRepo: HostedRepoRef,
): PullRequestSummary {
  const sourceRepoIdentity = bitbucketRepoIdentity(
    pullRequest.source?.repository ?? null,
    hostedRepo.owner,
    hostedRepo.repo,
  );
  const updatedAt = pullRequest.updated_on ?? pullRequest.created_on ?? new Date(0).toISOString();
  const author = pullRequest.author ?? null;

  return {
    id: `${hostedRepo.providerId}:${String(pullRequest.id)}`,
    providerId: hostedRepo.providerId,
    number: pullRequest.id,
    title: pullRequest.title ?? "",
    state: mapBitbucketPullRequestState(pullRequest.state),
    isDraft: pullRequest.draft ?? false,
    authorLogin: bitbucketAuthorLogin(author),
    authorDisplayName: author?.display_name ?? null,
    url: pullRequest.links?.html?.href ?? `${hostedRepo.webUrl}/pull-requests/${String(pullRequest.id)}`,
    baseRef: pullRequest.destination?.branch?.name ?? "",
    headRef: pullRequest.source?.branch?.name ?? "",
    headOwner: sourceRepoIdentity.owner,
    headRepo: sourceRepoIdentity.repo,
    updatedAt,
  };
}

function toBitbucketPullRequestDetail(
  pullRequest: BitbucketPullRequestResponse,
  hostedRepo: HostedRepoRef,
): PullRequestDetail {
  return {
    id: `${hostedRepo.providerId}:${String(pullRequest.id)}`,
    providerId: hostedRepo.providerId,
    number: pullRequest.id,
    title: pullRequest.title ?? "",
    body: pullRequest.description ?? "",
    state: mapBitbucketPullRequestState(pullRequest.state),
    isDraft: pullRequest.draft ?? false,
    url: pullRequest.links?.html?.href ?? `${hostedRepo.webUrl}/pull-requests/${String(pullRequest.id)}`,
    author: toBitbucketPerson(pullRequest.author ?? null),
    baseRef: pullRequest.destination?.branch?.name ?? "",
    headRef: pullRequest.source?.branch?.name ?? "",
    baseSha: pullRequest.destination?.commit?.hash ?? "",
    headSha: pullRequest.source?.commit?.hash ?? "",
    createdAt: pullRequest.created_on ?? new Date(0).toISOString(),
    updatedAt: pullRequest.updated_on ?? pullRequest.created_on ?? new Date(0).toISOString(),
  };
}

type NormalizedBitbucketComment = {
  id: number;
  parentId: number | null;
  body: string;
  createdAt: string;
  updatedAt: string;
  author: PullRequestPerson | null;
  deleted: boolean;
  url: string | null;
  inline: {
    path: string;
    from: number | null;
    to: number | null;
    startFrom: number | null;
    startTo: number | null;
  } | null;
  resolution: {
    type: string;
    user: PullRequestPerson | null;
    createdOn: string | null;
  } | null;
};

function normalizeBitbucketComment(comment: BitbucketCommentResponse): NormalizedBitbucketComment {
  const createdAt = comment.created_on ?? new Date(0).toISOString();
  const updatedAt = comment.updated_on ?? createdAt;
  const inlinePath = comment.inline?.path?.trim() ?? "";
  const inline = inlinePath
    ? {
        path: inlinePath,
        from: typeof comment.inline?.from === "number" ? comment.inline.from : null,
        to: typeof comment.inline?.to === "number" ? comment.inline.to : null,
        startFrom: typeof comment.inline?.start_from === "number" ? comment.inline.start_from : null,
        startTo: typeof comment.inline?.start_to === "number" ? comment.inline.start_to : null,
      }
    : null;

  return {
    id: comment.id,
    parentId: comment.parent?.id ?? null,
    body: comment.content?.raw ?? "",
    createdAt,
    updatedAt,
    author: toBitbucketPerson(comment.user ?? null),
    deleted: Boolean(comment.deleted),
    url: comment.links?.html?.href ?? null,
    inline,
    resolution:
      comment.resolution && typeof comment.resolution.type === "string"
        ? {
            type: comment.resolution.type,
            user: toBitbucketPerson(comment.resolution.user ?? null),
            createdOn: comment.resolution.created_on ?? null,
          }
        : null,
  };
}

function sortNormalizedBitbucketComments(
  left: NormalizedBitbucketComment,
  right: NormalizedBitbucketComment,
) {
  return left.createdAt.localeCompare(right.createdAt) || left.id - right.id;
}

function toIssueComment(comment: NormalizedBitbucketComment): PullRequestIssueComment {
  return {
    id: `bitbucket-issue-comment:${String(comment.id)}`,
    databaseId: comment.id,
    body: comment.body,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    author: comment.author,
    url: comment.url,
  };
}

function toReviewComment(
  comment: NormalizedBitbucketComment,
  fallbackPath: string,
): PullRequestReviewComment {
  const line = comment.inline?.to ?? comment.inline?.from ?? null;
  const startLine = comment.inline?.startTo ?? comment.inline?.startFrom ?? null;
  return {
    id: `bitbucket-review-comment:${String(comment.id)}`,
    databaseId: comment.id,
    body: comment.body,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    author: comment.author,
    path: comment.inline?.path ?? fallbackPath,
    line,
    startLine,
    url: comment.url,
  };
}

function toBitbucketConversation(
  detail: PullRequestDetail,
  comments: NormalizedBitbucketComment[],
): PullRequestConversation {
  const visibleComments = comments
    .filter((comment) => !comment.deleted || comment.body.trim().length > 0)
    .sort(sortNormalizedBitbucketComments);
  const commentsById = new Map<number, NormalizedBitbucketComment>();
  for (const comment of visibleComments) {
    commentsById.set(comment.id, comment);
  }

  const rootCache = new Map<number, number>();
  const resolveRootId = (commentId: number) => {
    const cached = rootCache.get(commentId);
    if (cached !== undefined) {
      return cached;
    }

    let current = commentsById.get(commentId);
    if (!current) {
      rootCache.set(commentId, commentId);
      return commentId;
    }

    const visited = new Set<number>([commentId]);
    while (current.parentId !== null) {
      const parent = commentsById.get(current.parentId);
      if (!parent || visited.has(parent.id)) {
        break;
      }
      visited.add(parent.id);
      current = parent;
    }

    rootCache.set(commentId, current.id);
    return current.id;
  };

  const issueComments: PullRequestIssueComment[] = [];
  const reviewThreadComments = new Map<number, NormalizedBitbucketComment[]>();
  for (const comment of visibleComments) {
    const rootId = resolveRootId(comment.id);
    const rootComment = commentsById.get(rootId);
    if (rootComment?.inline) {
      const existing = reviewThreadComments.get(rootId) ?? [];
      existing.push(comment);
      reviewThreadComments.set(rootId, existing);
      continue;
    }

    issueComments.push(toIssueComment(comment));
  }

  const reviewThreads: PullRequestReviewThread[] = [];
  for (const [rootId, threadComments] of reviewThreadComments.entries()) {
    const sortedComments = [...threadComments].sort(sortNormalizedBitbucketComments);
    const rootComment = commentsById.get(rootId) ?? sortedComments[0];
    if (!rootComment) {
      continue;
    }

    const rootInline = rootComment.inline ?? sortedComments.find((value) => value.inline)?.inline ?? null;
    if (!rootInline) {
      continue;
    }
    const rootResolution = rootComment.resolution;

    reviewThreads.push({
      id: `bitbucket-thread:${String(rootId)}`,
      path: rootInline.path,
      line: rootInline.to ?? rootInline.from ?? null,
      startLine: rootInline.startTo ?? rootInline.startFrom ?? null,
      diffSide: rootInline.to ? "RIGHT" : "LEFT",
      isResolved: Boolean(rootResolution),
      isOutdated: false,
      resolvedBy: rootResolution?.user ?? null,
      comments: sortedComments.map((comment) => toReviewComment(comment, rootInline.path)),
    });
  }
  reviewThreads.sort((left, right) => {
    const leftCreatedAt = left.comments[0]?.createdAt ?? "";
    const rightCreatedAt = right.comments[0]?.createdAt ?? "";
    return leftCreatedAt.localeCompare(rightCreatedAt);
  });

  return {
    detail,
    issueComments: issueComments.sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
    reviewThreads,
  };
}

export function bitbucketPullRequestPath(hostedRepo: HostedRepoRef, pullRequestNumber: number) {
  return `/repositories/${encodeURIComponent(hostedRepo.owner)}/${encodeURIComponent(
    hostedRepo.repo,
  )}/pullrequests/${String(pullRequestNumber)}`;
}

async function fetchBitbucketPaginatedValues<T>(
  firstPath: string,
  connection: ProviderConnectionSecret,
) {
  const values: T[] = [];
  let nextPathOrUrl: string | null = firstPath;

  while (nextPathOrUrl) {
    const pageResponse: { data: BitbucketPaginatedResponse<T>; headers: Headers } =
      await bitbucketRequest<BitbucketPaginatedResponse<T>>(nextPathOrUrl, connection);
    const page: BitbucketPaginatedResponse<T> = pageResponse.data;
    values.push(...(Array.isArray(page.values) ? page.values : []));
    nextPathOrUrl = typeof page.next === "string" && page.next.trim() ? page.next : null;
  }

  return values;
}

export async function listBitbucketPullRequests(
  hostedRepo: HostedRepoRef,
  connection: ProviderConnectionSecret,
) {
  const values = await fetchBitbucketPaginatedValues<BitbucketPullRequestResponse>(
    `/repositories/${encodeURIComponent(hostedRepo.owner)}/${encodeURIComponent(
      hostedRepo.repo,
    )}/pullrequests?state=OPEN&sort=-updated_on&pagelen=50`,
    connection,
  );

  return values
    .map((pullRequest) => toBitbucketPullRequestSummary(pullRequest, hostedRepo))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function fetchBitbucketPullRequest(
  hostedRepo: HostedRepoRef,
  connection: ProviderConnectionSecret,
  pullRequestNumber: number,
) {
  const { data } = await bitbucketRequest<BitbucketPullRequestResponse>(
    bitbucketPullRequestPath(hostedRepo, pullRequestNumber),
    connection,
  );

  return data;
}

export async function fetchBitbucketConversation(
  hostedRepo: HostedRepoRef,
  connection: ProviderConnectionSecret,
  pullRequestNumber: number,
) {
  const [pullRequest, comments] = await Promise.all([
    fetchBitbucketPullRequest(hostedRepo, connection, pullRequestNumber),
    fetchBitbucketPaginatedValues<BitbucketCommentResponse>(
      `${bitbucketPullRequestPath(hostedRepo, pullRequestNumber)}/comments?pagelen=100`,
      connection,
    ),
  ]);
  const detail = toBitbucketPullRequestDetail(pullRequest, hostedRepo);

  return toBitbucketConversation(detail, comments.map(normalizeBitbucketComment));
}

export function bitbucketThreadRootDatabaseId(threadId: string) {
  if (!threadId.startsWith("bitbucket-thread:")) {
    return null;
  }

  const value = Number.parseInt(threadId.slice("bitbucket-thread:".length), 10);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }

  return value;
}

export function pickBitbucketCloneUrl(
  repository: BitbucketRepoRef | null | undefined,
  fallbackOwner: string,
  fallbackRepo: string,
) {
  for (const candidate of repository?.links?.clone ?? []) {
    if (candidate.name === "https" && candidate.href) {
      return candidate.href;
    }
  }

  for (const candidate of repository?.links?.clone ?? []) {
    if (candidate.href) {
      return candidate.href;
    }
  }

  const identity = bitbucketRepoIdentity(repository, fallbackOwner, fallbackRepo);
  return `https://bitbucket.org/${identity.owner}/${identity.repo}.git`;
}

export function toBitbucketIssueComment(comment: BitbucketCommentResponse): PullRequestIssueComment {
  return toIssueComment(normalizeBitbucketComment(comment));
}
