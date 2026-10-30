import { z } from "zod";
import { desktopFailureSchema } from "./failure";

export const repositoryChangeKindSchema = z.enum(["worktree", "index", "refs", "config"]);
export type RepositoryChangeKind = z.infer<typeof repositoryChangeKindSchema>;
export const repositoryChangeSchema = z.object({
  repoPath: z.string().min(1),
  kinds: z.array(repositoryChangeKindSchema),
  paths: z.array(z.string()),
  structure: z.boolean(),
  failure: desktopFailureSchema.optional(),
});
export type RepositoryChange = Readonly<z.infer<typeof repositoryChangeSchema>>;
export const repositorySubscriptionsSchema = z.array(z.string().min(1).max(4096));

export type RepositoryEventsApi = {
  setRepositorySubscriptions(paths: string[]): Promise<import("./failure").DesktopResult<void>>;
  onRepositoryChanged(listener: (event: RepositoryChange) => void): () => void;
};
