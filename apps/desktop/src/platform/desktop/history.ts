import { z } from "zod";

export const historyGraphCommitSchema = z.object({
  commitId: z.string().min(1),
  shortId: z.string(),
  summary: z.string(),
  author: z.string(),
  authorEmail: z.string(),
  relativeTime: z.string(),
  authoredAt: z.string(),
  parents: z.array(z.string().min(1)),
  refs: z.array(z.string()),
});

export type HistoryGraphCommit = Readonly<z.infer<typeof historyGraphCommitSchema>>;

export const historyGraphSchema = z.object({
  commits: z.array(historyGraphCommitSchema),
  shallow: z.boolean(),
});

export type HistoryGraph = Readonly<z.infer<typeof historyGraphSchema>>;
