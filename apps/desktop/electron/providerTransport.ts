import { setTimeout } from "node:timers/promises";

import { DesktopAdapterError } from "./desktop-failure";
import { ProviderRequestCoordinator } from "./ProviderRequestCoordinator";
import { requestProvider } from "./providerRequest";
import type { HostedProvider } from "./providerResponse";

export const providerRequests = new ProviderRequestCoordinator({
  now: Date.now,
  wait: async (milliseconds, signal) => {
    if (milliseconds > 0) await setTimeout(milliseconds, undefined, { signal });
  },
  request: requestProvider,
});

type RequestOptions = Readonly<{
  kind?: "read" | "write";
  maxAgeMs?: number;
  priority?: "interactive" | "background";
}>;

async function request<T>(
  provider: HostedProvider,
  url: string | URL,
  init: RequestInit,
  read: (response: Response) => Promise<T>,
  options: RequestOptions,
): Promise<T> {
  const method = init.method?.toUpperCase() ?? "GET";
  const kind = options.kind ?? (method === "GET" || method === "HEAD" ? "read" : "write");
  const path = new URL(url).pathname;
  const catalog =
    provider === "github" &&
    (/^\/repos\/[^/]+\/[^/]+\/labels$/.test(path) || /^\/repos\/[^/]+\/[^/]+$/.test(path));
  const result = await providerRequests.request({
    provider,
    url: String(url),
    init,
    kind,
    maxAgeMs: options.maxAgeMs ?? (catalog ? 5 * 60_000 : 0),
    priority: options.priority,
  });
  if (!result.ok) throw new DesktopAdapterError(result.error);

  return read(result.value);
}

export function requestGitHub<T>(
  url: string | URL,
  init: RequestInit,
  read: (response: Response) => Promise<T>,
  options: RequestOptions = {},
): Promise<T> {
  return request("github", url, init, read, options);
}

export function requestBitbucket<T>(
  url: string | URL,
  init: RequestInit,
  read: (response: Response) => Promise<T>,
  options: RequestOptions = {},
): Promise<T> {
  return request("bitbucket", url, init, read, options);
}
