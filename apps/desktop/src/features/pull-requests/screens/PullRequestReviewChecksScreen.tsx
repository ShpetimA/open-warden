import { PullRequestChecksPanel } from "@/features/pull-requests/components/PullRequestChecksPanel";
import { PullRequestRouteHeader } from "@/features/pull-requests/components/PullRequestRouteHeader";
import {
  InactivePullRequestReviewPlaceholder,
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
      <div className="min-h-0 flex-1 overflow-auto">
        <PullRequestChecksPanel
          repoPath={resolvedReview.repoPath}
          pullRequestNumber={resolvedReview.pullRequestNumber}
        />
      </div>
    </div>
  );
}
