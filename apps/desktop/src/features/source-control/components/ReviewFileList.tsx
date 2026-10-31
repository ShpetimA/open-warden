import { FilePaneEmpty, FilePaneHeader } from "./FilePaneHeader";
import { filePaneCount, filterFilePaths } from "./filePaneFilter";
import { useEffect, useState, type ReactNode } from "react";

import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { RetainedFileList } from "./RetainedFileList";
import {
  areCommentCountMapsEqual,
  selectReviewCommentCountsForRepo,
} from "@/features/comments/selectors";
import { countPullRequestThreadsForFile } from "@/features/pull-requests/utils/reviewThreadAnnotations";
import { ReviewFileViewControl } from "./ReviewFileViewControl";
import type { ReviewFileView } from "./reviewFileGrouping";
import { selectReviewFilePath } from "../fileSelection";
import { FileList } from "@/features/source-control/components/FileList";
import { useReviewKeyboardNav } from "@/features/source-control/hooks/useReviewKeyboardNav";
import { setReviewActivePath } from "@/features/source-control/sourceControlSlice";
import type { FileItem } from "@/features/source-control/types";
import type { PullRequestReviewThread } from "@/platform/desktop";

type ReviewSelectionSyncProps = {
  readyForDiff: boolean;
  branchFiles: FileItem[];
  hasBranchFilesData: boolean;
};

export function ReviewSelectionSync({
  readyForDiff,
  branchFiles,
  hasBranchFilesData,
}: ReviewSelectionSyncProps) {
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
  }, [branchFiles, dispatch, hasBranchFilesData, readyForDiff, reviewActivePath]);

  return null;
}

type ReviewFileListProps = {
  title: string;
  subtitle?: ReactNode;
  branchFiles: FileItem[];
  activeRepo: string;
  reviewBaseRef: string;
  reviewHeadRef: string;
  navRegion?: string;
  emptyState?: ReactNode;
  isLoading?: boolean;
  error?: unknown;
  hasData?: boolean;
  onRetry?: () => void;
  paneClassName?: string;
  reviewThreads?: PullRequestReviewThread[];
};

export function ReviewFileList({
  title,
  subtitle,
  branchFiles,
  activeRepo,
  reviewBaseRef,
  reviewHeadRef,
  navRegion = "review-files",
  emptyState = <FilePaneEmpty description="No changed files between these revisions." />,
  isLoading = false,
  error,
  hasData = true,
  onRetry,
  paneClassName,
  reviewThreads = [],
}: ReviewFileListProps) {
  const dispatch = useAppDispatch();
  const [filter, setFilter] = useState("");
  const visibleFiles = filterFilePaths(branchFiles, filter);
  const [fileView, setFileView] = useState<ReviewFileView>("review");
  const commentCounts = useAppSelector<ReadonlyMap<string, number>>(
    (state) => selectReviewCommentCountsForRepo(state, activeRepo, reviewBaseRef, reviewHeadRef),
    areCommentCountMapsEqual,
  );

  useReviewKeyboardNav(navRegion);

  let emptyContent = emptyState;

  if (filter.trim()) {
    emptyContent = <FilePaneEmpty filtered description="" onClear={() => setFilter("")} />;
  }

  const getCommentCount = (file: FileItem) =>
    countPullRequestThreadsForFile({
      path: file.path,
      previousPath: file.previousPath,
      reviewThreads,
    }) + (commentCounts.get(file.path) ?? 0);

  return (
    <aside
      className={`bg-surface-toolbar border-border/70 flex h-full min-h-0 flex-col overflow-hidden border-r ${paneClassName ?? ""}`.trim()}
    >
      <FilePaneHeader
        title={title}
        summary={hasData ? filePaneCount(visibleFiles.length, branchFiles.length) : undefined}
        description={subtitle}
        filter={filter}
        onFilterChange={setFilter}
        actions={<ReviewFileViewControl value={fileView} onChange={setFileView} compact />}
      />
      <RetainedFileList
        hasData={hasData}
        fetching={isLoading}
        error={error}
        loadingLabel="Loading changed files…"
        errorTitle="Couldn’t load compared files"
        onRetry={() => onRetry?.()}
      >
        {visibleFiles.length === 0 ? (
          emptyContent
        ) : (
          <FileList
            files={visibleFiles}
            mode={fileView}
            selection={selectReviewFilePath}
            selectFirstFile
            autoFocus={false}
            navRegion={navRegion}
            onActivatePath={(path) => {
              dispatch(setReviewActivePath(path));
            }}
            getCommentCount={getCommentCount}
            getFileStatus={(file) => file.status}
          />
        )}
      </RetainedFileList>
    </aside>
  );
}
