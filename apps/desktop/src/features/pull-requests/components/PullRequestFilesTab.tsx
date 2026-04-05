import { useEffect } from "react";
import { skipToken } from "@reduxjs/toolkit/query";

import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { countCommentsForPathInRepoContext } from "@/features/comments/selectors";
import { useGetBranchFilesQuery } from "@/features/source-control/api";
import { FileListRow } from "@/features/source-control/components/FileListRow";
import { SourceControlFileBrowser } from "@/features/source-control/components/SourceControlFileBrowser";
import { usePrefetchReviewDiffs } from "@/features/source-control/hooks/usePrefetchNearbyDiffs";
import { useReviewKeyboardNav } from "@/features/source-control/hooks/useReviewKeyboardNav";
import { setReviewActivePath } from "@/features/source-control/sourceControlSlice";
import type { FileItem } from "@/features/source-control/types";

function ReviewSelectionSync({
  readyForDiff,
  branchFiles,
  hasBranchFilesData,
}: {
  readyForDiff: boolean;
  branchFiles: FileItem[];
  hasBranchFilesData: boolean;
}) {
  const dispatch = useAppDispatch();
  const reviewActivePath = useAppSelector((state) => state.sourceControl.reviewActivePath);

  useEffect(() => {
    if (!readyForDiff) {
      if (reviewActivePath) {
        dispatch(setReviewActivePath(""));
      }
      return;
    }

    if (!hasBranchFilesData) {
      return;
    }

    if (branchFiles.length === 0) {
      if (reviewActivePath) {
        dispatch(setReviewActivePath(""));
      }
      return;
    }

    const existing = branchFiles.find((file) => file.path === reviewActivePath);
    if (!existing) {
      dispatch(setReviewActivePath(branchFiles[0].path));
    }
  }, [branchFiles, dispatch, hasBranchFilesData, readyForDiff, reviewActivePath]);

  return null;
}

type PullRequestFilesTabProps = {
  activeRepo: string;
  reviewBaseRef: string;
  reviewHeadRef: string;
};

type PullRequestReviewFileListProps = {
  branchFiles: FileItem[];
  activeRepo: string;
  reviewBaseRef: string;
  reviewHeadRef: string;
};

function PullRequestReviewFileList({
  branchFiles,
  activeRepo,
  reviewBaseRef,
  reviewHeadRef,
}: PullRequestReviewFileListProps) {
  const fileBrowserMode = useAppSelector(
    (state) => state.settings.appSettings.sourceControl.fileTreeRenderMode,
  );

  useReviewKeyboardNav();

  return (
    <div data-nav-region="review-files" className="h-full overflow-auto">
      <SourceControlFileBrowser
        files={branchFiles}
        mode={fileBrowserMode}
        className="space-y-0.5 p-0.5"
        renderFile={({ depth, file, mode, name, navIndex }) => (
          <PullRequestReviewFileRow
            key={file.path}
            file={file}
            activeRepo={activeRepo}
            reviewBaseRef={reviewBaseRef}
            reviewHeadRef={reviewHeadRef}
            depth={mode === "tree" ? depth : 0}
            label={mode === "tree" ? name : undefined}
            navIndex={navIndex}
            showDirectoryPath={mode !== "tree"}
          />
        )}
      />
    </div>
  );
}

type PullRequestReviewFileRowProps = {
  file: FileItem;
  activeRepo: string;
  reviewBaseRef: string;
  reviewHeadRef: string;
  depth: number;
  label?: string;
  navIndex: number;
  showDirectoryPath: boolean;
};

function PullRequestReviewFileRow({
  file,
  activeRepo,
  reviewBaseRef,
  reviewHeadRef,
  depth,
  label,
  navIndex,
  showDirectoryPath,
}: PullRequestReviewFileRowProps) {
  const dispatch = useAppDispatch();
  const commentCount = useAppSelector((state) =>
    countCommentsForPathInRepoContext(state.comments, activeRepo, file.path, {
      kind: "review",
      baseRef: reviewBaseRef,
      headRef: reviewHeadRef,
    }),
  );
  const isActive = useAppSelector((state) => state.sourceControl.reviewActivePath === file.path);

  return (
    <FileListRow
      path={file.path}
      status={file.status}
      commentCount={commentCount}
      isActive={isActive}
      navIndex={navIndex}
      depth={depth}
      label={label}
      showDirectoryPath={showDirectoryPath}
      onSelect={() => {
        dispatch(setReviewActivePath(file.path));
      }}
    />
  );
}

export function PullRequestFilesTab({
  activeRepo,
  reviewBaseRef,
  reviewHeadRef,
}: PullRequestFilesTabProps) {
  const reviewActivePath = useAppSelector((state) => state.sourceControl.reviewActivePath);
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

  usePrefetchReviewDiffs(branchFiles, activeRepo, reviewBaseRef, reviewHeadRef, reviewActivePath);

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
          <PullRequestReviewFileList
            branchFiles={branchFiles}
            activeRepo={activeRepo}
            reviewBaseRef={reviewBaseRef}
            reviewHeadRef={reviewHeadRef}
          />
        )}
      </div>
    </div>
  );
}
