import type { DiffLineAnnotation } from "@pierre/diffs";

import type { DiffAnnotationItem } from "@/features/source-control/types";
import type { PullRequestReviewThread } from "@/platform/desktop";

type PullRequestThreadFileMatchInput = {
  path: string;
  previousPath?: string | null;
  threadPath: string;
};

type BuildPullRequestThreadAnnotationsInput = {
  repoPath: string;
  pullRequestNumber: number;
  path: string;
  previousPath?: string | null;
  reviewThreads: PullRequestReviewThread[];
};

type CountPullRequestThreadsForFileInput = {
  path: string;
  previousPath?: string | null;
  reviewThreads: PullRequestReviewThread[];
};

function normalizePath(value: string | null | undefined) {
  return (value ?? "").trim().replace(/^\.\/+/, "");
}

export function pullRequestThreadBelongsToFile({
  path,
  previousPath,
  threadPath,
}: PullRequestThreadFileMatchInput) {
  const normalizedPath = normalizePath(path);
  const normalizedPreviousPath = normalizePath(previousPath);
  const normalizedThreadPath = normalizePath(threadPath);

  if (!normalizedPath || !normalizedThreadPath) {
    return false;
  }

  if (normalizedThreadPath === normalizedPath) {
    return true;
  }

  return Boolean(normalizedPreviousPath && normalizedThreadPath === normalizedPreviousPath);
}

function toAnnotationSide(diffSide: PullRequestReviewThread["diffSide"]) {
  return diffSide === "LEFT" ? "deletions" : "additions";
}

export function buildPullRequestThreadAnnotations({
  repoPath,
  pullRequestNumber,
  path,
  previousPath,
  reviewThreads,
}: BuildPullRequestThreadAnnotationsInput): DiffLineAnnotation<DiffAnnotationItem>[] {
  const annotations: DiffLineAnnotation<DiffAnnotationItem>[] = [];
  for (const thread of reviewThreads) {
    const lineNumber = thread.line ?? thread.startLine;
    if (!lineNumber || lineNumber <= 0) {
      continue;
    }

    if (!pullRequestThreadBelongsToFile({ path, previousPath, threadPath: thread.path })) {
      continue;
    }

    annotations.push({
      lineNumber,
      side: toAnnotationSide(thread.diffSide),
      metadata: {
        type: "pull-request-thread",
        thread,
        repoPath,
        pullRequestNumber,
      },
    });
  }

  return annotations;
}

export function countPullRequestThreadsForFile({
  path,
  previousPath,
  reviewThreads,
}: CountPullRequestThreadsForFileInput) {
  let count = 0;
  for (const thread of reviewThreads) {
    if (pullRequestThreadBelongsToFile({ path, previousPath, threadPath: thread.path })) {
      count += 1;
    }
  }

  return count;
}
