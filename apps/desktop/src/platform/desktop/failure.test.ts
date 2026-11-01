import { expect, test } from "vitest";
import {
  captureDesktopOperation,
  desktopFailure,
  parseDesktopReply,
  queryResult,
  readDesktopReply,
} from "./failure";

test("parses success replies including null and void", () => {
  expect(parseDesktopReply(structuredClone({ ok: true, value: null }), "getRepoFile")).toEqual({
    ok: true,
    value: null,
  });
  expect(parseDesktopReply(structuredClone({ ok: true, value: undefined }), "stageFile")).toEqual({
    ok: true,
    value: undefined,
  });
});

test("preserves recovery metadata through query adaptation", () => {
  const error = {
    ...desktopFailure("listPullRequests", "rate-limit", "Wait before retrying."),
    retryAt: 12345,
    provider: "bitbucket" as const,
  };
  expect(queryResult({ ok: false, error })).toEqual({ error });
  expect(queryResult({ ok: true, value: [1, 2] }, (values) => values.length)).toEqual({ data: 2 });
});

test("normalizes internal command and directory results at the desktop boundary", async () => {
  expect(
    await captureDesktopOperation("runGitCommand", () => ({ ok: true, value: "done" })),
  ).toEqual({ ok: true, value: "done" });
  expect(
    await captureDesktopOperation("listDirectories", () => ({ ok: true, entries: [] })),
  ).toEqual({ ok: true, value: { entries: [] } });

  const error = {
    ...desktopFailure("provider.request", "rate-limit", "Wait before retrying."),
    retryAt: 12345,
    provider: "bitbucket" as const,
    status: 429,
  };
  expect(await captureDesktopOperation("listPullRequests", () => ({ ok: false, error }))).toEqual({
    ok: false,
    error: { ...error, operation: "listPullRequests" },
  });
});

test("normalizes malformed replies and transport rejection without exposing raw diagnostics", async () => {
  expect(parseDesktopReply({ error: "secret" }, "getCommitHistory")).toMatchObject({
    ok: false,
    error: { code: "unavailable" },
  });
  const reply = await readDesktopReply(async () => {
    throw new Error("Error invoking method: private token");
  }, "getCommitHistory");
  expect(reply).toMatchObject({
    ok: false,
    error: { code: "unavailable", operation: "getCommitHistory" },
  });
  expect(JSON.stringify(reply)).not.toContain("private token");
});

test("parses Git diagnostics through IPC and rejects invalid or oversized output", () => {
  const failure = {
    ...desktopFailure("runGitCommand", "git-failed", "Git rejected the push."),
    git: { exitCode: 1, output: "pre-push validation failed" },
  };

  expect(parseDesktopReply({ ok: false, error: failure }, "runGitCommand")).toEqual({
    ok: false,
    error: failure,
  });

  for (const git of [
    { exitCode: "1", output: "Failed" },
    { exitCode: 1, output: "x".repeat(16001) },
  ]) {
    expect(
      parseDesktopReply({ ok: false, error: { ...failure, git } }, "runGitCommand"),
    ).toMatchObject({ ok: false, error: { code: "unavailable" } });
  }
});
