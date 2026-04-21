import { ShieldCheck } from "lucide-react";

import { PullRequestRouteHeader } from "@/features/pull-requests/components/PullRequestRouteHeader";
import {
  InactivePullRequestReviewPlaceholder,
  PullRequestReviewPlaceholder,
  usePullRequestReviewSession,
} from "./PullRequestReviewShared";

export function PullRequestReviewChecksScreen() {
  const { resolvedReview } = usePullRequestReviewSession();

  if (!resolvedReview) {
    return <InactivePullRequestReviewPlaceholder />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PullRequestRouteHeader review={resolvedReview} />
      <div className="min-h-0 flex-1">
        <PullRequestReviewPlaceholder
          icon={ShieldCheck}
          title="Checks are next"
          description="Status checks and CI summaries will live here once the provider review shell is expanded."
        />
      </div>
    </div>
  );
}
