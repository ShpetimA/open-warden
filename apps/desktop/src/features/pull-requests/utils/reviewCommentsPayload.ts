import type { PullRequestReviewThread } from "@/platform/desktop";
import { pullRequestThreadBelongsToFile } from "@/features/pull-requests/utils/reviewThreadAnnotations";

type BuildReviewCommentsPayloadInput = {
  reviewThreads: PullRequestReviewThread[];
  path?: string;
  previousPath?: string | null;
};

function normalizeCommentText(value: string) {
  return value
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ");
}

function toRangeLabel(startLine: number | null, endLine: number | null) {
  const start = startLine && startLine > 0 ? startLine : null;
  const end = endLine && endLine > 0 ? endLine : null;

  if (start && end) {
    const min = Math.min(start, end);
    const max = Math.max(start, end);
    return `${String(min)}-${String(max)}`;
  }

  if (start) {
    return `${String(start)}-${String(start)}`;
  }

  if (end) {
    return `${String(end)}-${String(end)}`;
  }

  return "unknown-unknown";
}

function lineBoundsForComment(
  thread: PullRequestReviewThread,
  comment: PullRequestReviewThread["comments"][number],
) {
  const startLine = comment.startLine ?? thread.startLine ?? comment.line ?? thread.line ?? null;
  const endLine = comment.line ?? thread.line ?? comment.startLine ?? thread.startLine ?? null;
  return { startLine, endLine };
}

export function buildPullRequestReviewCommentsPayload({
  reviewThreads,
  path,
  previousPath,
}: BuildReviewCommentsPayloadInput) {
  const lines: string[] = [];

  for (const thread of reviewThreads) {
    if (
      path &&
      !pullRequestThreadBelongsToFile({
        path,
        previousPath,
        threadPath: thread.path,
      })
    ) {
      continue;
    }

    for (const comment of thread.comments) {
      const text = normalizeCommentText(comment.body);
      if (!text) {
        continue;
      }

      const commentPath = comment.path?.trim() || thread.path || path || "unknown";
      const { startLine, endLine } = lineBoundsForComment(thread, comment);
      const rangeLabel = toRangeLabel(startLine, endLine);
      lines.push(`@${commentPath}#${rangeLabel} - ${text}`);
    }
  }

  return lines.join("\n");
}
