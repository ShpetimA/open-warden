import { expect, test } from "vitest";

import { providerFailure } from "./desktop-failure";

test.each([401, 403, 404, 422, 500])(
  "HTTP %s does not turn routine quota headers into a cooldown",
  (status) => {
    const failure = providerFailure(
      "github",
      status,
      new Headers({ "x-ratelimit-remaining": "4900", "x-ratelimit-reset": "2000" }),
      1000,
    );

    expect(failure.retryAt).toBeUndefined();
    expect(failure.code).not.toBe("rate-limit");
  },
);

test("exhausted quota uses reset, while a secondary limit uses Retry-After", () => {
  expect(
    providerFailure(
      "github",
      403,
      new Headers({
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": "2000",
      }),
      1000,
    ),
  ).toMatchObject({ code: "rate-limit", retryAt: 2_000_000 });

  expect(
    providerFailure(
      "github",
      429,
      new Headers({
        "retry-after": "30",
        "x-ratelimit-remaining": "4900",
        "x-ratelimit-reset": "2000",
      }),
      1000,
    ),
  ).toMatchObject({ code: "rate-limit", retryAt: 31_000 });
});

test("GraphQL rate limits retain HTTP 200 and get the same reset policy", () => {
  expect(
    providerFailure(
      "github",
      200,
      new Headers({
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": "2000",
      }),
      1000,
      { rateLimited: true },
    ),
  ).toMatchObject({
    code: "rate-limit",
    status: 200,
    retryAt: 2_000_000,
  });
});

test("server Retry-After accepts dates and rejects invalid values", () => {
  expect(
    providerFailure(
      "bitbucket",
      503,
      new Headers({
        "retry-after": "Thu, 01 Jan 1970 00:01:00 GMT",
      }),
      1000,
    ),
  ).toMatchObject({ code: "unavailable", retryAt: 60_000 });

  expect(
    providerFailure(
      "github",
      429,
      new Headers({
        "retry-after": "invalid",
        "x-ratelimit-reset": "2000",
        "x-ratelimit-remaining": "100",
      }),
      1000,
    ).retryAt,
  ).toBeUndefined();
});
