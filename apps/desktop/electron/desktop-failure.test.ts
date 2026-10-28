import { createServer } from "node:http";
import { once } from "node:events";
import { describe, expect, test } from "vitest";

import { captureDesktopOperation } from "../src/platform/desktop/failure";
import { classifyDesktopFailure, providerFailure } from "./desktop-failure";
import { bitbucketRequest } from "./bitbucket-repo";
import { getCommitHistory } from "./git";
import { runGitCommand } from "./gitOperations";

describe("desktop failure boundary", () => {
  test("returns a serializable failure for a real failed Git read", async () => {
    const reply = await captureDesktopOperation(
      "getCommitHistory",
      () => getCommitHistory("/missing-open-warden-test-repository"),
      classifyDesktopFailure,
    );
    expect(structuredClone(reply)).toMatchObject({
      ok: false,
      error: { code: "not-found", operation: "getCommitHistory" },
    });
    expect(JSON.stringify(reply)).not.toContain("fatal:");
  });

  test("translates a Git command rejection to the same result contract", async () => {
    const reply = await captureDesktopOperation(
      "runGitCommand",
      () => runGitCommand("", { kind: "pull" }),
      classifyDesktopFailure,
    );
    expect(reply).toMatchObject({
      ok: false,
      error: { code: "invalid-input", operation: "runGitCommand" },
    });
  });

  test("keeps provider status and recovery metadata without returning response bodies", async () => {
    const server = createServer((_request, response) => {
      response.writeHead(401, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: { message: "private token: never-show-this" } }));
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Missing test server address");
      const reply = await captureDesktopOperation(
        "listPullRequests",
        () =>
          bitbucketRequest(`http://127.0.0.1:${address.port}/pullrequests`, {
            token: "test",
            authType: "bearer",
          }),
        classifyDesktopFailure,
      );
      expect(reply).toMatchObject({
        ok: false,
        error: {
          code: "authentication",
          provider: "bitbucket",
          status: 401,
          operation: "listPullRequests",
        },
      });
      expect(JSON.stringify(reply)).not.toContain("never-show-this");
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  test("distinguishes rate limits from permission failures", () => {
    expect(providerFailure("github", 403, new Headers(), 1000)).toMatchObject({
      code: "permission",
    });
    expect(
      providerFailure(
        "github",
        403,
        new Headers({ "x-ratelimit-remaining": "0", "retry-after": "30" }),
        1000,
      ),
    ).toMatchObject({ code: "rate-limit", retryAt: 31000 });
    expect(
      providerFailure("bitbucket", 429, new Headers({ "retry-after": "invalid" }), 1000).retryAt,
    ).toBeUndefined();
  });
});
