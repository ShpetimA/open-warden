import { describe, expect, it } from "vitest";
import { parsePullRequestLink } from "./pullRequestLink";

describe("pull request links", () => {
  it.each([
    ["https://bitbucket.org/ndbusinessit/invoice-service/pull-requests/114", "bitbucket", 114],
    [" https://github.com/acme/widget/pull/42/files?diff=split#discussion ", "github", 42],
    ["https://bitbucket.org/team/repo/pull-requests/7/diff/", "bitbucket", 7],
  ])("parses and normalizes %s", (input, providerId, number) => {
    const link = parsePullRequestLink(input);
    expect(link?.providerId).toBe(providerId);
    expect(link?.pullRequestNumber).toBe(number);
    expect(link?.url).not.toMatch(/[?#]/);
    expect(link?.url.endsWith(`/${number}`)).toBe(true);
  });

  it.each([
    null,
    "not a URL",
    "https://github.com/acme/widget",
    "https://github.com/acme/widget/issues/42",
    "https://github.com/acme/widget/pull-requests/42",
    "https://bitbucket.org/team/repo/pull/42",
    "https://github.com.evil.test/acme/widget/pull/42",
    "https://github.com@evil.test/acme/widget/pull/42",
    "https://user:secret@github.com/acme/widget/pull/42",
    "http://github.com/acme/widget/pull/42",
    "https://github.com:1234/acme/widget/pull/42",
    "https://github.com/acme/widget/pull/0",
    "https://github.com/acme/widget/pull/-1",
    "https://github.com/acme/widget/pull/1.5",
    "https://github.com/acme/widget/pull/9007199254740992",
  ])("rejects unsupported or malformed input %s", (input) => {
    expect(parsePullRequestLink(input)).toBeNull();
  });
});
