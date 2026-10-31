import { z } from "zod";

const repo = z.object({ id: z.string(), kind: z.literal("repo"), repoPath: z.string().min(1) });
const pullRequest = z.object({
  id: z.string(),
  kind: z.literal("pull-request"),
  repoPath: z.string().min(1),
  providerId: z.enum(["github", "gitlab", "bitbucket"]),
  owner: z.string().min(1),
  repo: z.string().min(1),
  pullRequestNumber: z.number().int().positive(),
  title: z.string(),
});
const view = z.object({
  activePath: z.string(),
  activeBucket: z.enum(["staged", "unstaged", "untracked"]),
  repoTreeActivePath: z.string(),
  commitMessage: z.string(),
  historyCommitId: z.string(),
  historyFilter: z.string(),
  historySelectedCommitIds: z.array(z.string()),
  historyNavTarget: z.enum(["commits", "files"]),
  reviewBaseRef: z.string(),
  reviewHeadRef: z.string(),
  reviewActivePath: z.string(),
  previewActiveFilePath: z.string(),
});
export const workspaceTabsSchema = z
  .object({
    activeByProject: z.record(z.string(), z.string()).default({}),
    memory: z.record(z.string(), z.record(z.string(), z.number().finite())).default({}),
    items: z.array(z.discriminatedUnion("kind", [repo, pullRequest])),
    activeWorkspaceId: z.string(),
    locations: z.record(z.string(), z.string()),
    views: z.record(z.string(), view),
  })
  .refine((value) => new Set(value.items.map((item) => item.id)).size === value.items.length)
  .refine((value) =>
    value.items.length === 0
      ? value.activeWorkspaceId === ""
      : value.items.some((item) => item.id === value.activeWorkspaceId),
  );
export type PersistedWorkspaceTabs = z.infer<typeof workspaceTabsSchema>;
