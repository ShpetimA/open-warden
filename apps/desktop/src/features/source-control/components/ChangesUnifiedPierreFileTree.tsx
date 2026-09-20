import type { FileTreeRowDecoration, GitStatusEntry } from "@pierre/trees";

import { useAppDispatch, useAppSelector } from "@/app/hooks";
import {
  areCommentCountMapsEqual,
  selectChangesCommentCountByPathForRepo,
} from "@/features/comments/selectors";
import {
  rangeSelectFile,
  selectFile,
  toggleFileSelection,
} from "@/features/source-control/actions";
import {
  ChangesFileContextMenu,
  ChangesSectionContextMenu,
} from "@/features/source-control/components/ChangesContextMenu";
import { getPierreFileTreeVisibleSelectedFiles } from "@/features/source-control/pierreFileTreeNavigation";
import type { Bucket, BucketedFile, FileBrowserMode } from "@/features/source-control/types";
import {
  buildUnifiedChangeTreeFiles,
  CHANGES_ROOT_PATH,
  compareUnifiedChangeListEntries,
  compareUnifiedChangeTreeDirectories,
  compareUnifiedChangeTreeEntries,
  CONFLICTS_ROOT_PATH,
  STAGED_ROOT_PATH,
  type UnifiedChangeTreeFile,
} from "./changesUnifiedPierreTree";
import { buildPierreGitStatusEntries } from "./pierreFileTree";
import { PierreFileTreeBrowser } from "./PierreFileTreeBrowser";

const SELECTION_KEY_SEPARATOR = "\u0000";

type ChangesUnifiedPierreFileTreeProps = {
  mode: FileBrowserMode;
  stagedRows: BucketedFile[];
  changedRows: BucketedFile[];
  conflictRows: BucketedFile[];
  activeRepo: string;
  onStageAll: () => void;
  onUnstageAll: () => void;
  onStageFile: (path: string) => void;
  onUnstageFile: (path: string) => void;
  onStageFiles: (files: BucketedFile[]) => void;
  onUnstageFiles: (files: BucketedFile[]) => void;
  onDiscardFile: (bucket: Bucket, path: string) => void;
  onDiscardChangesGroup: (files: BucketedFile[]) => void;
};

type ConnectedChangesTreeProps = ChangesUnifiedPierreFileTreeProps & {
  files: UnifiedChangeTreeFile[];
  filesByTreePath: ReadonlyMap<string, UnifiedChangeTreeFile>;
  treePathBySelectionKey: ReadonlyMap<string, string>;
  gitStatus: readonly GitStatusEntry[];
};

export function ChangesUnifiedPierreFileTree(props: ChangesUnifiedPierreFileTreeProps) {
  const { stagedRows, changedRows, conflictRows, mode } = props;
  const files = buildUnifiedChangeTreeFiles(stagedRows, changedRows, conflictRows, mode);

  if (files.length === 0) {
    return <div className="text-muted-foreground px-3 py-2 text-xs">No files.</div>;
  }

  const filesByTreePath = new Map(files.map((file) => [file.path, file]));
  const treePathBySelectionKey = new Map(files.map((file) => [selectionKey(file), file.path]));
  const gitStatus = buildPierreGitStatusEntries(
    files,
    (file) => file.path,
    (file) => file.status,
  );

  return (
    <ConnectedChangesTree
      {...props}
      files={files}
      filesByTreePath={filesByTreePath}
      treePathBySelectionKey={treePathBySelectionKey}
      gitStatus={gitStatus}
    />
  );
}

function ConnectedChangesTree({
  mode,
  stagedRows,
  changedRows,
  conflictRows,
  activeRepo,
  onStageAll,
  onUnstageAll,
  onStageFile,
  onUnstageFile,
  onStageFiles,
  onUnstageFiles,
  onDiscardFile,
  onDiscardChangesGroup,
  files,
  filesByTreePath,
  treePathBySelectionKey,
  gitStatus,
}: ConnectedChangesTreeProps) {
  const dispatch = useAppDispatch();
  const activeBucket = useAppSelector((state) => state.sourceControl.activeBucket);
  const activePath = useAppSelector((state) => state.sourceControl.activePath);
  const selectedFiles = useAppSelector((state) => state.sourceControl.selectedFiles);
  const runningAction = useAppSelector((state) => state.sourceControl.runningAction);
  const commentCounts = useAppSelector<ReadonlyMap<string, number>>(
    (state) => selectChangesCommentCountByPathForRepo(state, activeRepo),
    areCommentCountMapsEqual,
  );
  const selectedPath = treePathBySelectionKey.get(toBucketPathKey(activeBucket, activePath)) ?? "";
  const selectedPaths = selectedFiles
    .map((file) => treePathBySelectionKey.get(toBucketPathKey(file.bucket, file.path)))
    .filter((path): path is string => path !== undefined);
  const hasRunningAction = runningAction !== "";

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

    const visibleRows = getPierreFileTreeVisibleSelectedFiles("changes-files");
    void dispatch(rangeSelectFile({ bucket: file.bucket, path: file.realPath }, visibleRows));
  };

  return (
    <PierreFileTreeBrowser
      files={files}
      selectedPath={selectedPath}
      selectedPaths={selectedPaths}
      navRegion="changes-files"
      className="py-0.5"
      flattenEmptyDirectories={false}
      sort={mode === "list" ? compareUnifiedChangeListEntries : compareUnifiedChangeTreeEntries}
      compareTreeDirectories={compareUnifiedChangeTreeDirectories}
      onActivatePath={activatePath}
      onTogglePathSelection={togglePathSelection}
      onRangeSelectPath={rangeSelectPath}
      gitStatus={gitStatus}
      rowDecorationInvalidationKey={commentCounts}
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
          if (item.path === CONFLICTS_ROOT_PATH) {
            return {
              text: String(conflictRows.length),
              title: `${conflictRows.length} merge conflict${conflictRows.length === 1 ? "" : "s"}`,
            };
          }
          return null;
        }

        const file = filesByTreePath.get(item.path);
        if (!file) return null;

        const commentCount = commentCounts.get(file.realPath) ?? 0;
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
              conflictRows={conflictRows}
              hasRunningAction={hasRunningAction}
              onStageAll={onStageAll}
              onUnstageAll={onUnstageAll}
              onStageFiles={onStageFiles}
              onUnstageFiles={onUnstageFiles}
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
