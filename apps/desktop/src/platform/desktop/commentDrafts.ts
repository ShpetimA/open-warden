import { z } from "zod";

export const commentDraftSchema = z
  .object({
    type: z.literal("annotation"),
    id: z.string().min(1),
    repoPath: z.string().min(1),
    filePath: z.string().min(1),
    bucket: z.enum(["unstaged", "staged", "untracked"]),
    startLine: z.number().int().positive(),
    endLine: z.number().int().positive(),
    side: z.enum(["deletions", "additions"]),
    endSide: z.enum(["deletions", "additions"]).optional(),
    text: z.string().min(1),
    contextKind: z.enum(["changes", "review", "history", "history-range"]).optional(),
    baseRef: z.string().optional(),
    headRef: z.string().optional(),
    commitId: z.string().optional(),
  })
  .refine((draft) => {
    if (draft.contextKind === "review" || draft.contextKind === "history-range")
      return Boolean(draft.baseRef && draft.headRef);
    if (draft.contextKind === "history") return Boolean(draft.commitId);
    return true;
  }, "The comment's revision context is incomplete.");

export type CommentDraft = z.infer<typeof commentDraftSchema>;
