import type {
  GitProviderId,
  HostedRepoRef,
  PullRequestChangedFile,
  PullRequestDetail,
  PullRequestIssueComment,
  PullRequestPerson,
  PullRequestReviewComment,
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
  number: number;
  title: string;
  draft: boolean;
  state: "open" | "closed";
  merged_at: string | null;
  html_url: string;
  updated_at: string;
  user: {
    login: string;
    name?: string | null;
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
      NonNullable<
        NonNullable<GitHubReviewThreadGraphResponse["data"]>["repository"]
      >["pullRequest"]
    >["reviewThreads"]
  >["nodes"]
>[number];

type GitHubReviewThreadCommentNode = NonNullable<
  NonNullable<GitHubReviewThreadNode["comments"]>["nodes"]
>[number];

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

export async function githubJsonRequest<T>(
  pathname: string,
  token: string,
  init?: {
    method?: "GET" | "POST";
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
  return {
    id: `${providerId}:${pullRequest.number}`,
    providerId,
    number: pullRequest.number,
    title: pullRequest.title,
    state: mapGitHubPullRequestState(pullRequest),
    isDraft: pullRequest.draft,
    authorLogin: pullRequest.user?.login ?? "unknown",
    authorDisplayName: pullRequest.user?.name ?? null,
    url: pullRequest.html_url,
    baseRef: pullRequest.base.ref,
    headRef: pullRequest.head.ref,
    headOwner: pullRequest.head.repo?.owner.login ?? pullRequest.base.repo.owner.login,
    headRepo: pullRequest.head.repo?.name ?? pullRequest.base.repo.name,
    updatedAt: pullRequest.updated_at,
  };
}

function hasGitHubNextPage(headers: Headers) {
  const linkHeader = headers.get("link");
  if (!linkHeader) {
    return false;
  }

  return linkHeader.split(",").some((entry) => entry.includes('rel="next"'));
}

export async function listGitHubPullRequests(
  hostedRepo: HostedRepoRef,
  token: string,
  page: number,
  perPage: number,
): Promise<PullRequestPage> {
  const normalizedPage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const normalizedPerPage =
    Number.isFinite(perPage) && perPage > 0 ? Math.min(100, Math.floor(perPage)) : 25;
  const pathname = `/repos/${encodeURIComponent(hostedRepo.owner)}/${encodeURIComponent(hostedRepo.repo)}/pulls?state=open&per_page=${String(normalizedPerPage)}&page=${String(normalizedPage)}`;
  const { data, headers } = await githubRequest<GitHubPullRequestResponse[]>(pathname, token);

  return {
    pullRequests: data
      .map((pullRequest) => toPullRequestSummary(pullRequest, hostedRepo.providerId))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    page: normalizedPage,
    perPage: normalizedPerPage,
    hasNextPage: hasGitHubNextPage(headers),
  };
}

export function toPullRequestPerson(user: {
  login: string;
  avatar_url?: string | null;
  avatarUrl?: string | null;
  name?: string | null;
} | null): PullRequestPerson | null {
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
  return {
    id: `issue-comment:${String(comment.id)}`,
    databaseId: comment.id,
    body: comment.body ?? "",
    createdAt: comment.created_at,
    updatedAt: comment.updated_at,
    author: toPullRequestPerson(comment.user),
    url: comment.html_url,
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

  return comments.map(toPullRequestIssueComment).sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt),
  );
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

  const payload = await githubGraphqlRequest<GitHubReviewThreadGraphResponse>(
    token,
    query,
    {
      owner: hostedRepo.owner,
      repo: hostedRepo.repo,
      number: pullRequestNumber,
    },
  );

  const nodes = payload.data?.repository?.pullRequest?.reviewThreads?.nodes ?? [];
  return nodes.map(toPullRequestReviewThread).sort((left, right) => {
    const leftCreatedAt = left.comments[0]?.createdAt ?? "";
    const rightCreatedAt = right.comments[0]?.createdAt ?? "";
    return leftCreatedAt.localeCompare(rightCreatedAt);
  });
}
