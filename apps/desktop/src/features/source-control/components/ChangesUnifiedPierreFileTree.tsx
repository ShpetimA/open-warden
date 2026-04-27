import type { FileTreeRowDecoration, FileTreeSortComparator } from "@pierre/trees";

import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { countCommentsForPathInRepoContext } from "@/features/comments/selectors";
import {
  rangeSelectFile,
  selectFile,
  toggleFileSelection,
} from "@/features/source-control/actions";
import {
  buildSourceControlFileTree,
  collectDirectoryPaths,
  type SourceControlTreeDirectoryNode,
} from "@/features/source-control/fileTree";
import { getPierreFileTreeVisibleBucketedFiles } from "@/features/source-control/pierreFileTreeNavigation";
import type { Bucket, BucketedFile, FileBrowserMode } from "@/features/source-control/types";
import { getFlatPierrePathIndex, toDisplayPath } from "./pierreFileTreeDisplay";
import { buildPierreGitStatusEntries } from "./pierreGitStatus";
import { PIERRE_FILE_TREE_ITEM_HEIGHT, PierreFileTreeBrowser } from "./PierreFileTreeBrowser";
import {
  ChangesSectionContextMenu,
  ChangesFileContextMenu,
} from "@/features/source-control/components/ChangesContextMenu";

const STAGED_ROOT = "Staged Changes";
export const STAGED_ROOT_PATH = `${STAGED_ROOT}/`;
const CHANGES_ROOT = "Changes";
export const CHANGES_ROOT_PATH = `${CHANGES_ROOT}/`;
const SECTION_SORT_ORDER = new Map([
  [STAGED_ROOT, 0],
  [CHANGES_ROOT, 1],
]);
const SORT_LOCALE_OPTIONS: Intl.CollatorOptions = { numeric: true, sensitivity: "base" };

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

type UnifiedChangeTreeFile = BucketedFile & {
  path: string;
  realPath: string;
  sectionKey: "staged" | "unstaged";
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
  const files = [
    ...stagedRows.map((file, index) => toUnifiedFile(file, "staged", mode, index)),
    ...changedRows.map((file, index) => toUnifiedFile(file, "unstaged", mode, index)),
  ];
  const filesByTreePath = new Map(files.map((file) => [file.path, file]));
  const treePathBySelectionKey = new Map(files.map((file) => [selectionKey(file), file.path]));
  const selectedPath = treePathBySelectionKey.get(`${activeBucket}\u0000${activePath}`) ?? "";
  const selectedPaths = selectedFiles
    .map((file) => treePathBySelectionKey.get(`${file.bucket}\u0000${file.path}`))
    .filter((path): path is string => !!path);
  const gitStatus = buildPierreGitStatusEntries(
    files,
    (file) => file.path,
    (file) => file.status,
  );
  const treeHeight = getExpandedTreeHeight(files);
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
      sort={mode === "list" ? compareChangeListEntries : compareChangeTreeEntries}
      compareTreeDirectories={compareChangeTreeDirectories}
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

function toUnifiedFile(
  file: BucketedFile,
  sectionKey: "staged" | "unstaged",
  mode: FileBrowserMode,
  index: number,
): UnifiedChangeTreeFile {
  const root = sectionKey === "staged" ? STAGED_ROOT : CHANGES_ROOT;
  return {
    ...file,
    path: `${root}/${toDisplayPath(mode, file.path, index)}`,
    realPath: file.path,
    sectionKey,
  };
}

function selectionKey(file: Pick<BucketedFile, "bucket" | "path"> & { realPath?: string }) {
  const path = file.realPath ?? file.path;
  return `${file.bucket}\u0000${path}`;
}

const compareChangeListEntries: FileTreeSortComparator = (left, right) => {
  const sectionComparison = compareSectionNames(left.segments[0], right.segments[0]);
  if (sectionComparison !== 0) {
    return sectionComparison;
  }

  if (left.isDirectory !== right.isDirectory) {
    return left.isDirectory ? -1 : 1;
  }

  return getFlatPierrePathIndex(left.path) - getFlatPierrePathIndex(right.path);
};

const compareChangeTreeEntries: FileTreeSortComparator = (left, right) => {
  const sectionComparison = compareSectionNames(left.segments[0], right.segments[0]);
  if (sectionComparison !== 0) {
    return sectionComparison;
  }

  const sharedDepth = Math.min(left.segments.length, right.segments.length);
  for (let depth = 0; depth < sharedDepth; depth += 1) {
    const leftSegment = left.segments[depth];
    const rightSegment = right.segments[depth];
    if (leftSegment === rightSegment) {
      continue;
    }

    const leftIsDirectoryAtDepth = depth < left.segments.length - 1 || left.isDirectory;
    const rightIsDirectoryAtDepth = depth < right.segments.length - 1 || right.isDirectory;
    if (leftIsDirectoryAtDepth !== rightIsDirectoryAtDepth) {
      return leftIsDirectoryAtDepth ? -1 : 1;
    }

    return compareNames(leftSegment ?? "", rightSegment ?? "");
  }

  if (left.segments.length !== right.segments.length) {
    return left.segments.length < right.segments.length ? -1 : 1;
  }

  if (left.isDirectory === right.isDirectory) {
    return 0;
  }

  return left.isDirectory ? -1 : 1;
};

function compareChangeTreeDirectories(
  left: SourceControlTreeDirectoryNode<UnifiedChangeTreeFile>,
  right: SourceControlTreeDirectoryNode<UnifiedChangeTreeFile>,
  depth: number,
) {
  if (depth === 0) {
    const sectionComparison = compareSectionNames(left.name, right.name);
    if (sectionComparison !== 0) {
      return sectionComparison;
    }
  }

  return compareNames(left.name, right.name);
}

function compareSectionNames(left: string | undefined, right: string | undefined) {
  const leftOrder = left ? SECTION_SORT_ORDER.get(left) : undefined;
  const rightOrder = right ? SECTION_SORT_ORDER.get(right) : undefined;

  if (leftOrder !== undefined || rightOrder !== undefined) {
    return (leftOrder ?? Number.MAX_SAFE_INTEGER) - (rightOrder ?? Number.MAX_SAFE_INTEGER);
  }

  return 0;
}

function compareNames(left: string, right: string) {
  return left.localeCompare(right, undefined, SORT_LOCALE_OPTIONS);
}

function getExpandedTreeHeight(rows: ReadonlyArray<UnifiedChangeTreeFile>) {
  const treeNodes = buildSourceControlFileTree(rows, {
    compareDirectories: compareChangeTreeDirectories,
    flattenEmptyDirectories: false,
  });
  const rowCount = rows.length + collectDirectoryPaths(treeNodes).length;
  return Math.max(PIERRE_FILE_TREE_ITEM_HEIGHT, rowCount * PIERRE_FILE_TREE_ITEM_HEIGHT + 4);
}
