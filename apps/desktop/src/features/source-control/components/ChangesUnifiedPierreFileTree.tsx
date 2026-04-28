import type { FileTreeRowDecoration } from "@pierre/trees";

import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { countCommentsForPathInRepoContext } from "@/features/comments/selectors";
import {
  rangeSelectFile,
  selectFile,
  toggleFileSelection,
} from "@/features/source-control/actions";
import { getPierreFileTreeVisibleBucketedFiles } from "@/features/source-control/pierreFileTreeNavigation";
import type { Bucket, BucketedFile, FileBrowserMode } from "@/features/source-control/types";
import {
  buildUnifiedChangeTreeFiles,
  CHANGES_ROOT_PATH,
  compareUnifiedChangeListEntries,
  compareUnifiedChangeTreeDirectories,
  compareUnifiedChangeTreeEntries,
  getUnifiedChangeTreeHeight,
  STAGED_ROOT_PATH,
} from "./changesUnifiedPierreTree";
import { buildPierreGitStatusEntries } from "./pierreFileTree";
import { PierreFileTreeBrowser } from "./PierreFileTreeBrowser";
import {
  ChangesSectionContextMenu,
  ChangesFileContextMenu,
} from "@/features/source-control/components/ChangesContextMenu";

const SELECTION_KEY_SEPARATOR = "\u0000";

type ChangesUnifiedPierreFileTreeProps = {
  mode: FileBrowserMode;
  stagedRows: BucketedFile[];
  changedRows: BucketedFile[];
  activeRepo: string;
  onStageAll: () => void;
  onUnstageAll: () => void;
  onStageFile: (path: string) => void;
  onUnstageFile: (path: string) => void;
  onDiscardFile: (bucket: Bucket, path: string) => void;
  onDiscardChangesGroup: (files: BucketedFile[]) => void;
};

export function ChangesUnifiedPierreFileTree({
  mode,
  stagedRows,
  changedRows,
  activeRepo,
  onStageAll,
  onUnstageAll,
  onStageFile,
  onUnstageFile,
  onDiscardFile,
  onDiscardChangesGroup,
}: ChangesUnifiedPierreFileTreeProps) {
  const dispatch = useAppDispatch();
  const activeBucket = useAppSelector((state) => state.sourceControl.activeBucket);
  const activePath = useAppSelector((state) => state.sourceControl.activePath);
  const selectedFiles = useAppSelector((state) => state.sourceControl.selectedFiles);
  const comments = useAppSelector((state) => state.comments);
  const runningAction = useAppSelector((state) => state.sourceControl.runningAction);
  const files = buildUnifiedChangeTreeFiles(stagedRows, changedRows, mode);
  const filesByTreePath = new Map(files.map((file) => [file.path, file]));
  const treePathBySelectionKey = new Map(files.map((file) => [selectionKey(file), file.path]));
  const selectedPath = treePathBySelectionKey.get(toBucketPathKey(activeBucket, activePath)) ?? "";
  const selectedPaths = selectedFiles
    .map((file) => treePathBySelectionKey.get(toBucketPathKey(file.bucket, file.path)))
    .filter((path): path is string => !!path);
  const gitStatus = buildPierreGitStatusEntries(
    files,
    (file) => file.path,
    (file) => file.status,
  );
  const treeHeight = getUnifiedChangeTreeHeight(files);
  const hasRunningAction = runningAction !== "";

  if (files.length === 0) {
    return <div className="text-muted-foreground px-3 py-2 text-xs">No files.</div>;
  }

  const activatePath = (treePath: string) => {
    const file = filesByTreePath.get(treePath);
    if (!file) return;
    void dispatch(selectFile(file.bucket, file.realPath));
  };

  const togglePathSelection = (treePath: string) => {
    const file = filesByTreePath.get(treePath);
    if (!file) return;
    void dispatch(toggleFileSelection(file.bucket, file.realPath));
  };

  const rangeSelectPath = (treePath: string) => {
    const file = filesByTreePath.get(treePath);
    if (!file) return;

    const visibleRows = getPierreFileTreeVisibleBucketedFiles("changes-files");
    void dispatch(rangeSelectFile({ bucket: file.bucket, path: file.realPath }, visibleRows));
  };

  return (
    <PierreFileTreeBrowser
      files={files}
      selectedPath={selectedPath}
      selectedPaths={selectedPaths}
      navRegion="changes-files"
      className="py-0.5"
      style={{ height: `${treeHeight}px` }}
      disableInternalScroll
      flattenEmptyDirectories={false}
      sort={mode === "list" ? compareUnifiedChangeListEntries : compareUnifiedChangeTreeEntries}
      compareTreeDirectories={compareUnifiedChangeTreeDirectories}
      onActivatePath={activatePath}
      onTogglePathSelection={togglePathSelection}
      onRangeSelectPath={rangeSelectPath}
      gitStatus={gitStatus}
      renderRowDecoration={({ item }): FileTreeRowDecoration | null => {
        if (item.kind === "directory") {
          if (item.path === STAGED_ROOT_PATH) {
            return { text: String(stagedRows.length), title: `${stagedRows.length} staged files` };
          }
          if (item.path === CHANGES_ROOT_PATH) {
            return {
              text: String(changedRows.length),
              title: `${changedRows.length} changed files`,
            };
          }
          return null;
        }

        const file = filesByTreePath.get(item.path);
        if (!file) return null;

        const commentCount = countCommentsForPathInRepoContext(
          comments,
          activeRepo,
          file.realPath,
          { kind: "changes" },
        );
        return commentCount > 0
          ? {
              text: String(commentCount),
              title: `${commentCount} comment${commentCount === 1 ? "" : "s"}`,
            }
          : null;
      }}
      renderContextMenu={(item, context) => {
        if (item.kind === "directory") {
          return (
            <ChangesSectionContextMenu
              context={context}
              sectionPath={item.path}
              stagedRows={stagedRows}
              changedRows={changedRows}
              hasRunningAction={hasRunningAction}
              onStageAll={onStageAll}
              onUnstageAll={onUnstageAll}
              onDiscardChangesGroup={onDiscardChangesGroup}
            />
          );
        }

        const file = filesByTreePath.get(item.path);
        if (!file) return null;

        return (
          <ChangesFileContextMenu
            context={context}
            item={item}
            file={{ ...file, path: file.realPath }}
            sectionKey={file.sectionKey}
            hasRunningAction={hasRunningAction}
            onStageFile={onStageFile}
            onUnstageFile={onUnstageFile}
            onDiscardFile={onDiscardFile}
          />
        );
      }}
    />
  );
}

function selectionKey(file: Pick<BucketedFile, "bucket" | "path"> & { realPath?: string }) {
  return toBucketPathKey(file.bucket, file.realPath ?? file.path);
}

function toBucketPathKey(bucket: Bucket, path: string) {
  // NUL is not valid in filesystem paths, so it is safe as a collision-free bucket/path delimiter.
  return `${bucket}${SELECTION_KEY_SEPARATOR}${path}`;
}
