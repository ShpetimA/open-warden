import { expect, test } from "vitest";

import { ProviderRequestCoordinator } from "./ProviderRequestCoordinator";
import type { DesktopResult } from "../src/platform/desktop/failure";

function deferred<T>() {
  let resolve: ((value: T) => void) | undefined;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });

  if (!resolve) throw new Error("Deferred not initialized");
  return { promise, resolve };
}

type Request = {
  url: string;
  headers: Headers;
  method: string;
  signal: AbortSignal | null | undefined;
  startedAt: number;
};

function fixture(
  handle: (request: Request) => Response | Promise<Response> = () =>
    Response.json({ head: "first" }),
) {
  let now = 1000;
  const requests: Request[] = [];
  const coordinator = new ProviderRequestCoordinator({
    now: () => now,
    async wait(milliseconds, signal) {
      signal.throwIfAborted();
      now += Math.max(0, milliseconds);
    },
    async request(url, init, read) {
      const request = {
        url,
        headers: new Headers(init.headers),
        method: init.method ?? "GET",
        signal: init.signal,
        startedAt: now,
      };
      requests.push(request);
      return read(await handle(request));
    },
  });

  const input = {
    provider: "github" as const,
    url: "https://api.github.com/repos/team/app/pulls/7",
    init: { headers: { authorization: "Bearer fixture-token" } },
    kind: "read" as const,
  };

  return {
    coordinator,
    requests,
    input,
    advance: (milliseconds: number) => {
      now += milliseconds;
    },
  };
}

async function text(result: DesktopResult<Response>): Promise<string> {
  if (!result.ok) throw new Error(`Unexpected fixture failure: ${result.error.code}`);
  return result.value.text();
}

test("coalesces independent feature reads and returns independently consumable responses", async () => {
  const response = deferred<Response>();
  const f = fixture(() => response.promise);

  const conversation = f.coordinator.request(f.input);
  const checks = f.coordinator.request(f.input);
  const reviewers = f.coordinator.request(f.input);
  response.resolve(Response.json({ head: "first" }));

  const results = await Promise.all([conversation, checks, reviewers]);
  expect(await Promise.all(results.map(text))).toEqual(Array(3).fill('{"head":"first"}'));
  expect(f.requests).toHaveLength(1);
});

test("fresh cache avoids reads; expired cache revalidates with ETag and retains pagination headers", async () => {
  const f = fixture((request) =>
    request.headers.has("if-none-match")
      ? new Response(null, { status: 304, headers: { etag: '"v1"' } })
      : Response.json(
          { head: "first" },
          { headers: { etag: '"v1"', link: '<https://api.github.com/page2>; rel="next"' } },
        ),
  );
  const input = { ...f.input, maxAgeMs: 2000 };

  await f.coordinator.request(input);
  expect(await text(await f.coordinator.request(input))).toContain("first");
  expect(f.requests).toHaveLength(1);

  f.advance(2000);
  const revalidated = await f.coordinator.request(input);
  expect(await text(revalidated)).toContain("first");
  expect(f.requests).toHaveLength(2);
  expect(f.requests[1]?.headers.get("if-none-match")).toBe('"v1"');
  expect(revalidated.ok && revalidated.value.headers.get("link")).toContain("page2");
});

test("separates credentials, representations, pages, and GraphQL variables", async () => {
  const f = fixture(() => Response.json({ data: {} }));
  const input = { ...f.input, maxAgeMs: 2000 };

  await f.coordinator.request(input);
  await f.coordinator.request({
    ...input,
    init: { headers: { authorization: "Bearer different" } },
  });
  await f.coordinator.request({
    ...input,
    init: { headers: { ...input.init.headers, accept: "text/plain" } },
  });
  await f.coordinator.request({ ...input, url: `${input.url}?page=2` });
  await f.coordinator.request({
    ...input,
    url: "https://api.github.com/graphql",
    init: { ...input.init, method: "POST", body: '{"variables":{"number":7}}' },
  });
  await f.coordinator.request({
    ...input,
    url: "https://api.github.com/graphql",
    init: { ...input.init, method: "POST", body: '{"variables":{"number":8}}' },
  });

  expect(f.requests).toHaveLength(6);
});

test("permission and missing-resource errors do not cache failures or pause unrelated reads", async () => {
  const f = fixture((request) =>
    Response.json(
      {},
      {
        status: request.url.endsWith("/missing") ? 404 : 200,
        headers: {
          "x-ratelimit-remaining": "4900",
          "x-ratelimit-limit": "5000",
          "x-ratelimit-reset": "3600",
        },
      },
    ),
  );
  const missing = { ...f.input, url: `${f.input.url}/missing`, maxAgeMs: 2000 };

  expect(await f.coordinator.request(missing)).toMatchObject({
    ok: false,
    error: { code: "not-found" },
  });
  expect(await f.coordinator.request(missing)).toMatchObject({
    ok: false,
    error: { code: "not-found" },
  });
  expect(await f.coordinator.request(f.input)).toMatchObject({ ok: true });
  expect(f.requests).toHaveLength(3);
});

test.each(["github", "bitbucket"] as const)(
  "%s cooldown covers other repositories using the same credential and expires without retrying writes",
  async (provider) => {
    let limited = true;
    const f = fixture(() =>
      limited
        ? Response.json({}, { status: 429, headers: { "retry-after": "30" } })
        : Response.json({ recovered: true }),
    );
    const input = { ...f.input, provider };

    expect(await f.coordinator.request(input)).toMatchObject({
      ok: false,
      error: { code: "rate-limit", retryAt: 31_000 },
    });
    expect(await f.coordinator.request({ ...input, url: `${input.url}/other` })).toMatchObject({
      ok: false,
      error: { code: "rate-limit" },
    });
    expect(
      await f.coordinator.request({
        ...input,
        kind: "write",
        init: { ...input.init, method: "POST" },
      }),
    ).toMatchObject({ ok: false, error: { code: "rate-limit" } });
    expect(f.requests).toHaveLength(1);

    limited = false;
    f.advance(30_000);
    expect(await f.coordinator.request(input)).toMatchObject({ ok: true });
    expect(f.requests).toHaveLength(2);
  },
);

test("HTTP-200 GraphQL rate errors and HTTP-403 secondary limits reach the shared gate", async () => {
  for (const response of [
    Response.json({ errors: [{ type: "RATE_LIMITED", message: "private diagnostic" }] }),
    Response.json({ message: "You have exceeded a secondary rate limit" }, { status: 403 }),
  ]) {
    const f = fixture(() => response);
    const input = {
      ...f.input,
      url: "https://api.github.com/graphql",
      init: { ...f.input.init, method: "POST", body: "{}" },
    };

    const result = await f.coordinator.request(input);
    expect(result).toMatchObject({ ok: false, error: { code: "rate-limit" } });
    expect(JSON.stringify(result)).not.toContain("private diagnostic");
    expect(await f.coordinator.request(f.input)).toMatchObject({
      ok: false,
      error: { code: "rate-limit" },
    });
    expect(f.requests).toHaveLength(1);
  }
});

test("a late successful request cannot clear a newer provider cooldown", async () => {
  const started = deferred<void>();
  const slow = deferred<Response>();
  const f = fixture((request) => {
    if (request.url.endsWith("/slow")) {
      started.resolve();
      return slow.promise;
    }
    return Response.json({}, { status: 429, headers: { "retry-after": "30" } });
  });
  const early = f.coordinator.request({ ...f.input, url: `${f.input.url}/slow` });
  await started.promise;
  await f.coordinator.request(f.input);
  slow.resolve(Response.json({ success: true }));
  await early;

  expect(await f.coordinator.request(f.input)).toMatchObject({
    ok: false,
    error: { code: "rate-limit" },
  });
  expect(f.requests).toHaveLength(2);
});

test("successful quota headers reserve background budget but still allow interactive reads", async () => {
  const f = fixture(() =>
    Response.json(
      {},
      {
        headers: {
          "x-ratelimit-remaining": "9",
          "x-ratelimit-limit": "100",
          "x-ratelimit-reset": "3600",
        },
      },
    ),
  );
  await f.coordinator.request(f.input);

  expect(await f.coordinator.request({ ...f.input, priority: "background" })).toMatchObject({
    ok: false,
    error: { code: "busy" },
  });
  expect(await f.coordinator.request(f.input)).toMatchObject({ ok: true });
  expect(f.requests).toHaveLength(2);
});

test("REST exhaustion does not spend the separate GraphQL budget; changing credentials isolates cooldowns", async () => {
  const f = fixture(() =>
    Response.json(
      { data: {} },
      {
        headers: {
          "x-ratelimit-remaining": "0",
          "x-ratelimit-limit": "100",
          "x-ratelimit-reset": "3600",
        },
      },
    ),
  );
  await f.coordinator.request(f.input);
  expect(await f.coordinator.request(f.input)).toMatchObject({
    ok: false,
    error: { code: "rate-limit" },
  });
  expect(
    await f.coordinator.request({
      ...f.input,
      url: "https://api.github.com/graphql",
      init: { ...f.input.init, method: "POST", body: "{}" },
    }),
  ).toMatchObject({ ok: true });
  expect(
    await f.coordinator.request({
      ...f.input,
      init: { headers: { authorization: "Bearer other-account" } },
    }),
  ).toMatchObject({ ok: true });
  expect(f.requests).toHaveLength(3);
});

test("Bitbucket near-limit warnings slow later requests without inventing a quota reset", async () => {
  const f = fixture(() => Response.json({}, { headers: { "x-ratelimit-nearlimit": "true" } }));
  const input = { ...f.input, provider: "bitbucket" as const };
  await f.coordinator.request(input);
  await f.coordinator.request(input);
  await f.coordinator.request(input);

  expect(f.requests[2]?.startedAt).toBeGreaterThanOrEqual((f.requests[1]?.startedAt ?? 0) + 1500);
});

test("cancelling one coalesced reader leaves the other reader and its network request alive", async () => {
  const response = deferred<Response>();
  const started = deferred<void>();
  const f = fixture(() => {
    started.resolve();
    return response.promise;
  });
  const controller = new AbortController();

  const abandoned = f.coordinator.request({
    ...f.input,
    init: { ...f.input.init, signal: controller.signal },
  });
  const retained = f.coordinator.request(f.input);
  await started.promise;
  controller.abort();

  expect(await abandoned).toMatchObject({ ok: false, error: { code: "cancelled" } });
  expect(f.requests[0]?.signal?.aborted).toBe(false);
  response.resolve(Response.json({ kept: true }));
  expect(await text(await retained)).toContain("kept");
  expect(f.requests).toHaveLength(1);
});

test("all readers cancelling aborts their shared request", async () => {
  const started = deferred<void>();
  const f = fixture(
    (request) =>
      new Promise((_resolve, reject) => {
        request.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        );
        started.resolve();
      }),
  );
  const controller = new AbortController();
  const pending = f.coordinator.request({
    ...f.input,
    init: { ...f.input.init, signal: controller.signal },
  });
  await started.promise;
  controller.abort();

  expect(await pending).toMatchObject({ ok: false, error: { code: "cancelled" } });
  expect(f.requests[0]?.signal?.aborted).toBe(true);
});

test("writes are never coalesced and invalidate cached reads", async () => {
  const f = fixture((request) =>
    request.method === "POST"
      ? new Response(null, { status: 204 })
      : Response.json({ read: true }, { headers: { etag: '"before-write"' } }),
  );
  const input = { ...f.input, maxAgeMs: 2000 };
  await f.coordinator.request(input);
  const write = { ...input, kind: "write" as const, init: { ...input.init, method: "POST" } };
  expect(await f.coordinator.request(write)).toMatchObject({ ok: true });
  expect(await f.coordinator.request(write)).toMatchObject({ ok: true });
  await f.coordinator.request(input);

  expect(f.requests).toHaveLength(4);
  expect(f.requests[3]?.headers.has("if-none-match")).toBe(false);
});

test("a read that finishes after a write cannot repopulate the current cache", async () => {
  const started = deferred<void>();
  const old = deferred<Response>();
  let first = true;
  const f = fixture((request) => {
    if (request.method === "POST") return new Response(null, { status: 204 });
    if (first) {
      first = false;
      started.resolve();
      return old.promise;
    }
    return Response.json({ head: "new" });
  });
  const input = { ...f.input, maxAgeMs: 2000 };
  const stale = f.coordinator.request(input);
  await started.promise;
  await f.coordinator.request({ ...input, kind: "write", init: { ...input.init, method: "POST" } });
  old.resolve(Response.json({ head: "old" }));
  await stale;

  expect(await text(await f.coordinator.request(input))).toContain("new");
  expect(f.requests).toHaveLength(3);
});

test("explicit refresh revalidates fresh content and retains usable conditional validators", async () => {
  const f = fixture((request) =>
    request.headers.has("if-none-match")
      ? new Response(null, { status: 304 })
      : Response.json({}, { headers: { etag: '"v1"' } }),
  );
  const input = { ...f.input, maxAgeMs: 2000 };
  await f.coordinator.request(input);
  f.coordinator.revalidate("github", "Bearer fixture-token");
  await f.coordinator.request(input);

  expect(f.requests).toHaveLength(2);
  expect(f.requests[1]?.headers.get("if-none-match")).toBe('"v1"');
});

test("bounds active provider reads and drains cancelled queued work on shutdown", async () => {
  const started = deferred<void>();
  let active = 0;
  let maximum = 0;
  const f = fixture(
    (request) =>
      new Promise((_resolve, reject) => {
        active += 1;
        maximum = Math.max(maximum, active);
        request.signal?.addEventListener(
          "abort",
          () => {
            active -= 1;
            reject(new DOMException("Aborted", "AbortError"));
          },
          { once: true },
        );
        if (active === 2) started.resolve();
      }),
  );
  const reads = Array.from({ length: 8 }, (_, index) =>
    f.coordinator.request({ ...f.input, url: `${f.input.url}/${index}` }),
  );
  await started.promise;
  f.coordinator.dispose();

  expect(await Promise.all(reads)).toEqual(
    Array.from({ length: 8 }, () =>
      expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "cancelled" }) }),
    ),
  );
  expect(maximum).toBe(2);
  expect(f.requests).toHaveLength(2);
});

test("oversized and no-store responses are not retained in the read cache", async () => {
  for (const noStore of [true, false]) {
    const f = fixture(
      () =>
        new Response(noStore ? "small" : "x".repeat(1024 * 1024 + 1), {
          headers: noStore ? { "cache-control": "no-store" } : {},
        }),
    );
    await f.coordinator.request({ ...f.input, maxAgeMs: 2000 });
    await f.coordinator.request({ ...f.input, maxAgeMs: 2000 });
    expect(f.requests).toHaveLength(2);
  }
});
