import { describe, expect, test } from "vitest";

import { getHistoryComparison } from "./historySelection";
import type { HistoryCommit } from "./types";

const commits: HistoryCommit[] = [
  { commitId: "new", shortId: "new", summary: "new", author: "", relativeTime: "" },
  { commitId: "old", shortId: "old", summary: "old", author: "", relativeTime: "" },
  { commitId: "root", shortId: "root", summary: "root", author: "", relativeTime: "" },
];

describe("getHistoryComparison", () => {
  test("compares the oldest selected commit parent to the newest selected commit", () => {
    expect(getHistoryComparison(commits, ["new", "old"])).toEqual({
      baseRef: "old^",
      headRef: "new",
      olderCommitId: "old",
      newerCommitId: "new",
    });
  });

  test("does not create a comparison until two known commits are selected", () => {
    expect(getHistoryComparison(commits, ["new"])).toBeNull();
    expect(getHistoryComparison(commits, ["new", "missing"])).toBeNull();
  });
});
