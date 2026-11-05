import { z } from "zod";

export const fileEditorDraftSchema = z.strictObject({
  repoPath: z.string().min(1),
  relPath: z.string().min(1),
  baseContents: z.string(),
  contents: z.string(),
});

export type FileEditorDraft = Readonly<z.infer<typeof fileEditorDraftSchema>>;
