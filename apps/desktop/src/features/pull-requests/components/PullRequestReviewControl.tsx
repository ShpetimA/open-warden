import { usePullRequestRefresh } from "../refresh/PullRequestRefreshProvider";
import { skipToken } from "@reduxjs/toolkit/query";
import { ClipboardCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useCommandComposerLauncher } from "@/features/command-palette/CommandComposerLauncher";
import {
  useGetPullRequestConversationQuery,
  useResolveHostedRepoQuery,
} from "@/features/hosted-repos/api";
import { pullRequestSummaryFromDetail } from "@/features/pull-requests/utils/pullRequestSummary";

export function PullRequestReviewButton({
  loading = false,
  disabledReason,
  onReview,
}: {
  loading?: boolean;
  disabledReason?: string;
  onReview: () => void;
}) {
  return (
    <Button
      size="xs"
      variant="outline"
      aria-label="Review pull request"
      aria-description={disabledReason}
      disabled={loading || Boolean(disabledReason)}
      title={disabledReason ?? "Approve, request changes, or leave a review comment"}
      onClick={onReview}
    >
      {loading ? (
        <Spinner aria-hidden="true" className="motion-reduce:animate-none" />
      ) : (
        <ClipboardCheck aria-hidden="true" />
      )}
      Finish review
    </Button>
  );
}

export function PullRequestReviewControl({
  repoPath,
  pullRequestNumber,
}: {
  repoPath: string;
  pullRequestNumber: number;
}) {
  const openComposer = useCommandComposerLauncher();
  const locator = repoPath && pullRequestNumber > 0 ? { repoPath, pullRequestNumber } : skipToken;
  const refresh = usePullRequestRefresh(locator === skipToken ? null : locator);
  const { detail, loadingDetail } = useGetPullRequestConversationQuery(locator, {
    selectFromResult: ({ currentData, isFetching }) => ({
      detail: currentData?.detail,
      loadingDetail: isFetching && !currentData,
    }),
  });
  const { hostedRepo, loadingRepository } = useResolveHostedRepoQuery(repoPath, {
    skip: !repoPath,
    selectFromResult: ({ currentData, isFetching }) => ({
      hostedRepo: currentData,
      loadingRepository: isFetching && !currentData,
    }),
  });
  let disabledReason: string | undefined;
  if (!detail || !hostedRepo) disabledReason = "Load the pull request before reviewing it";
  else if (refresh.revisionPending)
    disabledReason = "Wait for the current PR revision to finish loading";
  else if (detail.state !== "open") disabledReason = "Only open pull requests can be reviewed";
  else if (detail.isDraft) disabledReason = "Mark this pull request ready for review first";
  else if (detail.providerId !== "github" && detail.providerId !== "bitbucket")
    disabledReason = "Reviews are supported for GitHub and Bitbucket";

  return (
    <PullRequestReviewButton
      loading={loadingDetail || loadingRepository}
      disabledReason={disabledReason}
      onReview={() => {
        if (!detail || !hostedRepo || disabledReason) return;
        openComposer("submit-review", pullRequestSummaryFromDetail(detail, hostedRepo));
      }}
    />
  );
}
