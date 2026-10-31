import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("./providerConnections", () => ({
  getProviderConnection: vi.fn(async (providerId: string) =>
    providerId === "bitbucket"
      ? { providerId, token: "secret", authType: "basic", identifier: "me@example.com" }
      : { providerId, token: "gh-token", authType: "bearer", identifier: null },
  ),
}));

import { handleProviderMediaRequest } from "./providerMedia";

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

function authorizationOf(call: Parameters<typeof fetch>) {
  return (call[1]?.headers as Record<string, string> | undefined)?.authorization;
}

function mediaRequest(source: string) {
  return new Request(`ow-media://media/?src=${encodeURIComponent(source)}`);
}

it("follows a Bitbucket download redirect without sending the credential to the object store", async () => {
  fetchMock
    .mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: "https://bbuseruploads.s3.amazonaws.com/x.png?sig=1" },
      }),
    )
    .mockResolvedValueOnce(
      new Response("png-bytes", { status: 200, headers: { "content-type": "image/png" } }),
    );

  const response = await handleProviderMediaRequest(
    mediaRequest("https://bitbucket.org/acme/app/downloads/shot.png"),
  );

  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("image/png");
  expect(await response.text()).toBe("png-bytes");
  const [apiCall, storeCall] = fetchMock.mock.calls;
  expect(apiCall[0]).toBe("https://api.bitbucket.org/2.0/repositories/acme/app/downloads/shot.png");
  expect(authorizationOf(apiCall)).toMatch(/^Basic /);
  expect(storeCall[0]).toBe("https://bbuseruploads.s3.amazonaws.com/x.png?sig=1");
  expect(authorizationOf(storeCall)).toBeUndefined();
});

it("names octet-stream repository files by their extension and refuses other content", async () => {
  fetchMock.mockResolvedValueOnce(
    new Response("bytes", { status: 200, headers: { "content-type": "application/octet-stream" } }),
  );
  const image = await handleProviderMediaRequest(
    mediaRequest("https://bitbucket.org/acme/app/raw/abc123/docs/shot.webp"),
  );
  expect(image.headers.get("content-type")).toBe("image/webp");

  fetchMock.mockResolvedValueOnce(
    new Response("<html>", { status: 200, headers: { "content-type": "text/html" } }),
  );
  const page = await handleProviderMediaRequest(
    mediaRequest("https://bitbucket.org/acme/app/raw/abc123/docs/index"),
  );
  expect(page.status).toBe(415);
});

it("rejects sources that are not provider media", async () => {
  const response = await handleProviderMediaRequest(mediaRequest("https://example.com/a.png"));
  expect(response.status).toBe(400);
  expect(fetchMock).not.toHaveBeenCalled();
});
