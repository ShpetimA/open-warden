import { createSelector } from "@reduxjs/toolkit";

import type { CommentContext, CommentItem } from "@/features/source-control/types";

type CommentsStateContainer = {
  comments: Array<CommentItem | undefined>;
};

const CHANGES_COMMENT_CONTEXT = { kind: "changes" } as const;

function fileKey(repoPath: string, filePath: string): string {
  return `${repoPath}::${filePath}`;
}

export function compactComments(comments: Array<CommentItem | undefined>): CommentItem[] {
  return comments.filter((comment): comment is CommentItem => !!comment);
}

export function createCommentCountByFile(
  comments: Array<CommentItem | undefined>,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const comment of comments) {
    if (!comment) continue;
    const key = fileKey(comment.repoPath, comment.filePath);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export function createCommentCountByPathForRepo(
  comments: Array<CommentItem | undefined>,
  repoPath: string,
  context?: CommentContext,
): Map<string, number> {
  const counts = new Map<string, number>();
  if (!repoPath) return counts;

  for (const comment of comments) {
    if (!comment || comment.repoPath !== repoPath) continue;
    if (!commentMatchesContext(comment, context)) continue;
    counts.set(comment.filePath, (counts.get(comment.filePath) ?? 0) + 1);
  }

  return counts;
}

export const selectChangesCommentCountByPathForRepo: (
  state: CommentsStateContainer,
  repoPath: string,
) => Map<string, number> = createSelector(
  [
    (state: CommentsStateContainer) => state.comments,
    (_state: CommentsStateContainer, repoPath: string) => repoPath,
  ],
  (comments, repoPath) =>
    createCommentCountByPathForRepo(comments, repoPath, CHANGES_COMMENT_CONTEXT),
);

export const selectReviewCommentCountsForRepo = createSelector(
  [
    (state: CommentsStateContainer) => state.comments,
    (_state: CommentsStateContainer, repoPath: string) => repoPath,
    (_state: CommentsStateContainer, _repoPath: string, baseRef: string) => baseRef,
    (_state: CommentsStateContainer, _repoPath: string, _baseRef: string, headRef: string) =>
      headRef,
  ],
  (comments, repoPath, baseRef, headRef) =>
    createCommentCountByPathForRepo(comments, repoPath, { kind: "review", baseRef, headRef }),
);

export function areCommentCountMapsEqual(
  left: ReadonlyMap<string, number>,
  right: ReadonlyMap<string, number>,
): boolean {
  if (left.size !== right.size) {
    return false;
  }

  for (const [path, count] of left) {
    if (right.get(path) !== count) {
      return false;
    }
  }

  return true;
}

export function countCommentsForRepoContext(
  comments: Array<CommentItem | undefined>,
  repoPath: string,
  context?: CommentContext,
): number {
  if (!repoPath) return 0;

  let count = 0;
  for (const comment of comments) {
    if (!comment || comment.repoPath !== repoPath) continue;
    if (!commentMatchesContext(comment, context)) continue;
    count += 1;
  }

  return count;
}

export function countCommentsForPathInRepoContext(
  comments: Array<CommentItem | undefined>,
  repoPath: string,
  filePath: string,
  context?: CommentContext,
): number {
  if (!repoPath || !filePath) return 0;

  let count = 0;
  for (const comment of comments) {
    if (!comment || comment.repoPath !== repoPath || comment.filePath !== filePath) continue;
    if (!commentMatchesContext(comment, context)) continue;
    count += 1;
  }

  return count;
}

export function countCommentsForFile(
  comments: Array<CommentItem | undefined>,
  repoPath: string,
  filePath: string,
): number {
  let count = 0;
  for (const comment of comments) {
    if (!comment) continue;
    if (comment.repoPath === repoPath && comment.filePath === filePath) {
      count += 1;
    }
  }
  return count;
}

export function getCommentCountForFile(
  counts: Map<string, number>,
  repoPath: string,
  filePath: string,
): number {
  return counts.get(fileKey(repoPath, filePath)) ?? 0;
}

function commentMatchesContext(comment: CommentItem, context?: CommentContext): boolean {
  if (!context) return true;
  const kind = comment.contextKind ?? "changes";
  if (kind !== context.kind) return false;
  if (context.kind === "review") {
    return comment.baseRef === context.baseRef && comment.headRef === context.headRef;
  }
  if (context.kind === "history") {
    return comment.commitId === context.commitId;
  }
  if (context.kind === "history-range") {
    return comment.baseRef === context.baseRef && comment.headRef === context.headRef;
  }
  return true;
}
