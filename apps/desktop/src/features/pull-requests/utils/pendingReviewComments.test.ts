import { describe, expect, it } from "vitest";

import type { CommentItem } from "@/features/source-control/types";
import {
  buildSubmitPullRequestReviewCommentsInput,
  getPendingReviewCommentsForContext,
  toPullRequestReviewDraftCommentInput,
} from "./pendingReviewComments";

function createComment(overrides: Partial<CommentItem> = {}): CommentItem {
  return {
    type: "annotation",
    id: overrides.id ?? "comment-1",
    repoPath: overrides.repoPath ?? "/repo/a",
    filePath: overrides.filePath ?? "src/file.ts",
    bucket: overrides.bucket ?? "unstaged",
    startLine: overrides.startLine ?? 4,
    endLine: overrides.endLine ?? 4,
    side: overrides.side ?? "additions",
    endSide: overrides.endSide,
    text: overrides.text ?? "comment text",
    contextKind: overrides.contextKind ?? "review",
    baseRef: overrides.baseRef ?? "main",
    headRef: overrides.headRef ?? "feature",
  };
}

describe("pendingReviewComments", () => {
  it("filters pending comments by repo and review context", () => {
    const comments = [
      createComment({ id: "c1" }),
      createComment({ id: "c2", headRef: "other-feature" }),
      createComment({ id: "c3", repoPath: "/repo/b" }),
      createComment({ id: "c4", contextKind: "changes", baseRef: undefined, headRef: undefined }),
    ];

    expect(
      getPendingReviewCommentsForContext(comments, "/repo/a", {
        kind: "review",
        baseRef: "main",
        headRef: "feature",
      }).map((comment) => comment.id),
    ).toEqual(["c1"]);
  });

  it("maps a multi-line comment into a pull request review draft payload", () => {
    expect(
      toPullRequestReviewDraftCommentInput(
        createComment({
          id: "c1",
          filePath: "src/example.ts",
          text: "needs work",
          startLine: 10,
          endLine: 12,
          side: "deletions",
          endSide: "additions",
        }),
      ),
    ).toEqual({
      draftId: "c1",
      path: "src/example.ts",
      body: "needs work",
      line: 12,
      side: "RIGHT",
      startLine: 10,
      startSide: "LEFT",
    });
  });

  it("builds a submit payload for all pending comments", () => {
    const comments = [
      createComment({ id: "c1" }),
      createComment({ id: "c2", startLine: 8, endLine: 8 }),
    ];

    expect(
      buildSubmitPullRequestReviewCommentsInput({
        repoPath: "/repo/a",
        pullRequestNumber: 42,
        comments,
      }),
    ).toEqual({
      repoPath: "/repo/a",
      pullRequestNumber: 42,
      comments: [
        {
          draftId: "c1",
          path: "src/file.ts",
          body: "comment text",
          line: 4,
          side: "RIGHT",
          startLine: null,
          startSide: null,
        },
        {
          draftId: "c2",
          path: "src/file.ts",
          body: "comment text",
          line: 8,
          side: "RIGHT",
          startLine: null,
          startSide: null,
        },
      ],
    });
  });
});
