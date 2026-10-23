import type { GitProviderId } from "./contracts";

/**
 * Media a pull request body points at on a provider's own hosts. In a private repository the
 * provider answers an unauthenticated request with 401/404, so the renderer draws a broken image
 * where the reviewer expects a screenshot. The main process fetches these with the saved
 * provider credential and serves the bytes through `PROVIDER_MEDIA_SCHEME`.
 */
export const PROVIDER_MEDIA_SCHEME = "ow-media";

export type ProviderMediaTarget = {
  providerId: Extract<GitProviderId, "github" | "bitbucket">;
  fetchUrl: string;
};

const SEGMENT = "[A-Za-z0-9_.-]+";
const GITHUB_ATTACHMENT_PATH = /^\/user-attachments\/assets\/[\w-]+$/u;
const GITHUB_LEGACY_ATTACHMENT_PATH = new RegExp(
  `^/${SEGMENT}/${SEGMENT}/assets/\\d+/[\\w-]+$`,
  "u",
);
const GITHUB_REPOSITORY_FILE_PATH = new RegExp(
  `^/(${SEGMENT})/(${SEGMENT})/(?:raw|blob)/(.*[^/])$`,
  "u",
);
const BITBUCKET_REPOSITORY_FILE_PATH = new RegExp(
  `^/(${SEGMENT})/(${SEGMENT})/(?:raw|src)/(.*[^/])$`,
  "u",
);
const BITBUCKET_DOWNLOAD_PATH = new RegExp(`^/(${SEGMENT})/(${SEGMENT})/downloads/([^/]+)$`, "u");
const BITBUCKET_API_MEDIA_PATH = new RegExp(
  `^/2\\.0/repositories/${SEGMENT}/${SEGMENT}/(?:src|downloads)/.+$`,
  "u",
);

function githubMediaTarget(url: URL, host: string): ProviderMediaTarget | null {
  if (host === "raw.githubusercontent.com" || host === "media.githubusercontent.com") {
    return { providerId: "github", fetchUrl: `https://${host}${url.pathname}${url.search}` };
  }
  if (host !== "github.com" && host !== "www.github.com") return null;
  if (
    GITHUB_ATTACHMENT_PATH.test(url.pathname) ||
    GITHUB_LEGACY_ATTACHMENT_PATH.test(url.pathname)
  ) {
    return { providerId: "github", fetchUrl: `https://github.com${url.pathname}` };
  }
  const file = GITHUB_REPOSITORY_FILE_PATH.exec(url.pathname);
  return file
    ? {
        providerId: "github",
        fetchUrl: `https://raw.githubusercontent.com/${file[1]}/${file[2]}/${file[3]}`,
      }
    : null;
}

function bitbucketMediaTarget(url: URL, host: string): ProviderMediaTarget | null {
  if (host === "api.bitbucket.org") {
    return BITBUCKET_API_MEDIA_PATH.test(url.pathname)
      ? { providerId: "bitbucket", fetchUrl: `https://api.bitbucket.org${url.pathname}` }
      : null;
  }
  if (host !== "bitbucket.org" && host !== "www.bitbucket.org") return null;
  const api = "https://api.bitbucket.org/2.0/repositories";
  // The web host only honours a browser session; the API answers the same bytes to a token.
  const file = BITBUCKET_REPOSITORY_FILE_PATH.exec(url.pathname);
  if (file) {
    return { providerId: "bitbucket", fetchUrl: `${api}/${file[1]}/${file[2]}/src/${file[3]}` };
  }
  const download = BITBUCKET_DOWNLOAD_PATH.exec(url.pathname);
  return download
    ? {
        providerId: "bitbucket",
        fetchUrl: `${api}/${download[1]}/${download[2]}/downloads/${download[3]}`,
      }
    : null;
}

/** Where to fetch `source` with a provider credential, or null when it loads on its own. */
export function providerMediaTarget(source: string): ProviderMediaTarget | null {
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();
  return githubMediaTarget(url, host) ?? bitbucketMediaTarget(url, host);
}

export function providerMediaSourceUrl(source: string) {
  return `${PROVIDER_MEDIA_SCHEME}://media/?src=${encodeURIComponent(source)}`;
}

/** Hosts the credential is for. Redirect targets (signed object stores) never see the token. */
export function isProviderCredentialedHost(
  providerId: ProviderMediaTarget["providerId"],
  target: string,
) {
  let host: string;
  try {
    host = new URL(target).hostname.toLowerCase();
  } catch {
    return false;
  }
  return providerId === "github"
    ? [
        "github.com",
        "www.github.com",
        "raw.githubusercontent.com",
        "media.githubusercontent.com",
      ].includes(host)
    : ["bitbucket.org", "api.bitbucket.org"].includes(host);
}
