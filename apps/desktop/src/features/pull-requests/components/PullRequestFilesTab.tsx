import { skipToken } from "@reduxjs/toolkit/query";

import { useAppSelector } from "@/app/hooks";
import { useGetBranchFilesQuery } from "@/features/source-control/api";
import {
  ReviewFileList,
  ReviewSelectionSync,
} from "@/features/source-control/components/ReviewFileList";
import { usePrefetchReviewDiffs } from "@/features/source-control/hooks/usePrefetchNearbyDiffs";
import type { FileItem } from "@/features/source-control/types";

type PullRequestFilesPrefetcherProps = {
  branchFiles: FileItem[];
  activeRepo: string;
  reviewBaseRef: string;
  reviewHeadRef: string;
};

function PullRequestFilesPrefetcher({
  branchFiles,
  activeRepo,
  reviewBaseRef,
  reviewHeadRef,
}: PullRequestFilesPrefetcherProps) {
  const reviewActivePath = useAppSelector((state) => state.sourceControl.reviewActivePath);

  usePrefetchReviewDiffs(branchFiles, activeRepo, reviewBaseRef, reviewHeadRef, reviewActivePath);

  return null;
}

type PullRequestFilesTabProps = {
  activeRepo: string;
  reviewBaseRef: string;
  reviewHeadRef: string;
};

export function PullRequestFilesTab({
  activeRepo,
  reviewBaseRef,
  reviewHeadRef,
}: PullRequestFilesTabProps) {
  const { data: branchFiles = [], isLoading: isLoadingBranchFiles } = useGetBranchFilesQuery(
    activeRepo && reviewBaseRef && reviewHeadRef
      ? { repoPath: activeRepo, baseRef: reviewBaseRef, headRef: reviewHeadRef }
      : skipToken,
    {
      refetchOnFocus: true,
      refetchOnReconnect: true,
      selectFromResult: ({ data, isLoading }) => ({
        data: data ?? [],
        isLoading,
      }),
    },
  );
  const readyForDiff = Boolean(activeRepo && reviewBaseRef && reviewHeadRef);

  return (
    <div className="bg-surface-toolbar flex min-h-0 h-full flex-1 flex-col overflow-hidden">
      <div className="border-border border-b px-3 py-2.5">
        <div className="text-foreground/80 text-[11px] font-semibold tracking-[0.14em]">
          CHANGED FILES
        </div>
        <div className="text-muted-foreground mt-1 flex items-center gap-1 text-xs">
          <span>{branchFiles.length}</span>
          <span>{branchFiles.length === 1 ? "file" : "files"}</span>
        </div>
      </div>

      <PullRequestFilesPrefetcher
        branchFiles={branchFiles}
        activeRepo={activeRepo}
        reviewBaseRef={reviewBaseRef}
        reviewHeadRef={reviewHeadRef}
      />

      <ReviewSelectionSync
        readyForDiff={readyForDiff}
        branchFiles={branchFiles}
        hasBranchFilesData={!isLoadingBranchFiles}
      />

      <div className="min-h-0 flex-1 overflow-hidden">
        {isLoadingBranchFiles ? (
          <div className="text-muted-foreground px-2 py-2 text-xs">Loading changed files...</div>
        ) : branchFiles.length === 0 ? (
          <div className="text-muted-foreground px-2 py-2 text-xs">No changed files.</div>
        ) : (
          <ReviewFileList
            title="CHANGED FILES"
            subtitle={
              <span className="flex items-center gap-1">
                <span>{branchFiles.length}</span>
                <span>{branchFiles.length === 1 ? "file" : "files"}</span>
              </span>
            }
            branchFiles={branchFiles}
            activeRepo={activeRepo}
            reviewBaseRef={reviewBaseRef}
            reviewHeadRef={reviewHeadRef}
            paneClassName="border-0 bg-transparent"
            headerClassName="hidden"
            bodyClassName="space-y-0.5 p-0.5"
            scrollAreaClassName="min-h-0 flex-1 overflow-hidden"
          />
        )}
      </div>
    </div>
  );
}
