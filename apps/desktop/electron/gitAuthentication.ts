import type { ProviderConnectionSecret } from "./providerConnections";

export type ProviderCredentials = (
  provider: "github" | "bitbucket",
) => Promise<ProviderConnectionSecret | null>;

export async function gitAuthenticationEnvironment(
  source: string,
  credentials: ProviderCredentials,
): Promise<NodeJS.ProcessEnv> {
  let url: URL;

  try {
    url = new URL(source);
  } catch {
    return {};
  }

  if (url.protocol !== "https:" || url.port) return {};

  const provider =
    url.hostname === "github.com"
      ? "github"
      : url.hostname === "bitbucket.org"
        ? "bitbucket"
        : null;

  if (!provider) return {};

  const connection = await credentials(provider);

  if (!connection) return {};

  const user =
    provider === "github" ? "x-access-token" : (connection.identifier ?? connection.login);
  const authorization =
    provider === "github" || connection.authType === "basic"
      ? `Basic ${Buffer.from(`${user}:${connection.token}`).toString("base64")}`
      : `Bearer ${connection.token}`;

  return {
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: `http.${url.origin}/.extraheader`,
    GIT_CONFIG_VALUE_0: `Authorization: ${authorization}`,
  };
}
