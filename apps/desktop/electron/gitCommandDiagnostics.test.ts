// @vitest-environment node
import { expect, test } from "vitest";

import { sanitizeGitCommandOutput } from "./gitCommandDiagnostics";

test("keeps hook failures readable while removing terminal escapes and credentials", () => {
  const output = [
    "\u001b[31mFAIL Git lock test\u001b[0m",
    "Expected completion within 5000ms",
    "Authorization: Basic dXNlcjpzZWNyZXQ=",
    "Authorization: Bearer bearer-credential",
    "password=private-password token: private-token",
    "https://user:password@example.com/repo.git",
    "github_pat_private_token ghp_private_token",
    "environment-credential",
  ].join("\n");
  const safe = sanitizeGitCommandOutput(output, { DEPLOY_TOKEN: "environment-credential" });

  expect(safe).toContain("FAIL Git lock test\nExpected completion within 5000ms");

  for (const secret of [
    "dXNlcjpzZWNyZXQ=",
    "bearer-credential",
    "private-password",
    "private-token",
    "user:password",
    "github_pat_private_token",
    "ghp_private_token",
    "environment-credential",
    "\u001b",
  ]) {
    expect(safe).not.toContain(secret);
  }
});

test("retains the final failure instead of flooding the error surface with successful test output", () => {
  const safe = sanitizeGitCommandOutput(`${"passing test\n".repeat(2000)}pre-push failed`, {});

  expect(safe.length).toBeLessThanOrEqual(16000);
  expect(safe).toMatch(/pre-push failed$/);
});
