import { z } from "zod";

export const diffEditExpectationSchema = z.strictObject({
  kind: z.literal("diff"),
  bucket: z.enum(["staged", "unstaged"]),
  oldContents: z.string().nullable(),
  newContents: z.string().nullable(),
});

export const fileEditExpectationSchema = z.union([
  diffEditExpectationSchema,
  z.strictObject({ kind: z.literal("worktree"), contents: z.string() }),
]);

export type DiffEditExpectation = z.infer<typeof diffEditExpectationSchema>;
export type FileEditExpectation = z.infer<typeof fileEditExpectationSchema>;
