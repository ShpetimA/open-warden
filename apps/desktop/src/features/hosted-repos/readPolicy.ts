import type { BaseQueryApi } from "@reduxjs/toolkit/query";
import {
  queryResult,
  readDesktopFailure,
  type DesktopFailure,
  type DesktopResult,
} from "@/platform/desktop/failure";

type HostedQueryState = {
  hostedReposApi?: { queries: Record<string, { error?: unknown } | undefined> };
};

/** Apply provider deadlines even when another mounted reader initiates the same failed query. */
export async function runHostedRead<T>(
  api: BaseQueryApi,
  read: () => Promise<DesktopResult<T>>,
): Promise<{ data: T } | { error: DesktopFailure }> {
  const state = api.getState() as HostedQueryState;
  const cached = api.queryCacheKey ? state.hostedReposApi?.queries[api.queryCacheKey] : undefined;
  const failure = readDesktopFailure(cached?.error);
  if (failure && (failure.retryAt ?? 0) > Date.now()) return { error: failure };
  return queryResult(await read());
}
