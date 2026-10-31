import { z } from "zod";

export const reviewDraftSchema = z.object({
  repoPath: z.string().min(1),
  pullRequestNumber: z.number().int().positive(),
  decision: z.enum(["comment", "approve", "request-changes"]),
  message: z.string(),
  publishedMessage: z.string().optional(),
});

export type ReviewDraft = z.infer<typeof reviewDraftSchema>;
