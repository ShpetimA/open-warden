import type { FileTreeRowDecoration } from "@pierre/trees";
import type { ReactNode } from "react";

import type { FileStatus } from "@/features/source-control/types";
import { buildFlatPierreFileTransform } from "./flatPierreFileTransformer";
import { compareFlatPierreEntries } from "./flatPierrePaths";
import { buildPierreGitStatusEntries } from "./pierreGitStatus";
import { PierreFileTreeBrowser } from "./PierreFileTreeBrowser";

type TreeContextMenuItem = {
  kind: "directory" | "file";
  name: string;
  path: string;
};

type TreeContextMenuOpenContext = {
  close: (options?: { restoreFocus?: boolean }) => void;
};

type FlatPierreFileBrowserProps<TFile extends { path: string }> = {
  files: ReadonlyArray<TFile>;
  selectedPath?: string;
  selectedPaths?: readonly string[];
  navRegion: string;
  className?: string;
  onActivatePath: (path: string, file: TFile) => void;
  onTogglePathSelection?: (path: string, file: TFile) => void;
  onRangeSelectPath?: (path: string, file: TFile) => void;
  getCommentCount?: (file: TFile) => number;
  getFileStatus?: (file: TFile) => FileStatus | undefined;
  renderTreeContextMenu?: (
    file: TFile,
    item: TreeContextMenuItem,
    context: TreeContextMenuOpenContext,
  ) => ReactNode;
};

export function FlatPierreFileBrowser<TFile extends { path: string }>({
  files,
  selectedPath = "",
  selectedPaths,
  navRegion,
  className,
  onActivatePath,
  onTogglePathSelection,
  onRangeSelectPath,
  getCommentCount,
  getFileStatus,
  renderTreeContextMenu,
}: FlatPierreFileBrowserProps<TFile>) {
  const { flatFiles, fileByTreePath, pierreSelectedPath, pierreSelectedPaths } =
    buildFlatPierreFileTransform({
      files,
      selectedPath,
      selectedPaths,
    });
  const gitStatus = getFileStatus
    ? buildPierreGitStatusEntries(
        flatFiles,
        (file) => file.path,
        (file) => {
          const sourceFile = fileByTreePath.get(file.path);
          return sourceFile ? getFileStatus(sourceFile) : undefined;
        },
      )
    : undefined;

  return (
    <PierreFileTreeBrowser
      files={flatFiles}
      selectedPath={pierreSelectedPath}
      selectedPaths={pierreSelectedPaths}
      navRegion={navRegion}
      className={className}
      flattenEmptyDirectories={false}
      sort={compareFlatPierreEntries}
      onActivatePath={(treePath) => {
        const file = fileByTreePath.get(treePath);
        if (file) {
          onActivatePath(file.path, file);
        }
      }}
      onTogglePathSelection={
        onTogglePathSelection
          ? (treePath) => {
              const file = fileByTreePath.get(treePath);
              if (file) {
                onTogglePathSelection(file.path, file);
              }
            }
          : undefined
      }
      onRangeSelectPath={
        onRangeSelectPath
          ? (treePath) => {
              const file = fileByTreePath.get(treePath);
              if (file) {
                onRangeSelectPath(file.path, file);
              }
            }
          : undefined
      }
      gitStatus={gitStatus}
      renderRowDecoration={
        getCommentCount
          ? ({ item }): FileTreeRowDecoration | null => {
              if (item.kind === "directory") {
                return null;
              }
              const file = fileByTreePath.get(item.path);
              if (!file) {
                return null;
              }
              const commentCount = getCommentCount(file);
              return commentCount > 0
                ? {
                    text: String(commentCount),
                    title: `${commentCount} comment${commentCount === 1 ? "" : "s"}`,
                  }
                : null;
            }
          : undefined
      }
      renderContextMenu={
        renderTreeContextMenu
          ? (item, context) => {
              if (item.kind === "directory") {
                return null;
              }
              const file = fileByTreePath.get(item.path);
              return file ? renderTreeContextMenu(file, item, context) : null;
            }
          : undefined
      }
    />
  );
}
