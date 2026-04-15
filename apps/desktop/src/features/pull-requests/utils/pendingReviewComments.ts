import type {
  PullRequestReviewDraftCommentInput,
  SubmitPullRequestReviewCommentsInput,
} from "@/platform/desktop";
import type { CommentContext, CommentItem } from "@/features/source-control/types";

function isMatchingReviewContext(comment: CommentItem, context: CommentContext) {
  if (context.kind !== "review") {
    return false;
  }

  return (
    (comment.contextKind ?? "changes") === "review" &&
    comment.baseRef === context.baseRef &&
    comment.headRef === context.headRef
  );
}

function toDiffSide(side: CommentItem["side"]) {
  return side === "deletions" ? "LEFT" : "RIGHT";
}

function isMultiLineComment(comment: CommentItem) {
  return comment.startLine !== comment.endLine || (comment.endSide ?? comment.side) !== comment.side;
}

export function getPendingReviewCommentsForContext(
  comments: CommentItem[],
  repoPath: string,
  context: CommentContext,
) {
  if (!repoPath || context.kind !== "review") {
    return [];
  }

  return comments.filter(
    (comment) => comment.repoPath === repoPath && isMatchingReviewContext(comment, context),
  );
}

export function toPullRequestReviewDraftCommentInput(
  comment: CommentItem,
): PullRequestReviewDraftCommentInput {
  const endSide = comment.endSide ?? comment.side;
  const multiLine = isMultiLineComment(comment);

  return {
    draftId: comment.id,
    path: comment.filePath,
    body: comment.text,
    line: comment.endLine,
    side: toDiffSide(endSide),
    startLine: multiLine ? comment.startLine : null,
    startSide: multiLine ? toDiffSide(comment.side) : null,
  };
}

export function buildSubmitPullRequestReviewCommentsInput(args: {
  repoPath: string;
  pullRequestNumber: number;
  comments: CommentItem[];
}): SubmitPullRequestReviewCommentsInput {
  return {
    repoPath: args.repoPath,
    pullRequestNumber: args.pullRequestNumber,
    comments: args.comments.map(toPullRequestReviewDraftCommentInput),
  };
}
