import type { WorkspaceSession } from "./contracts";

export const MAX_RECENT_REPOS = 12;

function normalizeRepoPath(repoPath: unknown): string | null {
  if (typeof repoPath !== "string") return null;

  const trimmedPath = repoPath.trim();
  return trimmedPath ? trimmedPath : null;
}

export function normalizeRepoPaths(repoPaths: unknown, limit = Number.POSITIVE_INFINITY): string[] {
  if (!Array.isArray(repoPaths)) return [];

  const seen = new Set<string>();
  const normalizedPaths: string[] = [];

  for (const repoPath of repoPaths) {
    const normalizedPath = normalizeRepoPath(repoPath);
    if (!normalizedPath || seen.has(normalizedPath)) {
      continue;
    }

    seen.add(normalizedPath);
    normalizedPaths.push(normalizedPath);

    if (normalizedPaths.length >= limit) {
      break;
    }
  }

  return normalizedPaths;
}

function resolveActiveRepo(activeRepo: unknown, openRepos: string[]): string {
  const normalizedActiveRepo = normalizeRepoPath(activeRepo);

  if (normalizedActiveRepo && openRepos.includes(normalizedActiveRepo)) {
    return normalizedActiveRepo;
  }

  return openRepos[0] ?? "";
}

export function mergeRecentRepos(
  recentRepos: string[],
  openRepos: string[],
  activeRepo: string,
): string[] {
  return normalizeRepoPaths([activeRepo, ...openRepos, ...recentRepos], MAX_RECENT_REPOS);
}

export function addRecentRepo(recentRepos: string[], repoPath: string): string[] {
  return mergeRecentRepos(recentRepos, [], repoPath);
}

export function createWorkspaceSession(session?: Partial<WorkspaceSession> | null): WorkspaceSession {
  const openRepos = normalizeRepoPaths(session?.openRepos);
  const activeRepo = resolveActiveRepo(session?.activeRepo, openRepos);
  const recentRepos = mergeRecentRepos(
    normalizeRepoPaths(session?.recentRepos, MAX_RECENT_REPOS),
    openRepos,
    activeRepo,
  );

  return {
    openRepos,
    activeRepo,
    recentRepos,
  };
}

export function buildWorkspaceSession(state: {
  repos: string[];
  activeRepo: string;
  recentRepos: string[];
}): WorkspaceSession {
  return createWorkspaceSession({
    openRepos: state.repos,
    activeRepo: state.activeRepo,
    recentRepos: state.recentRepos,
  });
}
