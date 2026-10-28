import { describe, expect, it } from "vitest";

import {
  areCommentCountMapsEqual,
  selectChangesCommentCountByPathForRepo,
  selectReviewCommentCountsForRepo,
} from "@/features/comments/selectors";
import type { CommentItem } from "@/features/source-control/types";

function createComment(overrides: Partial<CommentItem> = {}): CommentItem {
  return {
    type: "annotation",
    id: overrides.id ?? "comment-1",
    repoPath: overrides.repoPath ?? "/repo/a",
    filePath: overrides.filePath ?? "src/file.ts",
    bucket: overrides.bucket ?? "unstaged",
    startLine: overrides.startLine ?? 1,
    endLine: overrides.endLine ?? 1,
    side: overrides.side ?? "additions",
    endSide: overrides.endSide,
    text: overrides.text ?? "comment text",
    contextKind: overrides.contextKind,
    baseRef: overrides.baseRef,
    headRef: overrides.headRef,
    commitId: overrides.commitId,
  };
}

describe("selectChangesCommentCountByPathForRepo", () => {
  it("indexes only changes comments for the selected repository", () => {
    const state = {
      comments: [
        createComment({ id: "one" }),
        createComment({ id: "two" }),
        createComment({ id: "review", contextKind: "review" }),
        createComment({ id: "other", repoPath: "/repo/b" }),
        createComment({ id: "nested", filePath: "src/nested.ts", contextKind: "changes" }),
      ],
    };

    const counts = selectChangesCommentCountByPathForRepo(state, "/repo/a");

    expect([...counts]).toEqual([
      ["src/file.ts", 2],
      ["src/nested.ts", 1],
    ]);
    expect(selectChangesCommentCountByPathForRepo(state, "/repo/a")).toBe(counts);
  });
});

describe("areCommentCountMapsEqual", () => {
  it("compares comment counts by path instead of map identity", () => {
    expect(
      areCommentCountMapsEqual(
        new Map([
          ["src/a.ts", 2],
          ["src/b.ts", 1],
        ]),
        new Map([
          ["src/a.ts", 2],
          ["src/b.ts", 1],
        ]),
      ),
    ).toBe(true);
    expect(areCommentCountMapsEqual(new Map([["src/a.ts", 2]]), new Map([["src/a.ts", 1]]))).toBe(
      false,
    );
  });
});

it("indexes review comments by repository and comparison refs and retains counts on selection changes", () => {
  const comments = [
    createComment({ id: "matching", contextKind: "review", baseRef: "main", headRef: "feature" }),
    createComment({
      id: "other-repo",
      repoPath: "/repo/b",
      contextKind: "review",
      baseRef: "main",
      headRef: "feature",
    }),
    createComment({ id: "other-base", contextKind: "review", baseRef: "dev", headRef: "feature" }),
    createComment({ id: "other-head", contextKind: "review", baseRef: "main", headRef: "other" }),
    createComment({ id: "changes", contextKind: "changes" }),
  ];
  const counts = selectReviewCommentCountsForRepo({ comments }, "/repo/a", "main", "feature");
  expect([...counts]).toEqual([["src/file.ts", 1]]);
  expect(selectReviewCommentCountsForRepo({ comments }, "/repo/a", "main", "feature")).toBe(counts);
  expect([...selectReviewCommentCountsForRepo({ comments }, "/repo/a", "main", "other")]).toEqual([
    ["src/file.ts", 1],
  ]);
});
