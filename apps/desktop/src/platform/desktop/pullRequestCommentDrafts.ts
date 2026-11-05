import { z } from "zod";

export const pullRequestCommentDraftSchema = z.strictObject({
  repoPath: z.string().min(1),
  pullRequestNumber: z.number().int().positive(),
  body: z.string(),
});

export type PullRequestCommentDraft = Readonly<z.infer<typeof pullRequestCommentDraftSchema>>;
export type PullRequestCommentTarget = Pick<
  PullRequestCommentDraft,
  "repoPath" | "pullRequestNumber"
>;
