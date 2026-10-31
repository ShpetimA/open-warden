import { DesktopAdapterError, providerFailure } from "./desktop-failure";
import type {
  HostedRepoRef,
  PullRequestChangedFile,
  PullRequestConversation,
  PullRequestDetail,
  PullRequestInvolvement,
  PullRequestIssueComment,
  PullRequestPerson,
  PullRequestReviewComment,
  PullRequestReviewer,
  PullRequestReviewThread,
  PullRequestState,
  PullRequestSummary,
  PullRequestPage,
} from "../src/platform/desktop/contracts";
import type { ProviderConnectionSecret } from "./providerConnections";
import { collectBitbucketPages } from "./bitbucket-pagination";

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
  comment_count?: number;
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
  reviewers?: Array<{
    uuid?: string;
    nickname?: string;
    username?: string;
    display_name?: string;
    links?: { avatar?: { href?: string } };
  }>;
  participants?: Array<{
    user?: {
      uuid?: string;
      nickname?: string;
      username?: string;
      display_name?: string;
      links?: { avatar?: { href?: string } };
    };
    approved?: boolean;
    state?: string | null;
    participated_on?: string | null;
  }>;
};

export type BitbucketDiffstatResponse = {
  status?: string;
  old?: {
    path?: string;
  } | null;
  new?: {
    path?: string;
  } | null;
  lines_added?: number;
  lines_removed?: number;
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

export function bitbucketAuthorizationValue(connection: BitbucketAuth) {
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
    throw new DesktopAdapterError(
      providerFailure("bitbucket", response.status, response.headers, Date.now()),
    );
  }

  if (init?.responseType === "text") {
    return {
      data: (await response.text()) as T,
      headers: response.headers,
      status: response.status,
    };
  }

  return {
    data: (await response.json()) as T,
    headers: response.headers,
    status: response.status,
  };
}

export function bitbucketAuthorLogin(
  author:
    | {
        username?: string;
        nickname?: string;
        uuid?: string;
        account_id?: string;
      }
    | null
    | undefined,
) {
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

function toBitbucketPerson(
  user: {
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
  } | null,
): PullRequestPerson | null {
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

type BitbucketParticipant = NonNullable<BitbucketPullRequestResponse["participants"]>[number];

function bitbucketVerdict(participation: BitbucketParticipant | undefined) {
  if (participation?.state === "changes_requested") return "changes-requested" as const;
  return participation?.approved || participation?.state === "approved"
    ? ("approved" as const)
    : null;
}

/**
 * Requested reviewers with their latest verdict, plus anyone else who approved or asked for
 * changes without being asked. Bitbucket keeps verdicts on the participant list.
 */
export function bitbucketReviewers(
  pullRequest: BitbucketPullRequestResponse,
): PullRequestReviewer[] {
  const participants = pullRequest.participants ?? [];
  const reviewers = (pullRequest.reviewers ?? []).map((reviewer): PullRequestReviewer => {
    const participation = participants.find(
      (item) => item.user?.uuid && item.user.uuid === reviewer.uuid,
    );
    return {
      id: reviewer.uuid ?? reviewer.nickname ?? reviewer.username ?? "",
      login: reviewer.nickname ?? reviewer.username ?? reviewer.uuid ?? "unknown",
      displayName: reviewer.display_name ?? null,
      avatarUrl: reviewer.links?.avatar?.href ?? null,
      state: bitbucketVerdict(participation) ?? "requested",
      reviewedAt: participation?.participated_on ?? null,
    };
  });
  const reviewerIds = new Set(reviewers.map((reviewer) => reviewer.id));
  for (const participation of participants) {
    const state = bitbucketVerdict(participation);
    const user = participation.user;
    if (!state || !user?.uuid || reviewerIds.has(user.uuid)) continue;
    reviewers.push({
      id: user.uuid,
      login: user.nickname ?? user.username ?? user.uuid,
      displayName: user.display_name ?? null,
      avatarUrl: user.links?.avatar?.href ?? null,
      state,
      reviewedAt: participation.participated_on ?? null,
    });
  }
  return reviewers;
}

export function reviewDecisionFromReviewers(
  reviewers: PullRequestReviewer[],
): PullRequestSummary["reviewDecision"] {
  if (reviewers.some((reviewer) => reviewer.state === "changes-requested")) {
    return "changes-requested";
  }
  if (reviewers.length === 0) return null;
  return reviewers.some((reviewer) => reviewer.state === "requested")
    ? "review-required"
    : reviewers.some((reviewer) => reviewer.state === "approved")
      ? "approved"
      : "review-required";
}

export function toBitbucketPullRequestSummary(
  pullRequest: BitbucketPullRequestResponse,
  hostedRepo: HostedRepoRef,
): PullRequestSummary {
  const sourceRepoIdentity = bitbucketRepoIdentity(
    pullRequest.source?.repository ?? null,
    hostedRepo.owner,
    hostedRepo.repo,
  );
  const createdAt = pullRequest.created_on ?? new Date(0).toISOString();
  const author = pullRequest.author ?? null;
  const reviewers = bitbucketReviewers(pullRequest);

  return {
    id: `${hostedRepo.providerId}:${String(pullRequest.id)}`,
    providerId: hostedRepo.providerId,
    number: pullRequest.id,
    title: pullRequest.title ?? "",
    state: mapBitbucketPullRequestState(pullRequest.state),
    isDraft: pullRequest.draft ?? false,
    author: {
      login: bitbucketAuthorLogin(author),
      displayName: author?.display_name ?? null,
      avatarUrl: author?.links?.avatar?.href ?? null,
    },
    url:
      pullRequest.links?.html?.href ??
      `${hostedRepo.webUrl}/pull-requests/${String(pullRequest.id)}`,
    baseRef: pullRequest.destination?.branch?.name ?? "",
    headRef: pullRequest.source?.branch?.name ?? "",
    headOwner: sourceRepoIdentity.owner,
    headRepo: sourceRepoIdentity.repo,
    createdAt,
    updatedAt: pullRequest.updated_on ?? createdAt,
    reviewers,
    reviewDecision: reviewDecisionFromReviewers(reviewers),
    checksState: null,
    commentCount: pullRequest.comment_count ?? null,
    additions: null,
    deletions: null,
    changedFiles: null,
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
    url:
      pullRequest.links?.html?.href ??
      `${hostedRepo.webUrl}/pull-requests/${String(pullRequest.id)}`,
    author: toBitbucketPerson(pullRequest.author ?? null),
    baseRef: pullRequest.destination?.branch?.name ?? "",
    headRef: pullRequest.source?.branch?.name ?? "",
    baseSha: pullRequest.destination?.commit?.hash ?? "",
    headSha: pullRequest.source?.commit?.hash ?? "",
    createdAt: pullRequest.created_on ?? new Date(0).toISOString(),
    updatedAt: pullRequest.updated_on ?? pullRequest.created_on ?? new Date(0).toISOString(),
    labels: [],
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
        startFrom:
          typeof comment.inline?.start_from === "number" ? comment.inline.start_from : null,
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
    reactions: [],
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
    .toSorted(sortNormalizedBitbucketComments);
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
    const sortedComments = [...threadComments].toSorted(sortNormalizedBitbucketComments);
    const rootComment = commentsById.get(rootId) ?? sortedComments[0];
    if (!rootComment) {
      continue;
    }

    const rootInline =
      rootComment.inline ?? sortedComments.find((value) => value.inline)?.inline ?? null;
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
    issueComments: issueComments.toSorted((left, right) =>
      left.createdAt.localeCompare(right.createdAt),
    ),
    reviewThreads,
  };
}

export function bitbucketPullRequestsPath(hostedRepo: HostedRepoRef) {
  return `/repositories/${encodeURIComponent(hostedRepo.owner)}/${encodeURIComponent(
    hostedRepo.repo,
  )}/pullrequests`;
}

export function bitbucketPullRequestPath(hostedRepo: HostedRepoRef, pullRequestNumber: number) {
  return `${bitbucketPullRequestsPath(hostedRepo)}/${String(pullRequestNumber)}`;
}

function bitbucketFilterLiteral(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

async function fetchBitbucketPaginatedValues<T>(
  firstPath: string,
  connection: ProviderConnectionSecret,
) {
  const result = await collectBitbucketPages(firstPath, async (url) => {
    const { data } = await bitbucketRequest<BitbucketPaginatedResponse<T>>(url, connection);
    return data;
  });
  if (result.ok) return result.values;
  if (result.error.code === "request") throw result.error.cause;
  throw new Error(result.error.message);
}

export async function listBitbucketPullRequests(
  hostedRepo: HostedRepoRef,
  connection: ProviderConnectionSecret,
  page: number,
  perPage: number,
  filters?: {
    state?: "open" | "merged" | "closed" | "all";
    query?: string;
    author?: string;
    involvement?: PullRequestInvolvement;
  },
): Promise<PullRequestPage> {
  const normalizedPage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const normalizedPerPage =
    Number.isFinite(perPage) && perPage > 0 ? Math.min(100, Math.floor(perPage)) : 25;

  const state = filters?.state ?? "open";
  const states = {
    open: ["OPEN"],
    merged: ["MERGED"],
    closed: ["DECLINED", "SUPERSEDED"],
    all: ["OPEN", "MERGED", "DECLINED", "SUPERSEDED"],
  }[state];
  const predicates: string[] = [];
  const query = filters?.query?.trim() ?? "";
  if (query) {
    const literal = bitbucketFilterLiteral(query);
    predicates.push(`(title ~ "${literal}" OR description ~ "${literal}")`);
  }
  const author = filters?.author?.trim() ?? "";
  if (author) predicates.push(`author.nickname = "${bitbucketFilterLiteral(author)}"`);
  const involvement = filters?.involvement ?? "all";
  let viewerId: string | null = null;
  if (involvement !== "all") {
    const { data: viewer } = await bitbucketRequest<BitbucketUserResponse>("/user", connection);
    if (!viewer.uuid) throw new Error("The connected Bitbucket account could not be identified.");
    viewerId = viewer.uuid;
    const id = bitbucketFilterLiteral(viewer.uuid);
    predicates.push(
      {
        authored: `author.uuid = "${id}"`,
        "review-requested": `reviewers.uuid = "${id}"`,
        involved: `(author.uuid = "${id}" OR reviewers.uuid = "${id}")`,
      }[involvement],
    );
  }
  const params = new URLSearchParams({
    sort: "-updated_on",
    // Collections leave reviewers and participants out unless asked for.
    fields: "+values.reviewers,+values.participants",
    pagelen: String(normalizedPerPage),
    page: String(normalizedPage),
  });
  if (predicates.length > 0) {
    // Bitbucket ignores the `state` parameter once `q` is present, so the states join the query.
    const stateFilter = states.map((value) => `state = "${value}"`).join(" OR ");
    params.set("q", [`(${stateFilter})`, ...predicates].join(" AND "));
  } else {
    for (const value of states) params.append("state", value);
  }
  const pathname = `${bitbucketPullRequestsPath(hostedRepo)}?${params.toString()}`;

  const { data } = await bitbucketRequest<BitbucketPaginatedResponse<BitbucketPullRequestResponse>>(
    pathname,
    connection,
  );

  const values = Array.isArray(data.values) ? data.values : [];

  const summaries = values.map((pullRequest) =>
    toBitbucketPullRequestSummary(pullRequest, hostedRepo),
  );

  return {
    // The query can only say "I am a reviewer"; whether my review is still owed is in the verdicts.
    pullRequests: (involvement === "review-requested"
      ? summaries.filter((summary) =>
          summary.reviewers.some(
            (reviewer) => reviewer.id === viewerId && reviewer.state === "requested",
          ),
        )
      : summaries
    ).toSorted((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    page: normalizedPage,
    perPage: normalizedPerPage,
    hasNextPage: typeof data.next === "string" && data.next.trim().length > 0,
  };
}

export async function resolveBitbucketOpenPullRequestForBranch(
  hostedRepo: HostedRepoRef,
  connection: ProviderConnectionSecret,
  branch: string,
): Promise<PullRequestSummary | null> {
  const normalizedBranch = branch.trim();
  if (!normalizedBranch) {
    return null;
  }

  const encodedQuery = encodeURIComponent(
    `state = "OPEN" AND source.branch.name = "${normalizedBranch.replaceAll('"', '\\"')}"`,
  );
  const pathname = `/repositories/${encodeURIComponent(hostedRepo.owner)}/${encodeURIComponent(
    hostedRepo.repo,
  )}/pullrequests?sort=-updated_on&pagelen=20&q=${encodedQuery}`;
  const { data } = await bitbucketRequest<BitbucketPaginatedResponse<BitbucketPullRequestResponse>>(
    pathname,
    connection,
  );
  const values = Array.isArray(data.values) ? data.values : [];
  const match =
    values.find((pullRequest) => (pullRequest.source?.branch?.name ?? "") === normalizedBranch) ??
    values[0] ??
    null;

  return match ? toBitbucketPullRequestSummary(match, hostedRepo) : null;
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

function toBitbucketPullRequestChangedFileStatus(
  status: string | undefined,
): PullRequestChangedFile["status"] {
  if (status === "added") return "added";
  if (status === "removed" || status === "deleted") return "deleted";
  if (status === "renamed") return "renamed";
  if (status === "copied") return "copied";
  return "modified";
}

function toBitbucketPullRequestChangedFile(
  file: BitbucketDiffstatResponse,
): PullRequestChangedFile | null {
  const nextPath = file.new?.path?.trim() ?? "";
  const previousPath = file.old?.path?.trim() ?? "";
  const path = nextPath || previousPath;
  if (!path) {
    return null;
  }

  const normalizedPreviousPath = previousPath && previousPath !== path ? previousPath : null;
  return {
    path,
    previousPath: normalizedPreviousPath,
    status: toBitbucketPullRequestChangedFileStatus(file.status),
    additions: typeof file.lines_added === "number" ? file.lines_added : 0,
    deletions: typeof file.lines_removed === "number" ? file.lines_removed : 0,
  };
}

export async function fetchBitbucketPullRequestPatch(
  hostedRepo: HostedRepoRef,
  connection: ProviderConnectionSecret,
  pullRequestNumber: number,
) {
  const { data } = await bitbucketRequest<string>(
    `${bitbucketPullRequestPath(hostedRepo, pullRequestNumber)}/diff`,
    connection,
    { responseType: "text" },
  );

  return data;
}

export async function fetchBitbucketPullRequestFiles(
  hostedRepo: HostedRepoRef,
  connection: ProviderConnectionSecret,
  pullRequestNumber: number,
) {
  const values = await fetchBitbucketPaginatedValues<BitbucketDiffstatResponse>(
    `${bitbucketPullRequestPath(hostedRepo, pullRequestNumber)}/diffstat?pagelen=100`,
    connection,
  );

  return values
    .map(toBitbucketPullRequestChangedFile)
    .filter((file): file is PullRequestChangedFile => file !== null);
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

export function toBitbucketIssueComment(
  comment: BitbucketCommentResponse,
): PullRequestIssueComment {
  return toIssueComment(normalizeBitbucketComment(comment));
}
