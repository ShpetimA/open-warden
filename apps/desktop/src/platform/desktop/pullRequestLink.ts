export type PullRequestLink = {
  providerId: "github" | "bitbucket";
  owner: string;
  repo: string;
  pullRequestNumber: number;
  url: string;
  repositoryUrl: string;
};

export function parsePullRequestLink(input: unknown): PullRequestLink | null {
  if (typeof input !== "string") return null;

  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }

  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !["github.com", "bitbucket.org"].includes(url.hostname)
  )
    return null;

  const match = url.pathname.match(
    /^\/([a-zA-Z0-9_-][a-zA-Z0-9_.-]*)\/([a-zA-Z0-9_-][a-zA-Z0-9_.-]*)\/(pull|pull-requests)\/([1-9]\d*)(?:\/.*)?$/,
  );
  if (!match) return null;

  const [, owner, repo, route, number] = match;
  if (!owner || !repo || !number) return null;
  const providerId = url.hostname === "github.com" ? "github" : "bitbucket";
  if (route !== (providerId === "github" ? "pull" : "pull-requests")) return null;

  const pullRequestNumber = Number(number);
  if (!Number.isSafeInteger(pullRequestNumber)) return null;
  const repositoryUrl = `${url.origin}/${owner}/${repo}`;

  return {
    providerId,
    owner,
    repo,
    pullRequestNumber,
    url: `${repositoryUrl}/${route}/${number}`,
    repositoryUrl,
  };
}
