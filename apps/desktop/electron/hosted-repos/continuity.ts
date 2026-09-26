import type {
  PullRequestActivity,
  PullRequestActivityItem,
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

type GitHubTimelineEvent = {
  id: number;
  event: string;
  created_at?: string;
  actor?: { login?: string } | null;
  user?: { login?: string } | null;
  state?: string;
  commit_id?: string;
  rename?: { from?: string; to?: string };
  html_url?: string;
};

type GitHubCommit = {
  sha: string;
  html_url?: string;
  commit?: { message?: string; author?: { name?: string; date?: string } };
  author?: { login?: string } | null;
};

const githubEventLabels: Record<string, string> = {
  assigned: "Assigned",
  unassigned: "Unassigned",
  closed: "Closed",
  reopened: "Reopened",
  merged: "Merged",
  reviewed: "Review submitted",
  review_requested: "Review requested",
  review_request_removed: "Review request removed",
  head_ref_force_pushed: "Source branch force pushed",
  ready_for_review: "Marked ready for review",
  converted_to_draft: "Converted to draft",
  renamed: "Renamed",
  labeled: "Label added",
  unlabeled: "Label removed",
  auto_merge_enabled: "Auto-merge enabled",
  auto_merge_disabled: "Auto-merge disabled",
};

function toGitHubEvent(event: GitHubTimelineEvent): PullRequestActivityItem | null {
  const label = githubEventLabels[event.event];
  if (!label) return null;
  const detail =
    event.event === "reviewed"
      ? (event.state?.replaceAll("_", " ") ?? null)
      : event.event === "renamed"
        ? `${event.rename?.from ?? ""} → ${event.rename?.to ?? ""}`
        : event.commit_id
          ? event.commit_id.slice(0, 8)
          : null;
  return {
    id: `github-event-${event.id}`,
    kind: "event",
    label,
    detail,
    actor: event.actor?.login ?? event.user?.login ?? null,
    occurredAt: event.created_at ?? "",
    url: event.html_url ?? null,
  };
}

type BitbucketPage<T> = { values: T[]; next?: string };
type BitbucketActivity = {
  approval?: { date?: string; user?: { nickname?: string; display_name?: string } };
  changes_requested?: { date?: string; user?: { nickname?: string; display_name?: string } };
  update?: {
    date?: string;
    state?: string;
    reason?: string;
    author?: { nickname?: string; display_name?: string };
    source?: { commit?: { hash?: string } };
  };
};
type BitbucketCommit = {
  hash: string;
  date?: string;
  message?: string;
  author?: { user?: { nickname?: string; display_name?: string }; raw?: string };
  links?: { html?: { href?: string } };
};

function toBitbucketEvent(item: BitbucketActivity, index: number): PullRequestActivityItem | null {
  if (item.approval)
    return {
      id: `bb-approval-${index}`,
      kind: "event",
      label: "Approved",
      detail: null,
      actor: item.approval.user?.display_name ?? item.approval.user?.nickname ?? null,
      occurredAt: item.approval.date ?? "",
      url: null,
    };
  if (item.changes_requested)
    return {
      id: `bb-changes-${index}`,
      kind: "event",
      label: "Changes requested",
      detail: null,
      actor:
        item.changes_requested.user?.display_name ?? item.changes_requested.user?.nickname ?? null,
      occurredAt: item.changes_requested.date ?? "",
      url: null,
    };
  if (item.update)
    return {
      id: `bb-update-${index}`,
      kind: "event",
      label:
        item.update.state === "MERGED"
          ? "Merged"
          : item.update.state === "DECLINED"
            ? "Declined"
            : "Pull request updated",
      detail:
        item.update.reason ||
        (item.update.source?.commit?.hash
          ? `Source ${item.update.source.commit.hash.slice(0, 8)}`
          : null),
      actor: item.update.author?.display_name ?? item.update.author?.nickname ?? null,
      occurredAt: item.update.date ?? "",
      url: null,
    };
  return null;
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
      label: commit.commit?.message?.split("\n")[0] || commit.sha.slice(0, 8),
      detail: commit.sha.slice(0, 8),
      actor: commit.author?.login ?? commit.commit?.author?.name ?? null,
      occurredAt: commit.commit?.author?.date ?? "",
      url: commit.html_url ?? null,
    }));
    return {
      items: [...events, ...commitItems].toSorted((a, b) =>
        (b.occurredAt ?? "").localeCompare(a.occurredAt ?? ""),
      ),
      truncated: Boolean(
        timeline.headers.get("link")?.includes('rel="next"') ||
        commits.headers.get("link")?.includes('rel="next"'),
      ),
    };
  }
  if (hostedRepo.providerId === "bitbucket") {
    const path = bitbucketPullRequestPath(hostedRepo, input.pullRequestNumber);
    const [activity, commits] = await Promise.all([
      bitbucketRequest<BitbucketPage<BitbucketActivity>>(`${path}/activity`, connection),
      bitbucketRequest<BitbucketPage<BitbucketCommit>>(`${path}/commits`, connection),
    ]);
    const events = activity.data.values.flatMap((item, index) => {
      const event = toBitbucketEvent(item, index);
      return event ? [event] : [];
    });
    const commitItems: PullRequestActivityItem[] = commits.data.values.map((commit) => ({
      id: `bb-commit-${commit.hash}`,
      kind: "commit",
      commitSha: commit.hash,
      label: commit.message?.split("\n")[0] || commit.hash.slice(0, 8),
      detail: commit.hash.slice(0, 8),
      actor:
        commit.author?.user?.display_name ??
        commit.author?.user?.nickname ??
        commit.author?.raw ??
        null,
      occurredAt: commit.date ?? "",
      url: commit.links?.html?.href ?? null,
    }));
    return {
      items: [...events, ...commitItems].toSorted((a, b) =>
        (b.occurredAt ?? "").localeCompare(a.occurredAt ?? ""),
      ),
      truncated: Boolean(activity.data.next || commits.data.next),
    };
  }
  throw new Error("Activity is not available for this provider yet.");
}
