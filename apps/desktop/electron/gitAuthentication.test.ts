import { expect, test } from "vitest";

import { gitAuthenticationEnvironment } from "./gitAuthentication";
import type { ProviderConnectionSecret } from "./providerConnections";

test("limits saved provider credentials to their HTTPS origin and supports both Bitbucket auth methods", async () => {
  const requested: string[] = [];
  const connection: ProviderConnectionSecret = {
    id: "bitbucket",
    providerId: "bitbucket",
    method: "pat",
    login: "test-user",
    displayName: null,
    avatarUrl: null,
    scopes: [],
    createdAt: "",
    updatedAt: "",
    token: "test-only-token",
    authType: "bearer",
    identifier: "test@example.com",
  };

  const credentials = async (provider: "github" | "bitbucket") => {
    requested.push(provider);

    return { ...connection, id: provider, providerId: provider };
  };

  for (const source of [
    "git@bitbucket.org:workspace/repo.git",
    "/local/repository",
    "https://unrelated.example/repo.git",
    "http://github.com/org/repo.git",
    "https://github.com:8443/org/repo.git",
  ])
    expect(await gitAuthenticationEnvironment(source, credentials)).toEqual({});

  expect(requested).toEqual([]);

  const bitbucket = await gitAuthenticationEnvironment(
    "https://bitbucket.org/workspace/repo.git",
    credentials,
  );

  expect(bitbucket.GIT_CONFIG_KEY_0).toBe("http.https://bitbucket.org/.extraheader");
  expect(bitbucket.GIT_CONFIG_VALUE_0?.startsWith("Authorization: Bearer ")).toBe(true);

  const github = await gitAuthenticationEnvironment("https://github.com/org/repo.git", credentials);

  expect(github.GIT_CONFIG_VALUE_0?.startsWith("Authorization: Basic ")).toBe(true);

  const basic = await gitAuthenticationEnvironment(
    "https://bitbucket.org/workspace/repo.git",
    async () => ({ ...connection, authType: "basic" }),
  );

  expect(basic.GIT_CONFIG_VALUE_0?.startsWith("Authorization: Basic ")).toBe(true);
});
