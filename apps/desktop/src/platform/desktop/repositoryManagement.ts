import { z } from "zod";

const text = z
  .string()
  .trim()
  .min(1, "This field is required.")
  .max(4096, "Keep values under 4,096 characters.")
  .refine(
    (value) => !value.includes("\0") && !/[\r\n]/.test(value),
    "Use a single line without control characters.",
  );

export const repositoryLocationSchema = text.refine((value) => {
  if (/^(?:\/|[A-Za-z]:[\\/]|\\\\|~\/)/.test(value)) return true;
  if (/^[\w.-]+@[\w.-]+:.+/.test(value)) return true;

  try {
    const url = new URL(value);

    return (
      ["https:", "http:", "ssh:", "git:", "file:"].includes(url.protocol) &&
      !url.password &&
      (!url.username || url.protocol === "ssh:") &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}, "Use an HTTPS or SSH URL, or an absolute local path. Keep credentials out of the URL.");

export const repositorySetupSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("clone"), source: repositoryLocationSchema, destination: text }),
  z.strictObject({ kind: z.literal("init"), destination: text, initialBranch: text }),
]);

export type RepositorySetupInput = z.infer<typeof repositorySetupSchema>;

const remoteName = text.refine(
  (value) => !value.startsWith("-") && !/\s/.test(value),
  "Use a remote name without spaces or a leading dash.",
);

const revision = z.string().regex(/^[a-f0-9]{64}$/);

export const repositoryConfigurationCommandSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("add-remote"),
    name: remoteName,
    url: repositoryLocationSchema,
    expectedRevision: revision,
  }),
  z.strictObject({
    kind: z.literal("edit-remote"),
    name: remoteName,
    url: repositoryLocationSchema,
    expectedRevision: revision,
  }),
  z.strictObject({
    kind: z.literal("edit-push-url"),
    name: remoteName,
    url: repositoryLocationSchema.nullable(),
    expectedRevision: revision,
  }),
  z.strictObject({
    kind: z.literal("rename-remote"),
    name: remoteName,
    newName: remoteName,
    expectedRevision: revision,
  }),
  z.strictObject({
    kind: z.literal("remove-remote"),
    name: remoteName,
    expectedRevision: revision,
  }),
  z.strictObject({
    kind: z.literal("set-upstream"),
    branch: text,
    upstream: text.nullable(),
    expectedRevision: revision,
  }),
]);

export type RepositoryConfigurationCommand = z.infer<typeof repositoryConfigurationCommandSchema>;

export const repositoryConfigurationSchema = z.object({
  revision,
  branch: z.string(),
  upstream: z.string().nullable(),
  remoteBranches: z.array(z.string()),
  remotes: z.array(
    z.object({ name: z.string(), fetchUrls: z.array(z.string()), pushUrls: z.array(z.string()) }),
  ),
});

export type RepositoryConfiguration = z.infer<typeof repositoryConfigurationSchema>;
