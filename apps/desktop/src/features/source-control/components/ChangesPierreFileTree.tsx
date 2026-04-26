import type { FileTreeRowDecoration, GitStatus, GitStatusEntry } from "@pierre/trees";
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
} from "@/features/source-control/fileTree";
import { getPierreFileTreeVisibleBucketedFiles } from "@/features/source-control/pierreFileTreeNavigation";
import type { Bucket, BucketedFile, FileStatus } from "@/features/source-control/types";
import { PIERRE_FILE_TREE_ITEM_HEIGHT, PierreFileTreeBrowser } from "./PierreFileTreeBrowser";
import { ChangesFileContextMenu } from "@/features/source-control/components/ChangesContextMenu";

type ChangesPierreFileTreeProps = {
  rows: BucketedFile[];
  sectionKey: "staged" | "unstaged";
  activeRepo: string;
  onStageFile: (path: string) => void;
  onUnstageFile: (path: string) => void;
  onDiscardFile: (bucket: Bucket, path: string) => void;
};

export function ChangesPierreFileTree({
  rows,
  sectionKey,
  activeRepo,
  onStageFile,
  onUnstageFile,
  onDiscardFile,
}: ChangesPierreFileTreeProps) {
  const dispatch = useAppDispatch();
  const activeBucket = useAppSelector((state) => state.sourceControl.activeBucket);
  const activePath = useAppSelector((state) => state.sourceControl.activePath);
  const selectedFiles = useAppSelector((state) => state.sourceControl.selectedFiles);
  const comments = useAppSelector((state) => state.comments);
  const runningAction = useAppSelector((state) => state.sourceControl.runningAction);
  const filesByPath = new Map(rows.map((file) => [file.path, file]));
  const selectedPath = rows.some((file) => file.bucket === activeBucket && file.path === activePath)
    ? activePath
    : "";
  const selectedPaths = selectedFiles
    .filter((selectedFile) =>
      rows.some((row) => row.bucket === selectedFile.bucket && row.path === selectedFile.path),
    )
    .map((selectedFile) => selectedFile.path);
  const gitStatus = buildPierreGitStatus(rows);
  const treeHeight = getExpandedTreeHeight(rows);
  const hasRunningAction = runningAction !== "";

  const activatePath = (path: string) => {
    const file = filesByPath.get(path);
    if (!file) {
      return;
    }

    void dispatch(selectFile(file.bucket, file.path));
  };

  const togglePathSelection = (path: string) => {
    const file = filesByPath.get(path);
    if (!file) {
      return;
    }

    void dispatch(toggleFileSelection(file.bucket, file.path));
  };

  const rangeSelectPath = (path: string) => {
    const file = filesByPath.get(path);
    if (!file) {
      return;
    }

    const visibleRows = getPierreFileTreeVisibleBucketedFiles("changes-files");
    void dispatch(rangeSelectFile({ bucket: file.bucket, path: file.path }, visibleRows));
  };

  return (
    <PierreFileTreeBrowser
      files={rows}
      selectedPath={selectedPath}
      selectedPaths={selectedPaths}
      navRegion="changes-files"
      className="py-0.5"
      style={{ height: `${treeHeight}px` }}
      disableInternalScroll
      onActivatePath={activatePath}
      onTogglePathSelection={togglePathSelection}
      onRangeSelectPath={rangeSelectPath}
      gitStatus={gitStatus}
      renderRowDecoration={({ item }): FileTreeRowDecoration | null => {
        if (item.kind === "directory") {
          return null;
        }

        const commentCount = countCommentsForPathInRepoContext(comments, activeRepo, item.path, {
          kind: "changes",
        });
        return commentCount > 0
          ? {
              text: String(commentCount),
              title: `${commentCount} comment${commentCount === 1 ? "" : "s"}`,
            }
          : null;
      }}
      renderContextMenu={(item, context) => {
        if (item.kind === "directory") {
          return null;
        }

        const file = filesByPath.get(item.path);
        if (!file) {
          return null;
        }

        return (
          <ChangesFileContextMenu
            item={item}
            context={context}
            file={file}
            sectionKey={sectionKey}
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

function getExpandedTreeHeight(rows: ReadonlyArray<BucketedFile>) {
  const treeNodes = buildSourceControlFileTree(rows);
  const rowCount = rows.length + collectDirectoryPaths(treeNodes).length;
  return Math.max(PIERRE_FILE_TREE_ITEM_HEIGHT, rowCount * PIERRE_FILE_TREE_ITEM_HEIGHT + 4);
}

function buildPierreGitStatus(files: ReadonlyArray<BucketedFile>): GitStatusEntry[] {
  const entries: GitStatusEntry[] = [];

  for (const file of files) {
    const status = toPierreGitStatus(file.status);
    if (status) {
      entries.push({ path: file.path, status });
    }
  }

  return entries;
}

function toPierreGitStatus(status: FileStatus): GitStatus {
  if (
    status === "added" ||
    status === "deleted" ||
    status === "modified" ||
    status === "renamed" ||
    status === "untracked"
  ) {
    return status;
  }

  return "modified";
}
