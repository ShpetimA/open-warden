import type { BaseQueryApi } from "@reduxjs/toolkit/query";
import {
  queryResult,
  readDesktopFailure,
  type DesktopFailure,
  type DesktopResult,
} from "@/platform/desktop/failure";
import { hostedReadDeadline, rememberHostedReadDeadline } from "./readDeadlinesSlice";

function record(value: unknown): Record<string, unknown> | undefined {
  if (isRecord(value)) return value;
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function runHostedRead<T>(
  api: BaseQueryApi,
  read: () => Promise<DesktopResult<T>>,
  repoPath?: string,
): Promise<{ data: T } | { error: DesktopFailure }> {
  const hosted = record(record(api.getState())?.hostedReposApi);
  const queries = record(hosted?.queries) ?? {};
  const provider = Object.values(queries)
    .map(record)
    .find(
      (query) => query?.endpointName === "resolveHostedRepo" && query.originalArgs === repoPath,
    );
  const providerId = record(provider?.data)?.providerId;
  const scopes = [
    ...(repoPath ? [`repo:${repoPath}`] : []),
    ...(typeof providerId === "string" ? [`provider:${providerId}`] : []),
  ];
  const deadline = hostedReadDeadline(api.getState(), scopes, Date.now());
  if (deadline) return { error: deadline };
  const cached = api.queryCacheKey ? record(hosted?.queries)?.[api.queryCacheKey] : undefined;
  const failure = readDesktopFailure(record(cached)?.error);
  if (failure && (failure.retryAt ?? 0) > Date.now()) return { error: failure };
  if (
    failure &&
    !api.forced &&
    ["authentication", "permission", "not-found", "invalid-input"].includes(failure.code)
  )
    return { error: failure };
  const result = queryResult(await read());
  if ("error" in result && (result.error.retryAt ?? 0) > Date.now()) {
    api.dispatch(
      rememberHostedReadDeadline({
        scopes: [
          ...scopes,
          ...(result.error.provider ? [`provider:${result.error.provider}`] : []),
        ],
        failure: result.error,
        now: Date.now(),
      }),
    );
  }
  return result;
}
