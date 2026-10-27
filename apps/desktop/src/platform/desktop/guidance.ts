import { z } from "zod";

const text = z.string().trim().min(1);

export const guidanceLocatorSchema = z.object({
  repoPath: text,
  pullRequestNumber: z.number().int().positive(),
});

export const guidanceReferenceSchema = z
  .object({
    path: text.refine(
      (path) =>
        !path.startsWith("/") &&
        !path.includes("\\") &&
        !path.split("/").some((part) => part === ".." || part === ".git"),
    ),
    side: z.enum(["base", "head"]),
    startLine: z.number().int().positive(),
    endLine: z.number().int().positive(),
    note: text
      .max(1200)
      .optional()
      .describe(
        "One or two short sentences explaining this exact code range. Rendered immediately above the highlighted code. Omit to use the step body.",
      ),
  })
  .refine((reference) => reference.endLine >= reference.startLine);

export const guidanceStepSchema = z.object({
  id: text.max(120),
  title: text.max(240).describe("A concrete review question or change in 3–8 words."),
  body: text
    .max(20000)
    .describe(
      "Lead with the behavior change and why it matters. Use 2–4 short bullets, normally under 100 words, ending with what to verify. No repeated file list, code dump, or generic recap.",
    ),
  references: z.array(guidanceReferenceSchema).max(8),
});

export const publishGuidanceSchema = guidanceLocatorSchema
  .extend({
    expectedHeadSha: text,
    title: text.max(240),
    summary: text
      .max(20000)
      .describe(
        "One sentence, under 40 words: what changes for the user and the main review risk.",
      ),
    steps: z.array(guidanceStepSchema).min(1).max(50),
  })
  .refine((guide) => new Set(guide.steps.map((step) => step.id)).size === guide.steps.length);

export const guidanceMessageSchema = z.object({
  id: text,
  role: z.enum(["user", "agent"]),
  body: text.max(20000),
  stepId: text.nullable(),
  stepTitle: text.nullable(),
  headSha: text,
  createdAt: text,
});

export const guidanceDocumentSchema = guidanceLocatorSchema
  .extend({
    id: text,
    providerId: z.enum(["github", "bitbucket", "gitlab"]),
    owner: text,
    repo: text,
    headSha: text,
    title: text,
    summary: text,
    steps: z.array(guidanceStepSchema).min(1).max(50),
    selectedStepId: text.nullable(),
    reviewedStepIds: z.array(text),
    messages: z.array(guidanceMessageSchema).max(1000),
    acknowledgedMessageIds: z.array(text),
    updatedAt: text,
  })
  .refine((guide) => {
    const steps = new Set(guide.steps.map((step) => step.id));
    const messages = new Set(guide.messages.map((message) => message.id));
    const questions = new Set(
      guide.messages.filter((message) => message.role === "user").map((message) => message.id),
    );
    return (
      steps.size === guide.steps.length &&
      messages.size === guide.messages.length &&
      (guide.selectedStepId === null || steps.has(guide.selectedStepId)) &&
      guide.reviewedStepIds.every((id) => steps.has(id)) &&
      guide.acknowledgedMessageIds.every((id) => questions.has(id))
    );
  });

export const guidanceProgressSchema = guidanceLocatorSchema.extend({
  stepId: text,
  reviewed: z.boolean().optional(),
});

export const guidanceMessageInputSchema = guidanceLocatorSchema.extend({
  stepId: text.nullable(),
  body: text.max(20000),
});

export const guidanceNavigateSchema = guidanceLocatorSchema.extend({
  providerId: z.enum(["github", "bitbucket", "gitlab"]),
  owner: text,
  repo: text,
  title: text,
});

export const guidanceErrorSchema = z.object({
  code: z.enum([
    "invalid-input",
    "not-open",
    "not-found",
    "stale-head",
    "provider",
    "storage",
    "unavailable",
  ]),
  message: z.string(),
});
export type GuidanceError = z.infer<typeof guidanceErrorSchema>;
export type GuidanceResult<T> = { ok: true; value: T } | { ok: false; error: GuidanceError };

export function guidanceFailure(
  code: GuidanceError["code"],
  message: string,
): GuidanceResult<never> {
  return { ok: false, error: { code, message } };
}

export function guidanceResultSchema<T extends z.ZodType>(value: T) {
  return z.discriminatedUnion("ok", [
    z.object({ ok: z.literal(true), value }),
    z.object({ ok: z.literal(false), error: guidanceErrorSchema }),
  ]);
}

export const guidanceConnectionSchema = z.object({
  status: z.enum(["stopped", "running", "error"]),
  endpoint: z.string().nullable(),
  clientConfig: z.string().nullable(),
  error: z.string().nullable(),
});
export type GuidanceLocator = z.infer<typeof guidanceLocatorSchema>;
export type GuidanceReference = z.infer<typeof guidanceReferenceSchema>;
export type GuidanceStep = z.infer<typeof guidanceStepSchema>;
export type GuidanceDocument = z.infer<typeof guidanceDocumentSchema>;
export type GuidanceProgressInput = z.infer<typeof guidanceProgressSchema>;
export type GuidanceMessageInput = z.infer<typeof guidanceMessageInputSchema>;
export type PublishGuidanceInput = z.infer<typeof publishGuidanceSchema>;
export type GuidanceNavigate = z.infer<typeof guidanceNavigateSchema>;
export type GuidanceConnection = z.infer<typeof guidanceConnectionSchema>;
