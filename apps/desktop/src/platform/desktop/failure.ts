import { z } from "zod";

export const desktopFailureSchema = z.object({
  code: z.enum([
    "cancelled",
    "invalid-input",
    "authentication",
    "permission",
    "network",
    "timeout",
    "rate-limit",
    "not-found",
    "conflict",
    "busy",
    "unavailable",
    "git-failed",
    "storage-failed",
    "unexpected",
  ]),
  operation: z.string().min(1).max(160),
  message: z.string().min(1).max(1000),
  provider: z.enum(["github", "bitbucket"]).optional(),
  status: z.number().int().min(100).max(599).optional(),
  retryAt: z.number().nonnegative().max(8.64e15).optional(),
  reference: z.string().max(100).optional(),
});

export type DesktopFailure = Readonly<z.infer<typeof desktopFailureSchema>>;
export type DesktopResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: DesktopFailure };

export function desktopSuccess<T>(value: T): DesktopResult<T> {
  return { ok: true, value };
}

export function desktopFailure(
  operation: string,
  code: DesktopFailure["code"],
  message: string,
): DesktopFailure {
  return { operation, code, message };
}

export function readDesktopFailure(error: unknown): DesktopFailure | null {
  const parsed = desktopFailureSchema.safeParse(error);
  return parsed.success ? parsed.data : null;
}

export function failureFromUnknown(error: unknown, operation: string): DesktopFailure {
  const failure = readDesktopFailure(error);
  if (failure) return { ...failure, operation };
  if (error instanceof DOMException && error.name === "AbortError") {
    return desktopFailure(operation, "cancelled", "The operation was cancelled.");
  }
  return desktopFailure(
    operation,
    "unexpected",
    "The operation could not be completed. Try again.",
  );
}

export function parseDesktopReply(reply: unknown, operation: string): DesktopResult<unknown> {
  const parsed = z
    .discriminatedUnion("ok", [
      z.object({ ok: z.literal(true), value: z.unknown() }),
      z.object({ ok: z.literal(false), error: desktopFailureSchema }),
    ])
    .safeParse(reply);

  if (!parsed.success) {
    return {
      ok: false,
      error: desktopFailure(
        operation,
        "unavailable",
        "Open Warden returned an unreadable response. Reload the app and try again.",
      ),
    };
  }
  return parsed.data;
}

export async function readDesktopReply(
  invoke: () => Promise<unknown>,
  operation: string,
): Promise<DesktopResult<unknown>> {
  try {
    return parseDesktopReply(await invoke(), operation);
  } catch {
    return {
      ok: false,
      error: desktopFailure(
        operation,
        "unavailable",
        "Open Warden couldn’t reach its desktop service. Try again.",
      ),
    };
  }
}

export function queryResult<T>(result: DesktopResult<T>): { data: T } | { error: DesktopFailure };
export function queryResult<T, U>(
  result: DesktopResult<T>,
  map: (value: T) => U,
): { data: U } | { error: DesktopFailure };
export function queryResult<T, U>(result: DesktopResult<T>, map?: (value: T) => U) {
  if (!result.ok) return { error: result.error };
  return { data: map ? map(result.value) : result.value };
}

const domainFailureSchema = z.union([
  z.object({
    ok: z.literal(false),
    error: z.union([desktopFailureSchema, z.object({ code: z.string(), message: z.string() })]),
  }),
  z.object({ ok: z.literal(false), message: z.string() }),
]);

export async function captureDesktopOperation(
  operation: string,
  run: () => unknown,
  classify: (cause: unknown, operation: string) => DesktopFailure = failureFromUnknown,
): Promise<DesktopResult<unknown>> {
  try {
    const value: unknown = await run();
    if (typeof value !== "object" || value === null || !("ok" in value))
      return desktopSuccess(value);

    const failure = domainFailureSchema.safeParse(value);
    if (failure.success) {
      const cause =
        "error" in failure.data
          ? failure.data.error
          : { code: "not-found", message: failure.data.message };
      return { ok: false, error: classify(cause, operation) };
    }

    const success = z
      .object({ ok: z.literal(true) })
      .passthrough()
      .safeParse(value);
    if (!success.success)
      return {
        ok: false,
        error: desktopFailure(
          operation,
          "unexpected",
          "Open Warden returned an invalid operation result.",
        ),
      };

    if ("value" in success.data) return desktopSuccess(success.data.value);

    const { ok: _ok, ...listing } = success.data;
    return desktopSuccess(listing);
  } catch (cause) {
    return { ok: false, error: classify(cause, operation) };
  }
}
