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
import { PullRequestSidebarSummary } from "@/features/pull-requests/components/PullRequestSidebarSummary";

type PullRequestFilesSidebarProps = {
  activeRepo: string;
  review: PullRequestReviewSession;
  readyForDiff: boolean;
  branchFiles: FileItem[];
  hasBranchFilesData: boolean;
  isLoadingBranchFiles: boolean;
};

export function PullRequestFilesSidebar({
  activeRepo,
  review,
  readyForDiff,
  branchFiles,
  hasBranchFilesData,
  isLoadingBranchFiles,
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

        <div className="border-border border-b px-3 py-2.5">
          <div className="text-foreground/80 text-[11px] font-semibold tracking-[0.14em]">
            CHANGED FILES
          </div>
          <div className="text-muted-foreground mt-1 flex items-center gap-1 text-xs">
            <span>{branchFiles.length}</span>
            <span>{branchFiles.length === 1 ? "file" : "files"}</span>
          </div>
        </div>

        <ReviewSelectionSync
          readyForDiff={readyForDiff}
          branchFiles={branchFiles}
          hasBranchFilesData={hasBranchFilesData}
        />

        <div className="min-h-0 flex-1 overflow-hidden">
          {isLoadingBranchFiles ? (
            <div className="text-muted-foreground px-2 py-2 text-xs">Loading changed files...</div>
          ) : branchFiles.length === 0 ? (
            <div className="text-muted-foreground px-2 py-2 text-xs">No changed files.</div>
          ) : (
            <ReviewFileList
              title="CHANGED FILES"
              branchFiles={branchFiles}
              activeRepo={activeRepo}
              reviewBaseRef={review.compareBaseRef}
              reviewHeadRef={review.compareHeadRef}
              paneClassName="border-0 bg-transparent"
              headerClassName="hidden"
              bodyClassName="space-y-0.5 p-0.5"
              scrollAreaClassName="min-h-0 flex-1 overflow-hidden"
            />
          )}
        </div>
      </div>
    </aside>
  );
}
