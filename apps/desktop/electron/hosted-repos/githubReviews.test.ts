import { createServer } from "node:http";
import { afterEach, expect, test } from "vitest";

import type { PullRequestReviewDraftCommentInput } from "../../src/platform/desktop/contracts";
import { DesktopAdapterError, providerFailure } from "../desktop-failure";
import { requestProvider } from "../providerRequest";
import { GitHubReviewPublisher } from "./githubReviews";

const servers: ReturnType<typeof createServer>[] = [];
const comments: PullRequestReviewDraftCommentInput[] = [
  {
    draftId: "draft-1",
    path: "invoice.ts",
    body: "Check this amount",
    line: 4,
    side: "RIGHT",
  },
  {
    draftId: "draft-2",
    path: "invoice.ts",
    body: "Keep the earlier validation",
    line: 9,
    side: "LEFT",
    startLine: 7,
    startSide: "LEFT",
  },
];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(async (server) => {
      server.closeAllConnections();

      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }),
  );
});

async function fixture(status: number) {
  const requests: Array<{ pathname: string; body: unknown }> = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];

    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const body: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));

      requests.push({ pathname: request.url ?? "", body });
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify({ id: 123, state: "COMMENTED" }));
    });
  });
  servers.push(server);

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing fixture address");

  const publisher = new GitHubReviewPublisher((pathname, body) =>
    requestProvider(
      `http://127.0.0.1:${address.port}${pathname}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
      async (response) => {
        if (!response.ok) {
          throw new DesktopAdapterError(
            providerFailure("github", response.status, response.headers, Date.now()),
          );
        }

        return response.json();
      },
      { kind: "write", timeoutMs: 1000 },
    ),
  );

  return { publisher, requests };
}

test("publishes inline comments with one completed review write and no later submit request", async () => {
  const { publisher, requests } = await fixture(201);

  const result = await publisher.publish({
    owner: "team",
    repo: "invoice",
    pullRequestNumber: 114,
    comments,
  });

  expect(requests).toEqual([
    {
      pathname: "/repos/team/invoice/pulls/114/reviews",
      body: {
        event: "COMMENT",
        body: "",
        comments: [
          { path: "invoice.ts", body: "Check this amount", line: 4, side: "RIGHT" },
          {
            path: "invoice.ts",
            body: "Keep the earlier validation",
            line: 9,
            side: "LEFT",
            start_line: 7,
            start_side: "LEFT",
          },
        ],
      },
    },
  ]);
  expect(result).toEqual({
    submittedDraftIds: ["draft-1", "draft-2"],
    failedDraftId: null,
    failedMessage: null,
  });
});

test("does not acknowledge drafts or retry a rejected review write", async () => {
  const { publisher, requests } = await fixture(403);

  await expect(
    publisher.publish({ owner: "team", repo: "invoice", pullRequestNumber: 114, comments }),
  ).rejects.toMatchObject({ failure: { code: "permission" } });

  expect(requests).toHaveLength(1);
  expect(requests.map((request) => request.pathname)).toEqual([
    "/repos/team/invoice/pulls/114/reviews",
  ]);
});
