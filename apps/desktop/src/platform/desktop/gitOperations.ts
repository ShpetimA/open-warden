import { z } from "zod";

const name = z
  .string()
  .trim()
  .min(1)
  .max(1024)
  .refine(
    (value) => !value.startsWith("-") && !value.includes("\0") && !/[\r\n]/.test(value),
    "Invalid Git name",
  );
const oid = z.string().regex(/^[a-f0-9]{40,64}$/);
export const gitCommandSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("amend"), message: z.string().trim().min(1), expectedHead: oid }),
  z.object({ kind: z.literal("undo"), expectedHead: oid }),
  z.object({
    kind: z.literal("stash-save"),
    message: z.string().trim().min(1),
    includeUntracked: z.boolean(),
  }),
  z.object({ kind: z.literal("stash-apply"), oid }),
  z.object({ kind: z.literal("stash-pop"), oid }),
  z.object({ kind: z.literal("stash-drop"), oid }),
  z.object({ kind: z.literal("stash-switch"), branch: name, remote: z.boolean() }),
  z.object({ kind: z.literal("fetch"), remote: name }),
  z.object({ kind: z.literal("pull") }),
  z.object({ kind: z.literal("push") }),
  z.object({ kind: z.literal("publish"), remote: name }),
  z.object({ kind: z.literal("switch"), branch: name }),
  z.object({ kind: z.literal("track"), remoteBranch: name, branch: name }),
  z.object({ kind: z.literal("create"), branch: name, startPoint: name }),
  z.object({ kind: z.literal("rename"), branch: name }),
  z.object({ kind: z.literal("delete"), branch: name }),
]);
export type GitCommand = z.infer<typeof gitCommandSchema>;
export const gitRepositoryStateSchema = z.object({
  branch: z.string(),
  upstream: z.string(),
  ahead: z.number().int().nonnegative(),
  behind: z.number().int().nonnegative(),
  remotes: z.array(z.string()),
  branches: z.array(z.object({ name: z.string(), remote: z.boolean(), worktree: z.string() })),
  lastCommit: z.object({ id: z.string(), message: z.string(), published: z.boolean() }).nullable(),
  stashes: z.array(z.object({ oid: z.string(), label: z.string() })),
  incoming: z.array(z.object({ id: z.string(), subject: z.string() })),
  outgoing: z.array(z.object({ id: z.string(), subject: z.string() })),
});
export type GitRepositoryState = z.infer<typeof gitRepositoryStateSchema>;
export const gitFailureSchema = z.object({
  code: z.enum(["invalid-input", "busy", "git-failed"]),
  message: z.string(),
});
export type GitResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: z.infer<typeof gitFailureSchema> };
export const gitCommandResultSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), value: z.string() }),
  z.object({ ok: z.literal(false), error: gitFailureSchema }),
]);
export const gitStateResultSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), value: gitRepositoryStateSchema }),
  z.object({ ok: z.literal(false), error: gitFailureSchema }),
]);
