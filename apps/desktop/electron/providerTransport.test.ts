import { once } from "node:events";
import { createServer } from "node:http";
import { expect, test } from "vitest";

import { requestBitbucket, requestGitHub } from "./providerTransport";

test("real HTTP transport shares bodies, revalidates, and observes swallowed feature failures", async () => {
  const requested: Array<{ path: string | undefined; validator: string | undefined }> = [];
  const server = createServer((request, response) => {
    requested.push({ path: request.url, validator: request.headers["if-none-match"] });
    if (request.url === "/limited") {
      response.writeHead(429, { "retry-after": "30" });
      response.end("{}");
      return;
    }
    if (request.headers["if-none-match"] === '"same"') {
      response.writeHead(304);
      response.end();
      return;
    }
    response.writeHead(200, { "content-type": "application/json", etag: '"same"' });
    response.end('{"head":"first"}');
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing fixture address");
  const origin = `http://127.0.0.1:${address.port}`;
  const init = { headers: { authorization: "Bearer fixture-only" } };

  try {
    const bodies = await Promise.all([
      requestGitHub(`${origin}/pull`, init, (response) => response.text()),
      requestGitHub(`${origin}/pull`, init, (response) => response.text()),
    ]);
    expect(bodies).toEqual(['{"head":"first"}', '{"head":"first"}']);
    expect(requested).toHaveLength(1);
    expect(await requestGitHub(`${origin}/pull`, init, (response) => response.text())).toBe(
      bodies[0],
    );
    expect(requested[1]?.validator).toBe('"same"');

    await Promise.allSettled([
      requestBitbucket(`${origin}/limited`, init, (response) => response.text()),
    ]);
    await expect(
      requestBitbucket(`${origin}/different-pr`, init, (response) => response.text()),
    ).rejects.toMatchObject({ failure: { code: "rate-limit" } });
    expect(requested.map((request) => request.path)).toEqual(["/pull", "/pull", "/limited"]);
  } finally {
    server.closeAllConnections();
    server.close();
    await once(server, "close");
  }
});
