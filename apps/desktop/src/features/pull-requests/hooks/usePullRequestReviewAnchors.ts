import { useAppSelector } from "@/app/hooks";
import type { PullRequestReviewThread } from "@/platform/desktop";

import {
  buildPullRequestReviewAnchors,
  type PullRequestAnchorFile,
} from "@/features/pull-requests/utils/reviewAnchors";
import { getPendingReviewCommentsForContext } from "@/features/pull-requests/utils/pendingReviewComments";

export function usePullRequestReviewAnchors(args: {
  repoPath: string;
  compareBaseRef: string;
  compareHeadRef: string;
  files: PullRequestAnchorFile[];
  reviewThreads: PullRequestReviewThread[];
}) {
  const comments = useAppSelector((state) => state.comments);
  const pendingDrafts = getPendingReviewCommentsForContext(comments, args.repoPath, {
    kind: "review",
    baseRef: args.compareBaseRef,
    headRef: args.compareHeadRef,
  });

  return buildPullRequestReviewAnchors({
    files: args.files,
    reviewThreads: args.reviewThreads,
    pendingDrafts,
  });
}
