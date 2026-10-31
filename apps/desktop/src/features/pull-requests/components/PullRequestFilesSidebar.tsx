import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { refreshActiveRepo } from "@/features/source-control/actions";
import { useGetGitSnapshotQuery } from "@/features/source-control/api";
import CurrentRepositoryHeader from "@/features/source-control/components/CurrentRepoHeader";
import {
  ReviewFileList,
  ReviewSelectionSync,
} from "@/features/source-control/components/ReviewFileList";
import type { FileItem } from "@/features/source-control/types";
import type { PullRequestReviewSession } from "@/features/pull-requests/pullRequestsSlice";
import type { PullRequestReviewThread } from "@/platform/desktop";
import { PullRequestSidebarSummary } from "@/features/pull-requests/components/PullRequestSidebarSummary";

type PullRequestFilesSidebarProps = {
  activeRepo: string;
  review: PullRequestReviewSession;
  readyForDiff: boolean;
  branchFiles: FileItem[];
  hasBranchFilesData: boolean;
  isLoadingBranchFiles: boolean;
  filesError: string;
  filesFailure?: unknown;
  onRetry?: () => void;
  reviewThreads?: PullRequestReviewThread[];
};

export function PullRequestFilesSidebar({
  activeRepo,
  review,
  readyForDiff,
  branchFiles,
  hasBranchFilesData,
  isLoadingBranchFiles,
  filesError,
  filesFailure,
  onRetry,
  reviewThreads = [],
}: PullRequestFilesSidebarProps) {
  const dispatch = useAppDispatch();
  const runningAction = useAppSelector((state) => state.sourceControl.runningAction);
  const { activeBranch } = useGetGitSnapshotQuery(activeRepo, {
    skip: !activeRepo,
    selectFromResult: ({ data }) => ({
      activeBranch: data?.branch ?? "",
    }),
  });

  return (
    <aside className="bg-surface-toolbar border-border/70 flex h-full min-h-0 overflow-hidden overflow-x-hidden border-r">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <CurrentRepositoryHeader
          activeRepo={activeRepo}
          activeBranch={activeBranch}
          runningAction={runningAction}
          onRefresh={() => {
            void dispatch(refreshActiveRepo());
          }}
        />

        <PullRequestSidebarSummary review={review} />

        <ReviewSelectionSync
          readyForDiff={readyForDiff}
          branchFiles={branchFiles}
          hasBranchFilesData={hasBranchFilesData}
        />

        <div className="min-h-0 flex-1 overflow-hidden">
          <ReviewFileList
            title="CHANGED FILES"
            branchFiles={branchFiles}
            activeRepo={activeRepo}
            reviewBaseRef={review.compareBaseRef}
            reviewHeadRef={review.compareHeadRef}
            isLoading={isLoadingBranchFiles}
            error={filesFailure ?? (filesError || undefined)}
            hasData={hasBranchFilesData}
            onRetry={onRetry}
            paneClassName="border-0 bg-transparent"
            reviewThreads={reviewThreads}
          />
        </div>
      </div>
    </aside>
  );
}
