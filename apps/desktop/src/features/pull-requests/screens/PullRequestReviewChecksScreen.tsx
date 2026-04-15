import { ShieldCheck } from "lucide-react";

import {
  InactivePullRequestReviewPlaceholder,
  PullRequestReviewFrame,
  PullRequestReviewPlaceholder,
  usePullRequestReviewSession,
} from "./PullRequestReviewShared";

export function PullRequestReviewChecksScreen() {
  const { resolvedReview } = usePullRequestReviewSession();

  if (!resolvedReview) {
    return <InactivePullRequestReviewPlaceholder />;
  }

  return (
    <PullRequestReviewFrame review={resolvedReview}>
      <PullRequestReviewPlaceholder
        icon={ShieldCheck}
        title="Checks are next"
        description="Status checks and CI summaries will live here once the provider review shell is expanded."
      />
    </PullRequestReviewFrame>
  );
}
