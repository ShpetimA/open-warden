import path from "node:path";

import {
  isProviderCredentialedHost,
  providerMediaTarget,
  type ProviderMediaTarget,
} from "../src/platform/desktop/providerMedia";
import { bitbucketAuthorizationValue } from "./bitbucket-repo";
import { getProviderConnection } from "./providerConnections";

/** GitHub and Bitbucket answer an asset with a redirect to a signed object URL. */
const MAX_REDIRECTS = 3;
const MEDIA_CONTENT_TYPE = /^(?:image|video|audio)\/[\w!#$&^.+-]+$/i;
const SVG_CONTENT_SECURITY_POLICY = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
const FORWARDED_RESPONSE_HEADERS = [
  "content-length",
  "content-range",
  "accept-ranges",
  "etag",
  "last-modified",
] as const;
const EXTENSION_CONTENT_TYPES: Record<string, string> = {
  ".apng": "image/apng",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".mov": "video/quicktime",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webm": "video/webm",
  ".webp": "image/webp",
};

async function authorizationFor(providerId: ProviderMediaTarget["providerId"]) {
  const connection = await getProviderConnection(providerId);
  if (!connection) return null;
  return providerId === "github"
    ? `Bearer ${connection.token}`
    : bitbucketAuthorizationValue(connection);
}

/** The credential only ever rides on a request to the provider itself, never to a signed store. */
async function fetchFollowingRedirects(
  target: ProviderMediaTarget,
  authorization: string | null,
  range: string | null,
) {
  let url = target.fetchUrl;
  for (let hop = 0; ; hop += 1) {
    const headers: Record<string, string> = { "accept-encoding": "identity" };
    if (range) headers.range = range;
    if (authorization && isProviderCredentialedHost(target.providerId, url)) {
      headers.authorization = authorization;
    }
    const response = await fetch(url, { headers, redirect: "manual" });
    if (response.status < 300 || response.status >= 400) return response;
    const location = response.headers.get("location");
    if (!location || hop >= MAX_REDIRECTS) return null;
    const next = new URL(location, url);
    if (next.protocol !== "https:") return null;
    url = next.toString();
  }
}

function mediaContentType(response: Response, fetchUrl: string) {
  const upstream =
    response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (MEDIA_CONTENT_TYPE.test(upstream)) return upstream;
  // Raw file hosts label every committed binary `application/octet-stream`.
  return EXTENSION_CONTENT_TYPES[path.extname(new URL(fetchUrl).pathname).toLowerCase()] ?? null;
}

/** Serves `ow-media://media/?src=<provider media url>` with the saved provider credential. */
export async function handleProviderMediaRequest(request: Request): Promise<Response> {
  const source = new URL(request.url).searchParams.get("src") ?? "";
  const target = providerMediaTarget(source);
  if (!target) return new Response(null, { status: 400 });

  const headers: Record<string, string> = {
    "cache-control": "private, max-age=3600",
    "x-content-type-options": "nosniff",
  };
  let response: Response | null;
  try {
    response = await fetchFollowingRedirects(
      target,
      await authorizationFor(target.providerId),
      request.headers.get("range"),
    );
  } catch {
    response = null;
  }
  if (!response) return new Response(null, { status: 502, headers });
  if (response.status >= 400) {
    return new Response(null, { status: response.status >= 500 ? 502 : response.status, headers });
  }

  const contentType = mediaContentType(response, target.fetchUrl);
  if (!contentType) return new Response(null, { status: 415, headers });
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = response.headers.get(name);
    if (value !== null) headers[name] = value;
  }
  headers["content-type"] = contentType;
  if (contentType === "image/svg+xml") {
    headers["content-security-policy"] = SVG_CONTENT_SECURITY_POLICY;
  }
  return new Response(response.body, { status: response.status, headers });
}
