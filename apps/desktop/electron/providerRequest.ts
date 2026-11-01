import { DesktopAdapterError } from "./desktop-failure";
import { desktopFailure } from "../src/platform/desktop/failure";

const REQUEST_TIMEOUT_MS = 60_000;

type RequestOptions = {
  readonly kind?: "read" | "write";
  readonly timeoutMs?: number;
};

/** Owns a complete provider response, including the body deadline and uncertain write outcome. */
export async function requestProvider<T>(
  url: string | URL,
  init: RequestInit,
  read: (response: Response) => Promise<T>,
  options: RequestOptions = {},
): Promise<T> {
  const deadline = AbortSignal.timeout(options.timeoutMs ?? REQUEST_TIMEOUT_MS);
  const signal = init.signal ? AbortSignal.any([init.signal, deadline]) : deadline;
  const method = init.method?.toUpperCase() ?? "GET";
  const kind = options.kind ?? (method === "GET" || method === "HEAD" ? "read" : "write");
  let response: Response | undefined;

  try {
    response = await fetch(url, { ...init, signal });
    return await read(response);
  } catch (cause) {
    if (cause instanceof DesktopAdapterError) throw cause;

    if (kind === "write") {
      let code: "timeout" | "cancelled" | "network" = "network";
      if (deadline.aborted) code = "timeout";
      else if (signal.aborted) code = "cancelled";

      throw new DesktopAdapterError(
        desktopFailure(
          "providerRequest",
          code,
          "The request stopped before its result was confirmed. The provider may have applied this change. Refresh before trying again.",
        ),
      );
    }

    if (deadline.aborted) {
      throw new DesktopAdapterError(
        desktopFailure(
          "providerRequest",
          "timeout",
          "The provider took too long to respond. Try refreshing again.",
        ),
      );
    }

    throw cause;
  } finally {
    if (response?.body && !response.bodyUsed) await response.body.cancel().catch(() => {});
  }
}
