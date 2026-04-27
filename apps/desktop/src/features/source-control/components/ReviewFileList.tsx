import { useEffect, type ReactNode } from "react";

import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { countCommentsForPathInRepoContext } from "@/features/comments/selectors";
import { countPullRequestThreadsForFile } from "@/features/pull-requests/utils/reviewThreadAnnotations";
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

    const existing = branchFiles.find((file) => file.path === reviewActivePath);
    if (!existing) {
      dispatch(setReviewActivePath(branchFiles[0].path));
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
  paneClassName?: string;
  headerClassName?: string;
  bodyClassName?: string;
  scrollAreaClassName?: string;
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
  emptyState = null,
  paneClassName,
  headerClassName,
  reviewThreads = [],
}: ReviewFileListProps) {
  const dispatch = useAppDispatch();
  const fileBrowserMode = useAppSelector(
    (state) => state.settings.appSettings.sourceControl.fileTreeRenderMode,
  );
  const reviewActivePath = useAppSelector((state) => state.sourceControl.reviewActivePath);
  const comments = useAppSelector((state) => state.comments);

  useReviewKeyboardNav(navRegion);

  const getCommentCount = (file: FileItem) =>
    countPullRequestThreadsForFile({
      path: file.path,
      previousPath: file.previousPath,
      reviewThreads,
    }) +
    countCommentsForPathInRepoContext(comments, activeRepo, file.path, {
      kind: "review",
      baseRef: reviewBaseRef,
      headRef: reviewHeadRef,
    });

  return (
    <aside
      className={`bg-surface-toolbar border-border/70 flex h-full min-h-0 flex-col overflow-hidden border-r ${paneClassName ?? ""}`.trim()}
    >
      {title || subtitle ? (
        <div className={`border-border border-b ${headerClassName ?? "px-3 py-2"}`.trim()}>
          {title ? (
            <div className="text-foreground/80 text-[11px] font-semibold tracking-[0.14em]">
              {title}
            </div>
          ) : null}
          {subtitle ? <div className="text-muted-foreground mt-1 text-xs">{subtitle}</div> : null}
        </div>
      ) : null}
      {branchFiles.length === 0 ? (
        emptyState
      ) : (
        <FileList
          files={branchFiles}
          mode={fileBrowserMode}
          selectedPath={reviewActivePath}
          navRegion={navRegion}
          onActivatePath={(path) => {
            dispatch(setReviewActivePath(path));
          }}
          getCommentCount={getCommentCount}
          getFileStatus={(file) => file.status}
        />
      )}
    </aside>
  );
}
