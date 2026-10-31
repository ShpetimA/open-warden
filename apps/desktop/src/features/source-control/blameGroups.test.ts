import { describe, expect, it } from "vitest";
import type { GitBlameLine } from "@/platform/desktop";
import { groupBlameLines } from "./blameGroups";

function line(number: number, commitId: string): GitBlameLine {
  return { line: number, commitId, author: "Alice", authoredAt: null, summary: "Update invoice" };
}

describe("blame attribution groups", () => {
  it("combines consecutive lines from a commit without merging separate occurrences", () => {
    const groups = groupBlameLines([line(1, "a"), line(2, "a"), line(3, "b"), line(4, "a")]);
    expect(groups.map(({ line, endLine, commitId }) => ({ line, endLine, commitId }))).toEqual([
      { line: 1, endLine: 2, commitId: "a" },
      { line: 3, endLine: 3, commitId: "b" },
      { line: 4, endLine: 4, commitId: "a" },
    ]);
  });

  it("keeps gaps separate and retains uncommitted attribution", () => {
    const workingTree = "0".repeat(40);
    const groups = groupBlameLines([
      line(1, "a"),
      line(3, "a"),
      line(4, workingTree),
      line(5, workingTree),
    ]);
    expect(groups.map(({ line, endLine, commitId }) => [line, endLine, commitId])).toEqual([
      [1, 1, "a"],
      [3, 3, "a"],
      [4, 5, workingTree],
    ]);
    expect(groupBlameLines([])).toEqual([]);
  });
});
