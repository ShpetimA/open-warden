import { createHash } from "node:crypto";

import { classifyDesktopFailure, DesktopAdapterError } from "./desktop-failure";
import { readProviderResponseFailure, type HostedProvider } from "./providerResponse";
import {
  desktopFailure,
  type DesktopFailure,
  type DesktopResult,
} from "../src/platform/desktop/failure";

type RequestInput = Readonly<{
  provider: HostedProvider;
  url: string;
  init: RequestInit;
  kind: "read" | "write";
  priority?: "interactive" | "background";
  maxAgeMs?: number;
}>;

type Snapshot = Readonly<{
  body: string;
  status: number;
  headers: readonly (readonly [string, string])[];
}>;

type CacheEntry = Readonly<{
  snapshot: Snapshot;
  storedAt: number;
  bytes: number;
  generation: number;
}>;

type Budget = { remaining: number; limit: number; resetAt: number };
type Account = {
  active: number;
  generation: number;
  nextStart: number;
  nearLimit: boolean;
  cooldown: DesktopFailure | null;
  budgets: Map<string, Budget>;
  queue: Array<{ priority: number; run(): Promise<void> }>;
};

type Flight = {
  controller: AbortController;
  readers: number;
  settled: boolean;
  promise: Promise<DesktopResult<Snapshot>>;
};

type Runtime = Readonly<{
  now(): number;
  wait(milliseconds: number, signal: AbortSignal): Promise<void>;
  request<T>(
    url: string,
    init: RequestInit,
    read: (response: Response) => Promise<T>,
    options: { kind: "read" | "write" },
  ): Promise<T>;
}>;

const MAX_CONCURRENT = 2;
const MAX_QUEUED = 128;
const MAX_CACHE_ENTRIES = 256;
const MAX_CACHE_BYTES = 16 * 1024 * 1024;
const MAX_ENTRY_BYTES = 1024 * 1024;
const VALIDATOR_TTL_MS = 30 * 60_000;

function numberHeader(headers: Headers, name: string): number | null {
  const raw = headers.get(name);
  if (raw === null || raw.trim() === "") return null;

  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function responseFrom(snapshot: Snapshot): Response {
  const headers = new Headers();
  for (const [name, value] of snapshot.headers) headers.set(name, value);

  return new Response(snapshot.status === 204 || snapshot.status === 205 ? null : snapshot.body, {
    status: snapshot.status,
    headers,
  });
}

export class ProviderRequestCoordinator {
  private readonly accounts = new Map<string, Account>();
  private readonly cache = new Map<string, CacheEntry>();
  private readonly flights = new Map<string, Flight>();
  private readonly shutdown = new AbortController();
  private cacheBytes = 0;

  constructor(private readonly runtime: Runtime) {}

  private accountKey(input: RequestInput): string {
    const authorization = new Headers(input.init.headers).get("authorization") ?? "";
    const credential = createHash("sha256").update(authorization).digest("hex");
    return `${input.provider}:${new URL(input.url).origin}:${credential}`;
  }

  private account(key: string): Account {
    let account = this.accounts.get(key);

    if (!account) {
      account = {
        active: 0,
        generation: 0,
        nextStart: 0,
        nearLimit: false,
        cooldown: null,
        budgets: new Map(),
        queue: [],
      };
      this.accounts.set(key, account);
    }

    return account;
  }

  revalidate(provider: HostedProvider, authorization: string): void {
    const credential = createHash("sha256").update(authorization).digest("hex");

    for (const [key, account] of this.accounts) {
      if (!key.startsWith(`${provider}:`) || !key.endsWith(`:${credential}`)) continue;
      account.generation += 1;
    }
  }

  private clearAccountCache(accountKey: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${accountKey}\0`)) this.removeCache(key);
    }
  }

  private removeCache(key: string): void {
    const entry = this.cache.get(key);
    if (entry) this.cacheBytes -= entry.bytes;
    this.cache.delete(key);
  }

  private remember(key: string, snapshot: Snapshot, generation: number): void {
    this.removeCache(key);
    const bytes = Buffer.byteLength(snapshot.body, "utf8");
    if (bytes > MAX_ENTRY_BYTES) return;

    this.cache.set(key, { snapshot, bytes, generation, storedAt: this.runtime.now() });
    this.cacheBytes += bytes;

    while (this.cache.size > MAX_CACHE_ENTRIES || this.cacheBytes > MAX_CACHE_BYTES) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.removeCache(oldest);
    }
  }

  private blocked(input: RequestInput, account: Account, bucket: string): DesktopFailure | null {
    const now = this.runtime.now();
    if ((account.cooldown?.retryAt ?? 0) > now) return account.cooldown;

    const budget = account.budgets.get(bucket);
    if (!budget || budget.resetAt <= now) return null;

    const reserve = input.priority === "background" ? Math.ceil(budget.limit * 0.1) : 0;
    if (budget.remaining > reserve) return null;

    if (budget.remaining > 0) {
      return desktopFailure(
        `${input.provider}.request`,
        "busy",
        "Background refresh is paused to preserve provider request budget. You can refresh manually.",
      );
    }

    return {
      ...desktopFailure(
        `${input.provider}.request`,
        "rate-limit",
        "Provider request budget is low. Wait before refreshing again.",
      ),
      provider: input.provider,
      retryAt: budget.resetAt,
    };
  }

  private observe(
    input: RequestInput,
    account: Account,
    response: Response,
    failure: DesktopFailure | null,
    bucket: string,
  ): void {
    const now = this.runtime.now();
    const remaining = numberHeader(response.headers, "x-ratelimit-remaining");
    const limit = numberHeader(response.headers, "x-ratelimit-limit");
    const reset = numberHeader(response.headers, "x-ratelimit-reset");

    if (input.provider === "github" && remaining !== null && limit !== null && reset !== null) {
      const resetAt = reset * 1000;
      const previous = account.budgets.get(bucket);

      if (resetAt > now && (!previous || resetAt >= previous.resetAt)) {
        account.budgets.set(bucket, {
          remaining:
            previous?.resetAt === resetAt ? Math.min(previous.remaining, remaining) : remaining,
          limit,
          resetAt,
        });
      }
    }

    if (input.provider === "bitbucket") {
      const near = response.headers.get("x-ratelimit-nearlimit");
      if (near !== null) account.nearLimit = near.toLowerCase() === "true";
    }

    if (!failure || (failure.code !== "rate-limit" && failure.code !== "unavailable")) return;
    if (failure.code === "unavailable" && !failure.retryAt) return;

    const retryAt = Math.max(failure.retryAt ?? now + 60_000, now + 1000);
    if (retryAt > (account.cooldown?.retryAt ?? 0)) account.cooldown = { ...failure, retryAt };
  }

  private enqueue(
    account: Account,
    input: RequestInput,
    work: () => Promise<Snapshot>,
  ): Promise<DesktopResult<Snapshot>> {
    if (account.queue.length >= MAX_QUEUED) {
      return Promise.resolve({
        ok: false,
        error: desktopFailure(
          "provider.request",
          "busy",
          "Too many provider requests are waiting. Try again shortly.",
        ),
      });
    }

    return new Promise((resolve) => {
      account.queue.push({
        priority: input.kind === "write" ? 0 : input.priority === "background" ? 2 : 1,
        run: async () => {
          try {
            resolve({ ok: true, value: await work() });
          } catch (cause) {
            resolve({ ok: false, error: classifyDesktopFailure(cause, "provider.request") });
          }
        },
      });
      account.queue.sort((left, right) => left.priority - right.priority);
      this.drain(account);
    });
  }

  private drain(account: Account): void {
    while (account.active < MAX_CONCURRENT && account.queue.length) {
      const next = account.queue.shift();
      if (!next) return;
      account.active += 1;

      void next.run().finally(() => {
        account.active -= 1;
        this.drain(account);
      });
    }
  }

  private async perform(
    input: RequestInput,
    account: Account,
    key: string,
    generation: number,
    signal: AbortSignal,
  ): Promise<Snapshot> {
    signal.throwIfAborted();

    const bucket = new URL(input.url).pathname === "/graphql" ? "graphql" : "core";
    let blocked = this.blocked(input, account, bucket);
    if (blocked) throw new DesktopAdapterError(blocked);

    const start = Math.max(this.runtime.now(), account.nextStart);
    const spacing = input.kind === "write" ? 1000 : account.nearLimit ? 1500 : 100;
    account.nextStart = start + spacing;
    await this.runtime.wait(start - this.runtime.now(), signal);

    signal.throwIfAborted();
    blocked = this.blocked(input, account, bucket);
    if (blocked) throw new DesktopAdapterError(blocked);

    const budget = account.budgets.get(bucket);
    if (budget && budget.resetAt > this.runtime.now())
      budget.remaining = Math.max(0, budget.remaining - 1);

    const headers = new Headers(input.init.headers);
    const cached = this.cache.get(key);
    const conditional =
      input.provider === "github" &&
      input.kind === "read" &&
      bucket !== "graphql" &&
      cached &&
      this.runtime.now() - cached.storedAt < VALIDATOR_TTL_MS;
    const validator = conditional
      ? new Headers(cached.snapshot.headers.map(([name, value]) => [name, value])).get("etag")
      : null;
    if (validator) headers.set("If-None-Match", validator);

    return this.runtime.request(
      input.url,
      { ...input.init, headers, signal },
      async (response) => {
        const body = await response.text();

        if (response.status === 304 && conditional && validator) {
          const current = account.budgets.get(bucket);
          if (budget && current?.resetAt === budget.resetAt) current.remaining += 1;
          this.observe(input, account, response, null, bucket);
          const combined = new Headers(
            cached.snapshot.headers.map(([name, value]) => [name, value]),
          );
          response.headers.forEach((value, name) => combined.set(name, value));
          const snapshot = { ...cached.snapshot, headers: [...combined.entries()] };
          if (generation === account.generation) this.remember(key, snapshot, generation);
          return snapshot;
        }

        const failure = readProviderResponseFailure(
          input.provider,
          response,
          body,
          this.runtime.now(),
          bucket === "graphql",
        );
        this.observe(input, account, response, failure, bucket);
        if (failure) {
          const retryAt =
            failure.code === "rate-limit" || failure.code === "unavailable"
              ? (account.cooldown?.retryAt ?? failure.retryAt)
              : undefined;
          throw new DesktopAdapterError({
            ...failure,
            ...(retryAt === undefined ? {} : { retryAt }),
          });
        }

        const snapshot = {
          body,
          status: response.status,
          headers: [...response.headers.entries()],
        };
        if (
          input.kind === "read" &&
          generation === account.generation &&
          !/no-store/i.test(response.headers.get("cache-control") ?? "")
        )
          this.remember(key, snapshot, generation);

        return snapshot;
      },
      { kind: input.kind },
    );
  }

  private join(flight: Flight, signal?: AbortSignal | null): Promise<DesktopResult<Snapshot>> {
    flight.readers += 1;

    return new Promise((resolve) => {
      let finished = false;
      const finish = (result: DesktopResult<Snapshot>) => {
        if (finished) return;
        finished = true;
        signal?.removeEventListener("abort", cancel);
        flight.readers -= 1;
        if (!flight.readers && !flight.settled) flight.controller.abort();
        resolve(result);
      };
      const cancel = () =>
        finish({
          ok: false,
          error: desktopFailure("provider.request", "cancelled", "The operation was cancelled."),
        });

      signal?.addEventListener("abort", cancel, { once: true });
      if (signal?.aborted) cancel();
      void flight.promise.then(finish);
    });
  }

  async request(input: RequestInput): Promise<DesktopResult<Response>> {
    if (this.shutdown.signal.aborted || input.init.signal?.aborted) {
      return {
        ok: false,
        error: desktopFailure("provider.request", "cancelled", "The operation was cancelled."),
      };
    }

    const accountKey = this.accountKey(input);
    const account = this.account(accountKey);
    const headers = new Headers(input.init.headers);
    const method = input.init.method?.toUpperCase() ?? "GET";
    const representation = JSON.stringify([
      method,
      input.url,
      headers.get("accept"),
      headers.get("x-github-api-version"),
      input.init.body ?? null,
    ]);
    const fingerprint = createHash("sha256").update(representation).digest("hex");
    const key = `${accountKey}\0${fingerprint}`;

    if (input.kind === "write") {
      account.generation += 1;
      this.clearAccountCache(accountKey);
      const generation = account.generation;
      const signal = input.init.signal
        ? AbortSignal.any([this.shutdown.signal, input.init.signal])
        : this.shutdown.signal;

      const result = await this.enqueue(account, input, () =>
        this.perform(input, account, key, generation, signal),
      );
      account.generation += 1;
      this.clearAccountCache(accountKey);
      return result.ok ? { ok: true, value: responseFrom(result.value) } : result;
    }

    const cached = this.cache.get(key);
    if (
      cached &&
      cached.generation === account.generation &&
      this.runtime.now() - cached.storedAt < (input.maxAgeMs ?? 0)
    ) {
      return { ok: true, value: responseFrom(cached.snapshot) };
    }

    const bucket = new URL(input.url).pathname === "/graphql" ? "graphql" : "core";
    const blocked = this.blocked(input, account, bucket);
    if (blocked) return { ok: false, error: blocked };

    const flightKey = `${key}\0${account.generation}`;
    let flight = this.flights.get(flightKey);

    if (!flight || flight.controller.signal.aborted) {
      const controller = new AbortController();
      const signal = AbortSignal.any([this.shutdown.signal, controller.signal]);
      const generation = account.generation;
      flight = {
        controller,
        readers: 0,
        settled: false,
        promise: this.enqueue(account, input, () =>
          this.perform(input, account, key, generation, signal),
        ),
      };
      this.flights.set(flightKey, flight);

      const current = flight;
      void flight.promise.then(() => {
        current.settled = true;
        if (this.flights.get(flightKey) === current) this.flights.delete(flightKey);
      });
    }

    const result = await this.join(flight, input.init.signal);
    return result.ok ? { ok: true, value: responseFrom(result.value) } : result;
  }

  dispose(): void {
    this.shutdown.abort();
    this.cache.clear();
    this.cacheBytes = 0;
  }
}
