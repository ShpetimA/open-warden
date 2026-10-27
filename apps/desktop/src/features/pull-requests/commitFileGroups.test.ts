import { expect, test } from "vitest";
import { buildCommitGroupFiles } from "./commitFileGroups";

test("keeps repeated file changes distinct even when commit titles match and contain slashes", () => {
  const files = [{ path: "src/invoice.ts", previousPath: null, status: "modified" as const }];
  const commit = {
    commitId: "first",
    shortId: "first",
    summary: "Fix invoice/export",
    author: "Alice",
    relativeTime: "1 hour ago",
  };
  const entries = buildCommitGroupFiles([
    { commit, files },
    { commit: { ...commit, commitId: "second", shortId: "second" }, files },
  ]);

  expect(new Set(entries.map((entry) => entry.path)).size).toBe(2);
  expect(entries.map((entry) => entry.realPath)).toEqual(["src/invoice.ts", "src/invoice.ts"]);
  expect(entries.map((entry) => entry.commit.commitId)).toEqual(["first", "second"]);
  expect(entries[0]?.path.split("/")[0]).toBe("Fix invoice∕export · first");
});
