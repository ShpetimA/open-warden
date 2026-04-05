import { describe, expect, it } from "vitest";

import { parseRemoteUrl } from "./hostedRepos";

describe("parseRemoteUrl", () => {
  it("parses GitHub HTTPS remotes", () => {
    expect(parseRemoteUrl("https://github.com/openai/open-warden.git")).toEqual({
      providerId: "github",
      owner: "openai",
      repo: "open-warden",
      remoteUrl: "https://github.com/openai/open-warden.git",
      webUrl: "https://github.com/openai/open-warden",
    });
  });

  it("parses GitHub SSH remotes", () => {
    expect(parseRemoteUrl("git@github.com:openai/open-warden.git")).toEqual({
      providerId: "github",
      owner: "openai",
      repo: "open-warden",
      remoteUrl: "git@github.com:openai/open-warden.git",
      webUrl: "https://github.com/openai/open-warden",
    });
  });

  it("parses GitLab and Bitbucket remotes", () => {
    expect(parseRemoteUrl("https://gitlab.com/example/group-repo.git")?.providerId).toBe("gitlab");
    expect(parseRemoteUrl("ssh://git@bitbucket.org/example/group-repo.git")?.providerId).toBe(
      "bitbucket",
    );
    expect(
      parseRemoteUrl("https://user@bitbucket.org/example/group-repo")?.providerId,
    ).toBe("bitbucket");
  });

  it("returns null for unsupported hosts", () => {
    expect(parseRemoteUrl("https://example.com/openai/open-warden.git")).toBeNull();
  });
});
