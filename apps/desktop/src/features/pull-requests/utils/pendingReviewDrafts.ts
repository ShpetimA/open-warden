import type { CommentItem } from "@/features/source-control/types";
import { formatRange } from "@/features/source-control/utils";

function normalizeCommentText(value: string) {
  return value
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ");
}

export function buildPendingReviewCommentsPayload(comments: CommentItem[]) {
  return comments
    .map((comment) => {
      const text = normalizeCommentText(comment.text);
      if (!text) {
        return "";
      }

      return `@${comment.filePath}#${formatRange(comment.startLine, comment.endLine)} - ${text}`;
    })
    .filter(Boolean)
    .join("\n");
}
