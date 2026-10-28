import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  desktopFailure,
  readDesktopFailure,
  type DesktopFailure,
} from "../src/platform/desktop/failure";

const exceptionSchema = z.object({
  name: z.string().optional(),
  code: z.union([z.string(), z.number(), z.null()]).optional(),
  message: z.string().optional(),
  stderr: z.string().optional(),
  killed: z.boolean().optional(),
});

export class DesktopAdapterError extends Error {
  readonly failure: DesktopFailure;
  constructor(failure: DesktopFailure) {
    super(failure.message);
    this.name = "DesktopAdapterError";
    this.failure = failure;
  }
}

export function classifyDesktopFailure(cause: unknown, operation: string): DesktopFailure {
  if (cause instanceof DesktopAdapterError) return { ...cause.failure, operation };

  const known = readDesktopFailure(cause);
  if (known) return { ...known, operation };

  const parsed = exceptionSchema.safeParse(cause);
  const data = parsed.success ? parsed.data : {};
  const diagnostic = `${data.message ?? ""}\n${data.stderr ?? ""}`;
  if (data.name === "AbortError" || data.code === "ABORT_ERR")
    return desktopFailure(operation, "cancelled", "The operation was cancelled.");
  if (data.code === "invalid-input")
    return desktopFailure(
      operation,
      "invalid-input",
      data.message || "Check the operation’s input and try again.",
    );
  if (data.code === "stale")
    return desktopFailure(
      operation,
      "conflict",
      "This resource changed. Refresh before continuing.",
    );
  if (data.code === "UNAVAILABLE" || data.code === "unavailable")
    return desktopFailure(
      operation,
      "unavailable",
      "The required desktop service or Git installation is unavailable. Check it and try again.",
    );
  if (
    data.code === "busy" ||
    /index\.lock|another git process|unable to create.*lock/i.test(diagnostic)
  )
    return desktopFailure(
      operation,
      "busy",
      "Another Git operation is using this repository. Wait for it to finish, then try again.",
    );
  if (/CONFLICT|unmerged files|resolve.*conflicts|fix conflicts/i.test(diagnostic))
    return desktopFailure(
      operation,
      "conflict",
      "Git found conflicts. Resolve them in Changes before continuing.",
    );
  if (data.code === "EACCES" || data.code === "EPERM")
    return desktopFailure(
      operation,
      "permission",
      "Open Warden doesn’t have permission to access this file or repository.",
    );
  if (
    data.code === "ENOENT" ||
    data.code === "not-found" ||
    /not a git repository|unknown revision|bad revision|ambiguous argument/i.test(diagnostic)
  )
    return desktopFailure(
      operation,
      "not-found",
      "The repository, file, or revision is no longer available. Refresh and try again.",
    );
  if (
    data.killed ||
    data.name === "TimeoutError" ||
    data.code === "ETIMEDOUT" ||
    /timed out/i.test(diagnostic)
  )
    return desktopFailure(operation, "timeout", "The operation took too long. Try again.");
  if (
    /ENOTFOUND|ECONNREFUSED|ECONNRESET|fetch failed|network|could not resolve host/i.test(
      diagnostic,
    )
  )
    return desktopFailure(
      operation,
      "network",
      "The remote service couldn’t be reached. Check your connection and try again.",
    );
  if (
    /connect.*(github|bitbucket)|not connected|authentication failed|could not read Username/i.test(
      diagnostic,
    )
  )
    return desktopFailure(
      operation,
      "authentication",
      "Your provider connection needs attention. Reconnect your account in Pull requests.",
    );
  if (operation.startsWith("save"))
    return desktopFailure(
      operation,
      "storage-failed",
      "Your changes couldn’t be saved. Keep this window open and try again.",
    );
  if (
    operation.toLowerCase().includes("git") ||
    data.code === "git-failed" ||
    data.name === "GitCommandError"
  )
    return desktopFailure(
      operation,
      "git-failed",
      "Git couldn’t complete this operation. Refresh the repository to check its state.",
    );

  const reference = randomUUID();
  const errorType =
    cause instanceof TypeError
      ? "TypeError"
      : cause instanceof RangeError
        ? "RangeError"
        : "UnknownFailure";
  console.error("Desktop operation failed", { operation, reference, errorType });
  return {
    ...desktopFailure(operation, "unexpected", "The operation couldn’t be completed. Try again."),
    reference,
  };
}

export function providerFailure(
  provider: "github" | "bitbucket",
  status: number,
  headers: Headers,
  now: number,
): DesktopFailure {
  const name = provider === "github" ? "GitHub" : "Bitbucket";
  const retry = headers.get("retry-after");
  const reset = headers.get("x-ratelimit-reset");
  const rateLimited =
    status === 429 ||
    (status === 403 && (retry !== null || headers.get("x-ratelimit-remaining") === "0"));
  let code: DesktopFailure["code"] = "unexpected";
  let message = `${name} couldn’t complete the request. Try again.`;
  if (rateLimited) {
    code = "rate-limit";
    message = `${name} is limiting requests. Wait before trying again.`;
  } else if (status === 401) {
    code = "authentication";
    message = `Your ${name} connection needs attention. Reconnect your account.`;
  } else if (status === 403) {
    code = "permission";
    message = `Your ${name} account doesn’t have permission for this operation.`;
  } else if (status === 404) {
    code = "not-found";
    message = `This ${name} resource couldn’t be found or accessed.`;
  } else if (status === 409 || status === 412) {
    code = "conflict";
    message = `The ${name} resource changed. Refresh before trying again.`;
  } else if (status === 400 || status === 422) {
    code = "invalid-input";
    message = `${name} couldn’t accept this request. Check your input.`;
  } else if (status >= 500) {
    code = "unavailable";
    message = `${name} is temporarily unavailable. Try again shortly.`;
  }

  const retryAt =
    retry !== null
      ? /^\d+$/.test(retry)
        ? now + Number(retry) * 1000
        : Date.parse(retry)
      : reset !== null
        ? Number(reset) * 1000
        : undefined;

  return {
    operation: `${provider}.request`,
    code,
    message,
    provider,
    status,
    ...(retryAt !== undefined && Number.isFinite(retryAt) ? { retryAt } : {}),
  };
}
