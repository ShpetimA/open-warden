import { z } from "zod";
import { commentDraftSchema } from "./commentDrafts";
import { workspaceTabsSchema } from "./workspaceTabs";
import type { WorkspaceSession } from "./contracts";

export const MAX_RECENT_REPOS = 12;

export const storedWorkspaceSessionSchema = z.object({
  openRepos: z.array(z.string()),
  activeRepo: z.string(),
  recentRepos: z.array(z.string()),
  workspaceTabs: workspaceTabsSchema.optional(),
  comments: z.array(commentDraftSchema).optional(),
});

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

export function createWorkspaceSession(input?: unknown): WorkspaceSession {
  const parsed = z
    .object({
      openRepos: z.unknown().optional(),
      activeRepo: z.unknown().optional(),
      recentRepos: z.unknown().optional(),
      workspaceTabs: workspaceTabsSchema.optional(),
      comments: z.array(commentDraftSchema).optional(),
    })
    .safeParse(input ?? {});
  const session = parsed.success ? parsed.data : undefined;
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
    ...(session?.workspaceTabs ? { workspaceTabs: session.workspaceTabs } : {}),
    ...(session?.comments ? { comments: session.comments } : {}),
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
