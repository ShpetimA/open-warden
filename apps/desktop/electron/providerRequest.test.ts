import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { afterEach, expect, test } from "vitest";

import { requestProvider } from "./providerRequest";
import { bitbucketRequest } from "./bitbucket-repo";

const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(async (server) => {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }),
  );
});

async function serve(handle: (request: IncomingMessage, response: ServerResponse) => void) {
  const server = createServer(handle);
  servers.push(server);

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing fixture address");

  return `http://127.0.0.1:${address.port}`;
}

test("bounds a provider that never sends response headers", async () => {
  const url = await serve(() => {});

  await expect(
    requestProvider(url, {}, (response) => response.text(), { timeoutMs: 100 }),
  ).rejects.toMatchObject({ failure: { code: "timeout" } });
});

test("the same deadline covers a body that stalls after successful headers", async () => {
  let bodyReadStarted = false;
  const url = await serve((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.flushHeaders();
    response.write('{"unfinished":');
  });

  await expect(
    requestProvider(
      url,
      {},
      (response) => {
        bodyReadStarted = true;
        return response.text();
      },
      { timeoutMs: 1000 },
    ),
  ).rejects.toMatchObject({ failure: { code: "timeout" } });
  expect(bodyReadStarted).toBe(true);
});

test("propagates caller cancellation through an active response body", async () => {
  const controller = new AbortController();
  const url = await serve((_request, response) => {
    response.writeHead(200);
    response.flushHeaders();
  });

  const read = requestProvider(url, { signal: controller.signal }, async (response) => {
    controller.abort();
    return response.text();
  });

  await expect(read).rejects.toMatchObject({ name: "AbortError" });
});

test("an uncertain write is reported once with recovery guidance and is never retried", async () => {
  let writes = 0;
  const url = await serve((_request, response) => {
    writes += 1;
    response.writeHead(200);
    response.flushHeaders();
    response.write("partial");
  });

  await expect(
    requestProvider(url, { method: "POST" }, (response) => response.text(), { timeoutMs: 1000 }),
  ).rejects.toMatchObject({
    failure: { code: "timeout", message: expect.stringContaining("Refresh before trying again") },
  });
  expect(writes).toBe(1);
});

test("reads successful responses and leaves status failures to the provider adapter", async () => {
  const url = await serve((_request, response) => response.end("complete"));

  await expect(requestProvider(url, {}, (response) => response.text())).resolves.toBe("complete");
});

test("Bitbucket refuses foreign pagination origins before attaching credentials", async () => {
  let requests = 0;
  const url = await serve((_request, response) => {
    requests += 1;
    response.end("unexpected");
  });

  await expect(
    bitbucketRequest(`${url}/2.0/repositories/team/repo`, {
      token: "fixture-only-token",
      authType: "bearer",
      identifier: null,
    }),
  ).rejects.toMatchObject({ failure: { code: "invalid-input" } });
  expect(requests).toBe(0);
});
