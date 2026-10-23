import type {
  GitProviderId,
  HostedRepoRef,
  PullRequestChangedFile,
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

export type GitHubUserResponse = {
  login: string;
  name: string | null;
  avatar_url: string | null;
};

type GitHubRepoSummary = {
  clone_url: string;
  html_url: string;
  name: string;
  owner: {
    login: string;
  };
};

export type GitHubPullRequestResponse = {
  id: number;
  node_id?: string;
  number: number;
  title: string;
  draft: boolean;
  state: "open" | "closed";
  merged_at: string | null;
  mergeable?: boolean | null;
  html_url: string;
  updated_at: string;
  user: {
    login: string;
    name?: string | null;
    avatar_url?: string | null;
  } | null;
  base: {
    ref: string;
    sha: string;
    repo: GitHubRepoSummary;
  };
  head: {
    ref: string;
    sha: string;
    repo: GitHubRepoSummary | null;
  };
  body?: string | null;
  created_at: string;
  requested_reviewers?: Array<{
    login: string;
    name?: string | null;
    avatar_url?: string | null;
  }>;
  labels?: Array<{ name?: string; description?: string | null }>;
};

export type GitHubIssueCommentResponse = {
  id: number;
  body: string;
  created_at: string;
  updated_at: string;
  html_url: string | null;
  user: {
    login: string;
    avatar_url: string | null;
  } | null;
  reactions?: Partial<Record<PullRequestIssueComment["reactions"][number]["content"], number>>;
};

export type GitHubPullRequestFileResponse = {
  filename: string;
  previous_filename?: string | null;
  status: string;
  additions: number;
  deletions: number;
};

type GitHubReviewThreadGraphResponse = {
  data?: {
    repository?: {
      pullRequest?: {
        reviewThreads?: {
          nodes?: Array<{
            id: string;
            isResolved: boolean;
            isOutdated: boolean;
            path: string;
            line: number | null;
            startLine: number | null;
            diffSide: "LEFT" | "RIGHT" | null;
            resolvedBy: {
              login: string;
              avatarUrl: string | null;
            } | null;
            comments?: {
              nodes?: Array<{
                id: string;
                databaseId: number;
                body: string;
                createdAt: string;
                updatedAt?: string | null;
                path: string;
                line: number | null;
                startLine: number | null;
                url?: string | null;
                author: {
                  login: string;
                  avatarUrl: string | null;
                } | null;
              }>;
            };
          }>;
        };
      };
    };
  };
  errors?: Array<{ message: string }>;
};

type GitHubReviewThreadNode = NonNullable<
  NonNullable<
    NonNullable<
      NonNullable<NonNullable<GitHubReviewThreadGraphResponse["data"]>["repository"]>["pullRequest"]
    >["reviewThreads"]
  >["nodes"]
>[number];

type GitHubReviewThreadCommentNode = NonNullable<
  NonNullable<GitHubReviewThreadNode["comments"]>["nodes"]
>[number];

type GitHubPullRequestByHeadGraphResponse = {
  data?: { repository?: { pullRequests?: { nodes?: GitHubSummaryNode[] } } };
  errors?: Array<{ message: string }>;
};

export async function githubRequest<T>(pathname: string, token: string) {
  const response = await fetch(`https://api.github.com${pathname}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "open-warden",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `GitHub request failed with status ${response.status}`);
  }

  return {
    data: (await response.json()) as T,
    headers: response.headers,
  };
}

function githubPermissionErrorHint(message: string) {
  if (message.includes("Resource not accessible by personal access token")) {
    return "Your GitHub token cannot create pull request comments. Reconnect with Issues: write or Pull requests: write permissions for this repository.";
  }

  return null;
}

function parseGitHubErrorMessage(text: string, status: number) {
  try {
    const payload = JSON.parse(text) as {
      message?: unknown;
      documentation_url?: unknown;
      status?: unknown;
    };
    const message =
      typeof payload.message === "string" && payload.message.trim()
        ? payload.message
        : `GitHub request failed with status ${status}`;
    const hint = githubPermissionErrorHint(message);
    return hint ? `${message}. ${hint}` : message;
  } catch {
    const fallback = text.trim() || `GitHub request failed with status ${status}`;
    const hint = githubPermissionErrorHint(fallback);
    return hint ? `${fallback}. ${hint}` : fallback;
  }
}

export async function githubTextRequest(pathname: string, token: string, accept: string) {
  const response = await fetch(`https://api.github.com${pathname}`, {
    headers: {
      Accept: accept,
      Authorization: `Bearer ${token}`,
      "User-Agent": "open-warden",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(parseGitHubErrorMessage(message, response.status));
  }

  return response.text();
}

export async function githubEmptyRequest(
  pathname: string,
  token: string,
  method: "POST" | "DELETE",
) {
  const response = await fetch(`https://api.github.com${pathname}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "open-warden",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!response.ok) {
    throw new Error(parseGitHubErrorMessage(await response.text(), response.status));
  }
}

export async function githubJsonRequest<T>(
  pathname: string,
  token: string,
  init?: {
    method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
    body?: unknown;
  },
) {
  const response = await fetch(`https://api.github.com${pathname}`, {
    method: init?.method ?? "GET",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "open-warden",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(parseGitHubErrorMessage(message, response.status));
  }

  return (await response.json()) as T;
}

export async function githubGraphqlRequest<T>(
  token: string,
  query: string,
  variables: Record<string, unknown>,
) {
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "open-warden",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({
      query,
      variables,
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(parseGitHubErrorMessage(message, response.status));
  }

  const payload = (await response.json()) as T & { errors?: Array<{ message: string }> };
  if (Array.isArray(payload.errors) && payload.errors.length > 0) {
    throw new Error(payload.errors[0]?.message ?? "GitHub GraphQL request failed.");
  }

  return payload;
}

function mapGitHubPullRequestState(pullRequest: GitHubPullRequestResponse): PullRequestState {
  if (pullRequest.merged_at) {
    return "merged";
  }

  return pullRequest.state;
}

export function toPullRequestSummary(
  pullRequest: GitHubPullRequestResponse,
  providerId: GitProviderId,
): PullRequestSummary {
  const reviewers = (pullRequest.requested_reviewers ?? []).map(
    (reviewer): PullRequestReviewer => ({
      id: reviewer.login,
      login: reviewer.login,
      displayName: reviewer.name ?? null,
      avatarUrl: reviewer.avatar_url ?? null,
      state: "requested",
      reviewedAt: null,
    }),
  );
  return {
    id: `${providerId}:${pullRequest.number}`,
    providerId,
    number: pullRequest.number,
    title: pullRequest.title,
    state: mapGitHubPullRequestState(pullRequest),
    isDraft: pullRequest.draft,
    author: {
      login: pullRequest.user?.login ?? "unknown",
      displayName: pullRequest.user?.name ?? null,
      avatarUrl: pullRequest.user?.avatar_url ?? null,
    },
    url: pullRequest.html_url,
    baseRef: pullRequest.base.ref,
    headRef: pullRequest.head.ref,
    headOwner: pullRequest.head.repo?.owner.login ?? pullRequest.base.repo.owner.login,
    headRepo: pullRequest.head.repo?.name ?? pullRequest.base.repo.name,
    createdAt: pullRequest.created_at,
    updatedAt: pullRequest.updated_at,
    reviewers,
    reviewDecision: reviewers.length > 0 ? "review-required" : null,
    checksState: null,
    commentCount: null,
    additions: null,
    deletions: null,
    changedFiles: null,
  };
}

export async function listGitHubPullRequests(
  hostedRepo: HostedRepoRef,
  token: string,
  page: number,
  perPage: number,
  filters?: {
    state?: "open" | "merged" | "closed" | "all";
    query?: string;
    author?: string;
    involvement?: PullRequestInvolvement;
    viewerLogin?: string;
  },
): Promise<PullRequestPage> {
  const normalizedPage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const normalizedPerPage =
    Number.isFinite(perPage) && perPage > 0 ? Math.min(100, Math.floor(perPage)) : 25;
  // Search is the one listing that also returns review decisions, checks, and counts.
  return searchGitHubPullRequests(hostedRepo, token, normalizedPage, normalizedPerPage, {
    state: filters?.state ?? "open",
    query: filters?.query?.trim() ?? "",
    author: filters?.author?.trim() ?? "",
    involvement: filters?.involvement ?? "all",
    viewerLogin: filters?.viewerLogin ?? "",
  });
}

type GitHubGraphActor = { login: string; avatarUrl?: string | null; name?: string | null } | null;

/** Everything a list row shows, shared by search and the head-branch lookup. */
const PULL_REQUEST_SUMMARY_FIELDS = `
  number title state isDraft url createdAt updatedAt baseRefName headRefName
  additions deletions changedFiles reviewDecision totalCommentsCount
  author { login avatarUrl ... on User { name } }
  baseRepository { name owner { login } }
  headRepository { name owner { login } }
  reviewRequests(first: 10) {
    nodes { requestedReviewer { ... on User { login name avatarUrl } } }
  }
  latestOpinionatedReviews(first: 10) {
    nodes { state submittedAt author { login avatarUrl ... on User { name } } }
  }
  commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
`;

type GitHubSummaryNode = {
  number: number;
  title: string;
  state: "OPEN" | "CLOSED" | "MERGED";
  isDraft: boolean;
  url: string;
  createdAt: string;
  updatedAt: string;
  baseRefName: string;
  headRefName: string;
  additions?: number | null;
  deletions?: number | null;
  changedFiles?: number | null;
  reviewDecision?: "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | null;
  totalCommentsCount?: number | null;
  author: GitHubGraphActor;
  headRepository: { name: string; owner: { login: string } } | null;
  baseRepository: { name: string; owner: { login: string } } | null;
  reviewRequests?: {
    nodes?: Array<{ requestedReviewer: GitHubGraphActor | Record<string, never> } | null>;
  };
  latestOpinionatedReviews?: {
    nodes?: Array<{ state: string; submittedAt: string | null; author: GitHubGraphActor } | null>;
  };
  commits?: { nodes?: Array<{ commit: { statusCheckRollup: { state: string } | null } } | null> };
};

type GitHubSearchPullRequestNode = GitHubSummaryNode & { __typename: "PullRequest" };

function githubSummaryReviewers(node: GitHubSummaryNode): PullRequestReviewer[] {
  const byLogin = new Map<string, PullRequestReviewer>();
  for (const review of node.latestOpinionatedReviews?.nodes ?? []) {
    const login = review?.author?.login;
    const state =
      review?.state === "APPROVED"
        ? "approved"
        : review?.state === "CHANGES_REQUESTED"
          ? "changes-requested"
          : null;
    if (!login || !state) continue;
    byLogin.set(login, {
      id: login,
      login,
      displayName: review.author?.name ?? null,
      avatarUrl: review.author?.avatarUrl ?? null,
      state,
      reviewedAt: review.submittedAt,
    });
  }
  // A re-requested review is owed again, whatever the reviewer said before.
  for (const request of node.reviewRequests?.nodes ?? []) {
    const reviewer = request?.requestedReviewer;
    if (!reviewer || !("login" in reviewer) || !reviewer.login) continue;
    byLogin.set(reviewer.login, {
      id: reviewer.login,
      login: reviewer.login,
      displayName: reviewer.name ?? null,
      avatarUrl: reviewer.avatarUrl ?? null,
      state: "requested",
      reviewedAt: null,
    });
  }
  return Array.from(byLogin.values());
}

function githubChecksState(node: GitHubSummaryNode): PullRequestSummary["checksState"] {
  const state = node.commits?.nodes?.[0]?.commit.statusCheckRollup?.state;
  if (state === "SUCCESS") return "passed";
  if (state === "FAILURE" || state === "ERROR") return "failed";
  if (state === "PENDING" || state === "EXPECTED") return "pending";
  return null;
}

function toPullRequestSummaryFromNode(
  node: GitHubSummaryNode,
  hostedRepo: HostedRepoRef,
): PullRequestSummary {
  const baseOwner = node.baseRepository?.owner?.login ?? hostedRepo.owner;
  const baseRepo = node.baseRepository?.name ?? hostedRepo.repo;
  return {
    id: `${hostedRepo.providerId}:${String(node.number)}`,
    providerId: hostedRepo.providerId,
    number: node.number,
    title: node.title,
    state: node.state === "MERGED" ? "merged" : node.state === "CLOSED" ? "closed" : "open",
    isDraft: node.isDraft,
    author: {
      login: node.author?.login?.trim() || "unknown",
      displayName: node.author?.name ?? null,
      avatarUrl: node.author?.avatarUrl ?? null,
    },
    url: node.url,
    baseRef: node.baseRefName,
    headRef: node.headRefName,
    headOwner: node.headRepository?.owner?.login ?? baseOwner,
    headRepo: node.headRepository?.name ?? baseRepo,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    reviewers: githubSummaryReviewers(node),
    reviewDecision:
      node.reviewDecision === "APPROVED"
        ? "approved"
        : node.reviewDecision === "CHANGES_REQUESTED"
          ? "changes-requested"
          : node.reviewDecision === "REVIEW_REQUIRED"
            ? "review-required"
            : null,
    checksState: githubChecksState(node),
    commentCount: node.totalCommentsCount ?? null,
    additions: node.additions ?? null,
    deletions: node.deletions ?? null,
    changedFiles: node.changedFiles ?? null,
  };
}

type GitHubPullRequestSearchResponse = {
  data?: {
    search?: {
      nodes?: Array<GitHubSearchPullRequestNode | null>;
      pageInfo: { endCursor: string | null; hasNextPage: boolean };
    };
  };
};

function githubSearchQuery(input: {
  hostedRepo: HostedRepoRef;
  state: "open" | "merged" | "closed" | "all";
  query: string;
  author: string;
  involvement: PullRequestInvolvement;
  viewerLogin: string;
}) {
  if (input.author && !/^[a-zA-Z0-9-]+$/.test(input.author)) {
    throw new Error("Enter a GitHub username without spaces or punctuation.");
  }
  if (input.involvement !== "all" && !/^[a-zA-Z0-9-]+$/.test(input.viewerLogin)) {
    throw new Error("The connected GitHub account could not be identified.");
  }
  const states = {
    open: ["is:open"],
    merged: ["is:merged"],
    closed: ["is:closed", "is:unmerged"],
    all: [],
  }[input.state];
  return [
    `repo:${input.hostedRepo.owner}/${input.hostedRepo.repo}`,
    "is:pr",
    ...states,
    ...(input.query ? [JSON.stringify(input.query), "in:title,body"] : []),
    ...(input.author ? [`author:${input.author}`] : []),
    ...(input.involvement === "all"
      ? []
      : [
          {
            authored: `author:${input.viewerLogin}`,
            "review-requested": `review-requested:${input.viewerLogin}`,
            involved: `involves:${input.viewerLogin}`,
          }[input.involvement],
        ]),
    "sort:updated-desc",
  ].join(" ");
}

async function searchGitHubPullRequests(
  hostedRepo: HostedRepoRef,
  token: string,
  page: number,
  perPage: number,
  filters: {
    state: "open" | "merged" | "closed" | "all";
    query: string;
    author: string;
    involvement: PullRequestInvolvement;
    viewerLogin: string;
  },
): Promise<PullRequestPage> {
  const searchQuery = githubSearchQuery({ hostedRepo, ...filters });
  const graphQuery = `
    query($query: String!, $first: Int!, $after: String) {
      search(query: $query, type: ISSUE, first: $first, after: $after) {
        pageInfo { endCursor hasNextPage }
        nodes {
          __typename
          ... on PullRequest { ${PULL_REQUEST_SUMMARY_FIELDS} }
        }
      }
    }
  `;
  let cursor: string | null = null;
  let search: NonNullable<NonNullable<GitHubPullRequestSearchResponse["data"]>["search"]> | null =
    null;
  for (let currentPage = 1; currentPage <= page; currentPage += 1) {
    const response: GitHubPullRequestSearchResponse = await githubGraphqlRequest(
      token,
      graphQuery,
      { query: searchQuery, first: perPage, after: cursor },
    );
    search = response.data?.search ?? null;
    if (!search) throw new Error("GitHub did not return pull request search results.");
    if (currentPage < page && !search.pageInfo.hasNextPage) {
      return { pullRequests: [], page, perPage, hasNextPage: false };
    }
    cursor = search.pageInfo.endCursor;
  }
  const pullRequests = (search?.nodes ?? []).flatMap((node): PullRequestSummary[] =>
    node?.__typename === "PullRequest" ? [toPullRequestSummaryFromNode(node, hostedRepo)] : [],
  );
  return { pullRequests, page, perPage, hasNextPage: search?.pageInfo.hasNextPage ?? false };
}

export async function resolveGitHubOpenPullRequestForBranch(
  hostedRepo: HostedRepoRef,
  token: string,
  branch: string,
): Promise<PullRequestSummary | null> {
  const normalizedBranch = branch.trim();
  if (!normalizedBranch) {
    return null;
  }

  const query = `
    query ResolveActivePullRequestForBranch($owner: String!, $repo: String!, $headRefName: String!) {
      repository(owner: $owner, name: $repo) {
        pullRequests(
          first: 20
          states: OPEN
          headRefName: $headRefName
          orderBy: { field: UPDATED_AT, direction: DESC }
        ) {
          nodes { ${PULL_REQUEST_SUMMARY_FIELDS} }
        }
      }
    }
  `;

  try {
    const payload = await githubGraphqlRequest<GitHubPullRequestByHeadGraphResponse>(token, query, {
      owner: hostedRepo.owner,
      repo: hostedRepo.repo,
      headRefName: normalizedBranch,
    });
    const nodes = payload.data?.repository?.pullRequests?.nodes ?? [];
    const match = nodes.find((node) => node.headRefName === normalizedBranch) ?? nodes[0] ?? null;
    return match ? toPullRequestSummaryFromNode(match, hostedRepo) : null;
  } catch {
    const page = await listGitHubPullRequests(hostedRepo, token, 1, 100);
    return (
      page.pullRequests.find((pullRequest) => pullRequest.headRef === normalizedBranch) ?? null
    );
  }
}

export function toPullRequestPerson(
  user: {
    login: string;
    avatar_url?: string | null;
    avatarUrl?: string | null;
    name?: string | null;
  } | null,
): PullRequestPerson | null {
  if (!user) {
    return null;
  }

  return {
    login: user.login,
    displayName: user.name ?? null,
    avatarUrl: user.avatar_url ?? user.avatarUrl ?? null,
  };
}

export function toPullRequestDetail(
  pullRequest: GitHubPullRequestResponse,
  providerId: GitProviderId,
): PullRequestDetail {
  return {
    id: `${providerId}:${String(pullRequest.number)}`,
    providerId,
    number: pullRequest.number,
    title: pullRequest.title,
    body: pullRequest.body ?? "",
    state: mapGitHubPullRequestState(pullRequest),
    isDraft: pullRequest.draft,
    url: pullRequest.html_url,
    author: toPullRequestPerson(pullRequest.user),
    baseRef: pullRequest.base.ref,
    headRef: pullRequest.head.ref,
    baseSha: pullRequest.base.sha,
    headSha: pullRequest.head.sha,
    createdAt: pullRequest.created_at,
    updatedAt: pullRequest.updated_at,
    labels: (pullRequest.labels ?? []).flatMap((label) =>
      label.name ? [{ name: label.name, description: label.description ?? null }] : [],
    ),
  };
}

function toPullRequestChangedFileStatus(status: string): PullRequestChangedFile["status"] {
  if (status === "added") return "added";
  if (status === "removed") return "deleted";
  if (status === "renamed") return "renamed";
  if (status === "copied") return "copied";
  return "modified";
}

export function toPullRequestChangedFile(
  file: GitHubPullRequestFileResponse,
): PullRequestChangedFile {
  return {
    path: file.filename,
    previousPath: file.previous_filename ?? null,
    status: toPullRequestChangedFileStatus(file.status),
    additions: Number.isFinite(file.additions) ? file.additions : 0,
    deletions: Number.isFinite(file.deletions) ? file.deletions : 0,
  };
}

export function toPullRequestIssueComment(
  comment: GitHubIssueCommentResponse,
): PullRequestIssueComment {
  const reactionContents = [
    "+1",
    "-1",
    "laugh",
    "hooray",
    "confused",
    "heart",
    "rocket",
    "eyes",
  ] as const;
  return {
    id: `issue-comment:${String(comment.id)}`,
    databaseId: comment.id,
    body: comment.body ?? "",
    createdAt: comment.created_at,
    updatedAt: comment.updated_at,
    author: toPullRequestPerson(comment.user),
    url: comment.html_url,
    reactions: reactionContents.flatMap((content) => {
      const count = comment.reactions?.[content] ?? 0;
      return count > 0 ? [{ content, count }] : [];
    }),
  };
}

function toPullRequestReviewThread(thread: GitHubReviewThreadNode): PullRequestReviewThread {
  return {
    id: thread.id,
    path: thread.path,
    line: thread.line ?? null,
    startLine: thread.startLine ?? null,
    diffSide: thread.diffSide ?? "RIGHT",
    isResolved: thread.isResolved,
    isOutdated: thread.isOutdated,
    resolvedBy: toPullRequestPerson(thread.resolvedBy),
    comments: (thread.comments?.nodes ?? []).map<PullRequestReviewComment>(
      (comment: GitHubReviewThreadCommentNode) => ({
        id: comment.id,
        databaseId: comment.databaseId,
        body: comment.body ?? "",
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt ?? comment.createdAt,
        author: toPullRequestPerson(comment.author),
        path: comment.path,
        line: comment.line ?? null,
        startLine: comment.startLine ?? null,
        url: comment.url ?? null,
      }),
    ),
  };
}

export async function fetchGitHubPullRequest(
  hostedRepo: HostedRepoRef,
  token: string,
  pullRequestNumber: number,
) {
  const { data } = await githubRequest<GitHubPullRequestResponse>(
    `/repos/${encodeURIComponent(hostedRepo.owner)}/${encodeURIComponent(hostedRepo.repo)}/pulls/${String(pullRequestNumber)}`,
    token,
  );

  return data;
}

export async function fetchGitHubPullRequestPatch(
  hostedRepo: HostedRepoRef,
  token: string,
  pullRequestNumber: number,
) {
  return githubTextRequest(
    `/repos/${encodeURIComponent(hostedRepo.owner)}/${encodeURIComponent(hostedRepo.repo)}/pulls/${String(pullRequestNumber)}`,
    token,
    "application/vnd.github.v3.diff",
  );
}

export async function fetchGitHubPullRequestFiles(
  hostedRepo: HostedRepoRef,
  token: string,
  pullRequestNumber: number,
) {
  const files = await githubJsonRequest<GitHubPullRequestFileResponse[]>(
    `/repos/${encodeURIComponent(hostedRepo.owner)}/${encodeURIComponent(hostedRepo.repo)}/pulls/${String(pullRequestNumber)}/files?per_page=100`,
    token,
  );

  return files.map(toPullRequestChangedFile);
}

export async function fetchGitHubIssueComments(
  hostedRepo: HostedRepoRef,
  token: string,
  pullRequestNumber: number,
) {
  const comments = await githubJsonRequest<GitHubIssueCommentResponse[]>(
    `/repos/${encodeURIComponent(hostedRepo.owner)}/${encodeURIComponent(hostedRepo.repo)}/issues/${String(pullRequestNumber)}/comments?per_page=100`,
    token,
  );

  return comments
    .map(toPullRequestIssueComment)
    .toSorted((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export async function fetchGitHubReviewThreads(
  hostedRepo: HostedRepoRef,
  token: string,
  pullRequestNumber: number,
) {
  const query = `
    query($owner: String!, $repo: String!, $number: Int!) {
      repository(owner: $owner, name: $repo) {
        pullRequest(number: $number) {
          reviewThreads(first: 100) {
            nodes {
              id
              isResolved
              isOutdated
              path
              line
              startLine
              diffSide
              resolvedBy {
                login
                avatarUrl
              }
              comments(first: 30) {
                nodes {
                  id
                  databaseId
                  body
                  createdAt
                  updatedAt
                  path
                  line
                  startLine
                  url
                  author {
                    login
                    avatarUrl
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  const payload = await githubGraphqlRequest<GitHubReviewThreadGraphResponse>(token, query, {
    owner: hostedRepo.owner,
    repo: hostedRepo.repo,
    number: pullRequestNumber,
  });

  const nodes = payload.data?.repository?.pullRequest?.reviewThreads?.nodes ?? [];
  return nodes.map(toPullRequestReviewThread).toSorted((left, right) => {
    const leftCreatedAt = left.comments[0]?.createdAt ?? "";
    const rightCreatedAt = right.comments[0]?.createdAt ?? "";
    return leftCreatedAt.localeCompare(rightCreatedAt);
  });
}
