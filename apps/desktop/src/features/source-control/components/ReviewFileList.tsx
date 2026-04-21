import { useEffect, type ReactNode } from "react";

import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { countCommentsForPathInRepoContext } from "@/features/comments/selectors";
import {
  FileListPane,
  type FileListPaneRowArgs,
} from "@/features/source-control/components/FileListPane";
import { FileListRow } from "@/features/source-control/components/FileListRow";
import { useReviewKeyboardNav } from "@/features/source-control/hooks/useReviewKeyboardNav";
import { setReviewActivePath } from "@/features/source-control/sourceControlSlice";
import type { FileItem } from "@/features/source-control/types";

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
  bodyClassName,
  scrollAreaClassName,
}: ReviewFileListProps) {
  const fileBrowserMode = useAppSelector(
    (state) => state.settings.appSettings.sourceControl.fileTreeRenderMode,
  );

  useReviewKeyboardNav(navRegion);

  return (
    <FileListPane
      title={title}
      subtitle={subtitle}
      navRegion={navRegion}
      files={branchFiles}
      mode={fileBrowserMode}
      emptyState={emptyState}
      paneClassName={paneClassName}
      headerClassName={headerClassName}
      bodyClassName={bodyClassName}
      scrollAreaClassName={scrollAreaClassName}
      renderRow={(row) => (
        <ReviewFileRow
          key={row.file.path}
          row={row}
          activeRepo={activeRepo}
          reviewBaseRef={reviewBaseRef}
          reviewHeadRef={reviewHeadRef}
        />
      )}
    />
  );
}

type ReviewFileRowProps = {
  row: FileListPaneRowArgs<FileItem>;
  activeRepo: string;
  reviewBaseRef: string;
  reviewHeadRef: string;
};

function ReviewFileRow({ row, activeRepo, reviewBaseRef, reviewHeadRef }: ReviewFileRowProps) {
  const dispatch = useAppDispatch();
  const commentCount = useAppSelector((state) =>
    countCommentsForPathInRepoContext(state.comments, activeRepo, row.file.path, {
      kind: "review",
      baseRef: reviewBaseRef,
      headRef: reviewHeadRef,
    }),
  );
  const isActive = useAppSelector(
    (state) => state.sourceControl.reviewActivePath === row.file.path,
  );

  return (
    <FileListRow
      path={row.file.path}
      status={row.file.status}
      commentCount={commentCount}
      isActive={isActive}
      navIndex={row.navIndex}
      depth={row.depth}
      label={row.label}
      showDirectoryPath={row.showDirectoryPath}
      onSelect={() => {
        dispatch(setReviewActivePath(row.file.path));
      }}
    />
  );
}
