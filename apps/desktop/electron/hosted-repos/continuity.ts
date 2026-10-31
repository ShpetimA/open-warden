import type {
  PullRequestActivity,
  PullRequestActivityEvent,
  PullRequestActivityItem,
  PullRequestPerson,
  PullRequestLocatorInput,
  PullRequestViewedFiles,
  SetPullRequestFileViewedInput,
} from "../../src/platform/desktop/contracts";
import { bitbucketPullRequestPath, bitbucketRequest } from "../bitbucket-repo";
import { fetchGitHubPullRequest, githubGraphqlRequest, githubRequest } from "../github-repo";
import { resolvePullRequestContext } from "./pullRequests";

type GitHubViewedPage = {
  data?: {
    repository?: {
      pullRequest?: {
        files?: {
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
          nodes: Array<{ path: string; viewerViewedState: string } | null>;
        };
      };
    };
  };
};

export async function getPullRequestViewedFiles(
  input: PullRequestLocatorInput,
): Promise<PullRequestViewedFiles> {
  const { hostedRepo, connection } = await resolvePullRequestContext(input);
  if (hostedRepo.providerId === "bitbucket")
    return { storage: "device", viewedPaths: [], truncated: false };
  if (hostedRepo.providerId !== "github")
    throw new Error("Viewed files are not available for this provider.");
  const viewedPaths: string[] = [];
  let cursor: string | null = null;
  let truncated = false;
  for (let page = 0; page < 20; page += 1) {
    const response: GitHubViewedPage = await githubGraphqlRequest<GitHubViewedPage>(
      connection.token,
      `query($owner: String!, $repo: String!, $number: Int!, $after: String) {
        repository(owner: $owner, name: $repo) { pullRequest(number: $number) {
          files(first: 100, after: $after) { pageInfo { hasNextPage endCursor } nodes { path viewerViewedState } }
        } }
      }`,
      {
        owner: hostedRepo.owner,
        repo: hostedRepo.repo,
        number: input.pullRequestNumber,
        after: cursor,
      },
    );
    const files = response.data?.repository?.pullRequest?.files;
    if (!files) throw new Error("GitHub did not return viewed file state for this pull request.");
    for (const file of files.nodes ?? [])
      if (file?.path && file.viewerViewedState === "VIEWED") viewedPaths.push(file.path);
    if (!files.pageInfo.hasNextPage) return { storage: "provider", viewedPaths, truncated: false };
    cursor = files.pageInfo.endCursor;
    if (!cursor) throw new Error("GitHub did not return the next viewed-files cursor.");
    truncated = true;
  }
  return { storage: "provider", viewedPaths, truncated };
}

export async function setPullRequestFileViewed(
  input: SetPullRequestFileViewedInput,
): Promise<void> {
  const path = input.path.trim();
  if (!path) throw new Error("Choose a file to mark viewed.");
  const { hostedRepo, connection } = await resolvePullRequestContext(input);
  if (hostedRepo.providerId !== "github")
    throw new Error("This provider keeps viewed files on this device.");
  const pullRequest = await fetchGitHubPullRequest(
    hostedRepo,
    connection.token,
    input.pullRequestNumber,
  );
  if (!pullRequest.node_id) throw new Error("GitHub did not return this pull request's ID.");
  const mutation = input.viewed ? "markFileAsViewed" : "unmarkFileAsViewed";
  await githubGraphqlRequest(
    connection.token,
    `mutation($id: ID!, $path: String!) { ${mutation}(input: { pullRequestId: $id, path: $path }) { clientMutationId } }`,
    { id: pullRequest.node_id, path },
  );
}

type GitHubUser = { login?: string; avatar_url?: string; type?: string } | null;

type GitHubTimelineEvent = {
  id: number;
  event: string;
  created_at?: string;
  submitted_at?: string;
  actor?: GitHubUser;
  user?: GitHubUser;
  state?: string;
  body?: string | null;
  label?: { name?: string };
  requested_reviewer?: GitHubUser;
  rename?: { from?: string; to?: string };
  html_url?: string;
};

type GitHubCommit = {
  sha: string;
  html_url?: string;
  commit?: { message?: string; author?: { name?: string; date?: string } };
  author?: GitHubUser;
};

const githubEvents: Record<string, PullRequestActivityEvent> = {
  assigned: "assigned",
  unassigned: "unassigned",
  closed: "closed",
  reopened: "reopened",
  merged: "merged",
  review_requested: "review-requested",
  review_request_removed: "review-request-removed",
  head_ref_force_pushed: "force-pushed",
  ready_for_review: "ready",
  converted_to_draft: "draft",
  renamed: "renamed",
  labeled: "labeled",
  unlabeled: "unlabeled",
  auto_merge_enabled: "auto-merge-enabled",
  auto_merge_disabled: "auto-merge-disabled",
};

function githubPerson(user: GitHubUser | undefined): PullRequestPerson | null {
  if (!user?.login) return null;
  return { login: user.login, displayName: null, avatarUrl: user.avatar_url ?? null };
}

function githubReviewEvent(state: string | undefined): PullRequestActivityEvent | null {
  if (state === "approved") return "approved";
  if (state === "changes_requested") return "changes-requested";
  if (state === "commented") return "reviewed";
  return null;
}

function toGitHubEvent(item: GitHubTimelineEvent): PullRequestActivityItem | null {
  const body = item.body?.trim() || null;
  const event =
    item.event === "reviewed" ? githubReviewEvent(item.state) : (githubEvents[item.event] ?? null);
  // A "commented" review without a summary only wraps inline threads, which have their own place.
  if (!event || (event === "reviewed" && !body)) return null;
  const detail =
    item.event === "renamed"
      ? `${item.rename?.from ?? ""} → ${item.rename?.to ?? ""}`
      : item.event === "labeled" || item.event === "unlabeled"
        ? (item.label?.name ?? null)
        : item.event === "review_requested" || item.event === "review_request_removed"
          ? (item.requested_reviewer?.login ?? null)
          : null;
  return {
    id: `github-event-${item.id}`,
    kind: "event",
    event,
    detail,
    body: item.event === "reviewed" ? body : null,
    actor: githubPerson(item.actor ?? item.user),
    occurredAt: item.submitted_at ?? item.created_at ?? "",
    url: item.html_url ?? null,
  };
}

type BitbucketPage<T> = { values: T[]; next?: string };
type BitbucketUser = {
  nickname?: string;
  display_name?: string;
  links?: { avatar?: { href?: string } };
};
type BitbucketUpdate = {
  date?: string;
  state?: string;
  title?: string;
  description?: string;
  author?: BitbucketUser;
};
type BitbucketActivity = {
  approval?: { date?: string; user?: BitbucketUser };
  changes_requested?: { date?: string; user?: BitbucketUser };
  update?: BitbucketUpdate;
};
type BitbucketCommit = {
  hash: string;
  date?: string;
  message?: string;
  author?: { user?: BitbucketUser; raw?: string };
  links?: { html?: { href?: string } };
};

function bitbucketPerson(user: BitbucketUser | undefined): PullRequestPerson | null {
  const login = user?.nickname ?? user?.display_name;
  if (!login) return null;
  return {
    login,
    displayName: user?.display_name ?? null,
    avatarUrl: user?.links?.avatar?.href ?? null,
  };
}

/**
 * Bitbucket records each save as a full snapshot of the pull request. What changed is only
 * visible by comparing a snapshot with the one before it; pushes are left to the commit list.
 */
function bitbucketUpdateEvent(
  update: BitbucketUpdate,
  previous: BitbucketUpdate | null,
): Pick<Extract<PullRequestActivityItem, { kind: "event" }>, "event" | "detail"> | null {
  if (update.state === "MERGED" && previous?.state !== "MERGED") {
    return { event: "merged", detail: null };
  }
  if (update.state === "DECLINED" && previous?.state !== "DECLINED") {
    return { event: "closed", detail: null };
  }
  if (!previous) return null;
  if (update.state === "OPEN" && previous.state !== "OPEN")
    return { event: "reopened", detail: null };
  if ((update.title ?? "") !== (previous.title ?? "")) {
    return { event: "renamed", detail: `${previous.title ?? ""} → ${update.title ?? ""}` };
  }
  if ((update.description ?? "") !== (previous.description ?? "")) {
    return { event: "edited", detail: null };
  }
  return null;
}

function toBitbucketEvents(values: BitbucketActivity[]): PullRequestActivityItem[] {
  const items: PullRequestActivityItem[] = [];
  let previousUpdate: BitbucketUpdate | null = null;
  // The API lists newest first; snapshots are compared oldest first.
  for (const [index, item] of values.toReversed().entries()) {
    const review = item.approval ?? item.changes_requested;
    if (review) {
      items.push({
        id: `bb-review-${index}`,
        kind: "event",
        event: item.approval ? "approved" : "changes-requested",
        detail: null,
        body: null,
        actor: bitbucketPerson(review.user),
        occurredAt: review.date ?? "",
        url: null,
      });
      continue;
    }
    if (!item.update) continue;
    const change = bitbucketUpdateEvent(item.update, previousUpdate);
    previousUpdate = item.update;
    if (!change) continue;
    items.push({
      id: `bb-update-${index}`,
      kind: "event",
      ...change,
      body: null,
      actor: bitbucketPerson(item.update.author),
      occurredAt: item.update.date ?? "",
      url: null,
    });
  }
  return items;
}

function newestFirst(items: PullRequestActivityItem[]) {
  return items.toSorted((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

export async function getPullRequestActivity(
  input: PullRequestLocatorInput,
): Promise<PullRequestActivity> {
  const { hostedRepo, connection } = await resolvePullRequestContext(input);
  if (hostedRepo.providerId === "github") {
    const base = `/repos/${encodeURIComponent(hostedRepo.owner)}/${encodeURIComponent(hostedRepo.repo)}`;
    const [timeline, commits] = await Promise.all([
      githubRequest<GitHubTimelineEvent[]>(
        `${base}/issues/${input.pullRequestNumber}/timeline?per_page=100`,
        connection.token,
      ),
      githubRequest<GitHubCommit[]>(
        `${base}/pulls/${input.pullRequestNumber}/commits?per_page=100`,
        connection.token,
      ),
    ]);
    const events = timeline.data.flatMap((item) => {
      const event = toGitHubEvent(item);
      return event ? [event] : [];
    });
    const commitItems: PullRequestActivityItem[] = commits.data.map((commit) => ({
      id: `github-commit-${commit.sha}`,
      kind: "commit",
      commitSha: commit.sha,
      message: commit.commit?.message?.split("\n")[0] || commit.sha.slice(0, 8),
      actor:
        githubPerson(commit.author) ??
        (commit.commit?.author?.name
          ? { login: commit.commit.author.name, displayName: null, avatarUrl: null }
          : null),
      occurredAt: commit.commit?.author?.date ?? "",
      url: commit.html_url ?? null,
    }));
    return {
      items: newestFirst([...events, ...commitItems]),
      truncated: Boolean(
        timeline.headers.get("link")?.includes('rel="next"') ||
        commits.headers.get("link")?.includes('rel="next"'),
      ),
    };
  }
  if (hostedRepo.providerId === "bitbucket") {
    const path = bitbucketPullRequestPath(hostedRepo, input.pullRequestNumber);
    const [activity, commits] = await Promise.all([
      bitbucketRequest<BitbucketPage<BitbucketActivity>>(`${path}/activity?pagelen=50`, connection),
      bitbucketRequest<BitbucketPage<BitbucketCommit>>(`${path}/commits?pagelen=50`, connection),
    ]);
    const commitItems: PullRequestActivityItem[] = commits.data.values.map((commit) => ({
      id: `bb-commit-${commit.hash}`,
      kind: "commit",
      commitSha: commit.hash,
      message: commit.message?.split("\n")[0] || commit.hash.slice(0, 8),
      actor:
        bitbucketPerson(commit.author?.user) ??
        (commit.author?.raw
          ? {
              login: commit.author.raw.replace(/\s*<.*>$/, ""),
              displayName: null,
              avatarUrl: null,
            }
          : null),
      occurredAt: commit.date ?? "",
      url: commit.links?.html?.href ?? null,
    }));
    return {
      items: newestFirst([...toBitbucketEvents(activity.data.values), ...commitItems]),
      truncated: Boolean(activity.data.next || commits.data.next),
    };
  }
  throw new Error("Activity is not available for this provider yet.");
}
