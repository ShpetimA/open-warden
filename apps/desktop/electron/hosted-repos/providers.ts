import type {
  ConnectProviderInput,
  GitProviderId,
  ProviderConnection,
} from "../../src/platform/desktop/contracts";
import {
  bitbucketAuthorLogin,
  bitbucketRequest,
  type BitbucketUserResponse,
} from "../bitbucket-repo";
import { githubRequest, type GitHubUserResponse } from "../github-repo";
import {
  deleteProviderConnection,
  listProviderConnections as listStoredProviderConnections,
  saveProviderConnection,
} from "../providerConnections";

function parseOAuthScopes(headerValue: string | null) {
  if (!headerValue) {
    return [];
  }

  return headerValue
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function providerDisplayName(providerId: GitProviderId) {
  if (providerId === "github") return "GitHub";
  if (providerId === "gitlab") return "GitLab";
  return "Bitbucket";
}

export function missingConnectionMessage(providerId: GitProviderId) {
  return `${providerDisplayName(providerId)} is not connected.`;
}

function normalizeOptionalIdentifier(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function connectGitHubProvider(input: ConnectProviderInput): Promise<ProviderConnection> {
  const token = input.token.trim();
  if (!token) {
    throw new Error("Token is required.");
  }

  const { data, headers } = await githubRequest<GitHubUserResponse>("/user", token);

  return saveProviderConnection({
    ...input,
    token,
    identifier: null,
    authType: "bearer",
    login: data.login,
    displayName: data.name,
    avatarUrl: data.avatar_url,
    scopes: parseOAuthScopes(headers.get("x-oauth-scopes")),
  });
}

async function connectBitbucketProvider(input: ConnectProviderInput): Promise<ProviderConnection> {
  const token = input.token.trim();
  if (!token) {
    throw new Error("Token or app password is required.");
  }

  const identifier = normalizeOptionalIdentifier(input.identifier);
  const authAttempts: Array<{ authType: "basic" | "bearer"; identifier: string | null }> = [];
  if (input.authType === "basic") {
    if (!identifier) {
      throw new Error("Bitbucket username/email is required for basic authentication.");
    }
    authAttempts.push({ authType: "basic", identifier });
  } else if (input.authType === "bearer") {
    authAttempts.push({ authType: "bearer", identifier: null });
  } else {
    if (identifier) {
      authAttempts.push({ authType: "basic", identifier });
    }
    authAttempts.push({ authType: "bearer", identifier: null });
  }

  let lastError: unknown = null;
  for (const attempt of authAttempts) {
    try {
      const { data, headers } = await bitbucketRequest<BitbucketUserResponse>("/user", {
        token,
        authType: attempt.authType,
        identifier: attempt.identifier,
      });
      const login = bitbucketAuthorLogin(data) || "bitbucket-user";
      const displayName = data.display_name ?? null;
      const avatarUrl = data.links?.avatar?.href ?? null;
      const persistedIdentifier =
        attempt.authType === "basic" ? attempt.identifier ?? null : null;
      return saveProviderConnection({
        ...input,
        token,
        identifier: persistedIdentifier,
        authType: attempt.authType,
        login,
        displayName,
        avatarUrl,
        scopes: parseOAuthScopes(headers.get("x-oauth-scopes")),
      });
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Failed to validate Bitbucket credentials.");
}

export async function listProviderConnections(): Promise<ProviderConnection[]> {
  return listStoredProviderConnections();
}

export async function connectProvider(input: ConnectProviderInput): Promise<ProviderConnection> {
  if (input.providerId === "github") {
    return connectGitHubProvider(input);
  }

  if (input.providerId === "bitbucket") {
    return connectBitbucketProvider(input);
  }

  throw new Error(`${providerDisplayName(input.providerId)} connections are not supported yet.`);
}

export async function disconnectProvider(providerId: GitProviderId): Promise<void> {
  await deleteProviderConnection(providerId);
}
