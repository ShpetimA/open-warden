import { toast } from "sonner";

import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { removeCommentsByIds } from "@/features/comments/commentsSlice";
import { useSubmitPullRequestReviewCommentsMutation } from "@/features/hosted-repos/api";
import { buildPendingReviewCommentsPayload } from "@/features/pull-requests/utils/pendingReviewDrafts";
import {
  buildSubmitPullRequestReviewCommentsInput,
  getPendingReviewCommentsForContext,
} from "@/features/pull-requests/utils/pendingReviewComments";
import { errorMessageFrom } from "@/features/source-control/shared-utils/errorMessage";
import type { PullRequestReviewAnchor } from "@/features/source-control/types";

export function usePullRequestPendingReviewActions(args: {
  repoPath: string;
  pullRequestNumber: number;
  compareBaseRef: string;
  compareHeadRef: string;
}) {
  const dispatch = useAppDispatch();
  const comments = useAppSelector((state) => state.comments);
  const pendingDrafts = getPendingReviewCommentsForContext(comments, args.repoPath, {
    kind: "review",
    baseRef: args.compareBaseRef,
    headRef: args.compareHeadRef,
  });
  const [submitPullRequestReviewComments, { isLoading: isSubmittingReviewComments }] =
    useSubmitPullRequestReviewCommentsMutation();

  const pendingDraftCount = pendingDrafts.length;
  const allPendingPayload = buildPendingReviewCommentsPayload(pendingDrafts);

  async function copyPendingDrafts(source: typeof pendingDrafts) {
    const payload = buildPendingReviewCommentsPayload(source);
    if (!payload) {
      return false;
    }

    try {
      await navigator.clipboard.writeText(payload);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to copy pending comments");
      return false;
    }
  }

  function clearPendingDrafts(source: typeof pendingDrafts) {
    if (source.length === 0) {
      return;
    }

    dispatch(removeCommentsByIds(source.map((comment) => comment.id)));
  }

  async function publishPendingDrafts(source: typeof pendingDrafts) {
    if (!args.repoPath || args.pullRequestNumber <= 0 || source.length === 0) {
      return;
    }

    try {
      const result = await submitPullRequestReviewComments(
        buildSubmitPullRequestReviewCommentsInput({
          repoPath: args.repoPath,
          pullRequestNumber: args.pullRequestNumber,
          comments: source,
        }),
      ).unwrap();

      if (result.submittedDraftIds.length > 0) {
        dispatch(removeCommentsByIds(result.submittedDraftIds));
      }

      if (result.failedMessage) {
        toast.error(result.failedMessage);
      }
    } catch (error) {
      toast.error(errorMessageFrom(error, "Failed to publish review comments"));
    }
  }

  return {
    pendingDrafts,
    pendingDraftCount,
    allPendingPayload,
    isSubmittingReviewComments,
    getPendingDraftsForFile(path: string) {
      return pendingDrafts.filter((draft) => draft.filePath === path);
    },
    getPendingPayloadForFile(path: string) {
      return buildPendingReviewCommentsPayload(
        pendingDrafts.filter((draft) => draft.filePath === path),
      );
    },
    async copyAllPendingDrafts() {
      return copyPendingDrafts(pendingDrafts);
    },
    async copyAnchorPendingDrafts(anchor: PullRequestReviewAnchor) {
      return copyPendingDrafts(anchor.pendingDrafts);
    },
    clearAllPendingDrafts() {
      clearPendingDrafts(pendingDrafts);
    },
    clearAnchorPendingDrafts(anchor: PullRequestReviewAnchor) {
      clearPendingDrafts(anchor.pendingDrafts);
    },
    async publishAllPendingDrafts() {
      await publishPendingDrafts(pendingDrafts);
    },
    async publishAnchorPendingDrafts(anchor: PullRequestReviewAnchor) {
      await publishPendingDrafts(anchor.pendingDrafts);
    },
  };
}
