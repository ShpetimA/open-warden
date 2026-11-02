import { expect, test } from "vitest";

import { BitbucketCommitResolver } from "./BitbucketCommitResolver";
import { DesktopAdapterError } from "./desktop-failure";

const head = "123456789abc" + "1".repeat(28);
const base = "abcdef123456" + "2".repeat(28);

test("resolves Bitbucket's abbreviated source and destination IDs in their own repositories", async () => {
  const requests: string[] = [];
  const resolver = new BitbucketCommitResolver(async (pathname) => {
    requests.push(pathname);
    return { hash: pathname.includes("contributor/fork") ? head : base };
  });

  const results = await Promise.all([
    resolver.resolve({ owner: "contributor", repo: "fork", reference: head.slice(0, 12) }),
    resolver.resolve({ owner: "team", repo: "upstream", reference: base.slice(0, 12) }),
  ]);

  expect(results).toEqual([
    { ok: true, value: head },
    { ok: true, value: base },
  ]);
  expect(requests).toEqual([
    `/repositories/contributor/fork/commit/${head.slice(0, 12)}?fields=hash`,
    `/repositories/team/upstream/commit/${base.slice(0, 12)}?fields=hash`,
  ]);
});

test("full SHA-1 and SHA-256 IDs need no extra provider reads", async () => {
  let reads = 0;
  const resolver = new BitbucketCommitResolver(async () => {
    reads += 1;
    return {};
  });

  for (const reference of [head, "a".repeat(64)]) {
    expect(await resolver.resolve({ owner: "team", repo: "app", reference })).toEqual({
      ok: true,
      value: reference,
    });
  }
  expect(reads).toBe(0);
});

test.each([
  undefined,
  null,
  "",
  "main",
  "HEAD",
  "--upload-pack=unexpected",
  "../branch",
  "a".repeat(65),
])("rejects missing and invalid commit references before reading: %j", async (reference) => {
  let reads = 0;
  const resolver = new BitbucketCommitResolver(async () => {
    reads += 1;
    return {};
  });

  expect(await resolver.resolve({ owner: "team", repo: "app", reference })).toMatchObject({
    ok: false,
    error: { code: "unavailable" },
  });
  expect(reads).toBe(0);
});

test.each([{ hash: "f".repeat(40) }, { hash: head.slice(0, 12) }, {}, { hash: null }])(
  "rejects malformed, abbreviated, or unrelated lookup results: %j",
  async (payload) => {
    const resolver = new BitbucketCommitResolver(async () => payload);
    expect(
      await resolver.resolve({ owner: "team", repo: "app", reference: head.slice(0, 12) }),
    ).toMatchObject({ ok: false, error: { code: "unavailable" } });
  },
);

test("preserves rate-limit recovery without substituting a branch tip or retrying", async () => {
  let reads = 0;
  const resolver = new BitbucketCommitResolver(async () => {
    reads += 1;
    throw new DesktopAdapterError({
      operation: "bitbucket.request",
      provider: "bitbucket",
      code: "rate-limit",
      retryAt: 60_000,
      message: "Wait",
    });
  });

  expect(
    await resolver.resolve({ owner: "team", repo: "app", reference: head.slice(0, 12) }),
  ).toMatchObject({ ok: false, error: { code: "rate-limit", retryAt: 60_000 } });
  expect(reads).toBe(1);
});
