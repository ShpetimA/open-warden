import type { GitProviderId, HostedRepoRef } from "../../src/platform/desktop/contracts";

import { runGitInRepo } from "./git";

function providerWebOrigin(providerId: GitProviderId) {
  switch (providerId) {
    case "github":
      return "https://github.com";
    case "gitlab":
      return "https://gitlab.com";
    case "bitbucket":
      return "https://bitbucket.org";
  }
}

export function parseRemoteUrl(remoteUrl: string): Omit<HostedRepoRef, "remoteName"> | null {
  const trimmedUrl = remoteUrl.trim();
  if (!trimmedUrl) {
    return null;
  }

  const sshMatch = trimmedUrl.match(/^git@([^:]+):([^/]+)\/(.+?)(?:\.git)?$/i);
  if (sshMatch) {
    const [, host, owner, repo] = sshMatch;
    return hostedRepoFromParts(host, owner, repo, trimmedUrl);
  }

  const sshProtocolMatch = trimmedUrl.match(/^ssh:\/\/git@([^/]+)\/([^/]+)\/(.+?)(?:\.git)?$/i);
  if (sshProtocolMatch) {
    const [, host, owner, repo] = sshProtocolMatch;
    return hostedRepoFromParts(host, owner, repo, trimmedUrl);
  }

  try {
    const url = new URL(trimmedUrl);
    const segments = url.pathname.replace(/^\/+/, "").split("/").filter(Boolean);
    if (segments.length < 2) {
      return null;
    }

    const owner = segments[0] ?? "";
    const repo = segments[1]?.replace(/\.git$/i, "") ?? "";
    return hostedRepoFromParts(url.hostname, owner, repo, trimmedUrl);
  } catch {
    return null;
  }
}

function hostedRepoFromParts(
  host: string,
  owner: string,
  repo: string,
  remoteUrl: string,
): Omit<HostedRepoRef, "remoteName"> | null {
  const normalizedHost = host.toLowerCase();
  const providerId =
    normalizedHost === "github.com"
      ? "github"
      : normalizedHost === "gitlab.com"
        ? "gitlab"
        : normalizedHost === "bitbucket.org"
          ? "bitbucket"
          : null;

  if (!providerId || !owner || !repo) {
    return null;
  }

  return {
    providerId,
    owner,
    repo,
    remoteUrl,
    webUrl: `${providerWebOrigin(providerId)}/${owner}/${repo}`,
  };
}

async function readFetchRemoteUrl(repoPath: string, remoteName: string) {
  const output = await runGitInRepo(repoPath, ["remote", "get-url", remoteName], {
    allowFailure: false,
  });
  return output.toString("utf8").trim();
}

async function listRemoteNames(repoPath: string) {
  const output = await runGitInRepo(repoPath, ["remote"]);
  return output
    .toString("utf8")
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);
}

function sortRemoteNames(remoteNames: string[]) {
  const uniqueNames = [...new Set(remoteNames)];
  return uniqueNames.sort((left, right) => {
    if (left === "origin") return -1;
    if (right === "origin") return 1;
    return left.localeCompare(right);
  });
}

export async function resolveHostedRepo(repoPath: string): Promise<HostedRepoRef | null> {
  const remoteNames = sortRemoteNames(await listRemoteNames(repoPath));

  for (const remoteName of remoteNames) {
    try {
      const remoteUrl = await readFetchRemoteUrl(repoPath, remoteName);
      const parsed = parseRemoteUrl(remoteUrl);
      if (!parsed) {
        continue;
      }

      return {
        ...parsed,
        remoteName,
      };
    } catch {
      continue;
    }
  }

  return null;
}
