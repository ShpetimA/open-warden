import type { ReactNode } from "react";
import type { FileTreeRowDecoration } from "@pierre/trees";

import type { FileBrowserMode, FileStatus } from "@/features/source-control/types";
import { FlatPierreFileBrowser } from "./FlatPierreFileBrowser";
import { buildPierreGitStatusEntries } from "./pierreGitStatus";
import { PierreFileTreeBrowser } from "./PierreFileTreeBrowser";

export type FileListContextMenuItem = {
  kind: "directory" | "file";
  name: string;
  path: string;
};

export type FileListContextMenuOpenContext = {
  close: (options?: { restoreFocus?: boolean }) => void;
};

type FileListProps<TFile extends { path: string }> = {
  files: ReadonlyArray<TFile>;
  mode: FileBrowserMode;
  selectedPath?: string;
  navRegion: string;
  className?: string;
  onActivatePath: (path: string, file: TFile) => void;
  getCommentCount?: (file: TFile) => number;
  getFileStatus?: (file: TFile) => FileStatus | undefined;
  renderContextMenu?: (
    file: TFile,
    item: FileListContextMenuItem,
    context: FileListContextMenuOpenContext,
  ) => ReactNode;
};

export function FileList<TFile extends { path: string }>({
  files,
  mode,
  selectedPath = "",
  navRegion,
  className,
  onActivatePath,
  getCommentCount,
  getFileStatus,
  renderContextMenu,
}: FileListProps<TFile>) {
  if (mode === "list") {
    return (
      <FlatPierreFileBrowser
        files={files}
        selectedPath={selectedPath}
        navRegion={navRegion}
        className={className}
        onActivatePath={onActivatePath}
        getCommentCount={getCommentCount}
        getFileStatus={getFileStatus}
        renderTreeContextMenu={renderContextMenu}
      />
    );
  }

  const filesByPath = new Map(files.map((file) => [file.path, file]));
  const gitStatus = getFileStatus
    ? buildPierreGitStatusEntries(files, (file) => file.path, getFileStatus)
    : undefined;

  return (
    <PierreFileTreeBrowser
      files={files}
      selectedPath={selectedPath}
      navRegion={navRegion}
      className={className}
      onActivatePath={(path) => {
        const file = filesByPath.get(path);
        if (file) {
          onActivatePath(path, file);
        }
      }}
      gitStatus={gitStatus}
      renderRowDecoration={
        getCommentCount
          ? ({ item }): FileTreeRowDecoration | null => {
              if (item.kind === "directory") {
                return null;
              }
              const file = filesByPath.get(item.path);
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
        renderContextMenu
          ? (item, context) => {
              if (item.kind === "directory") {
                return null;
              }
              const file = filesByPath.get(item.path);
              return file ? renderContextMenu(file, item, context) : null;
            }
          : undefined
      }
    />
  );
}
