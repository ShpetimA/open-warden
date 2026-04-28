import type { ReactNode } from "react";

import type { FileBrowserMode, FileStatus } from "@/features/source-control/types";
import { buildDisplayFiles, compareFlatPierreEntries } from "./flatPierreTree";
import { buildCommentCountDecoration, buildGitStatusForDisplayFiles } from "./pierreFileTree";
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

const SORT_LOCALE_OPTIONS: Intl.CollatorOptions = { numeric: true, sensitivity: "base" };

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
  const isList = mode === "list";

  const displayFiles = buildDisplayFiles(mode, files, {
    sort: isList
      ? (left, right) => left.path.localeCompare(right.path, undefined, SORT_LOCALE_OPTIONS)
      : undefined,
  });

  const sourceByDisplayPath = new Map(displayFiles.map((file) => [file.path, file.source]));

  const pierreSelectedPath = isList
    ? (displayFiles.find((file) => file.source.path === selectedPath)?.path ?? "")
    : selectedPath;

  const gitStatus = getFileStatus
    ? buildGitStatusForDisplayFiles(displayFiles, getFileStatus)
    : undefined;

  return (
    <PierreFileTreeBrowser
      files={displayFiles}
      selectedPath={pierreSelectedPath}
      navRegion={navRegion}
      className={className}
      flattenEmptyDirectories={!isList}
      sort={isList ? compareFlatPierreEntries : "default"}
      onActivatePath={(path) => {
        const file = sourceByDisplayPath.get(path);
        if (file) {
          onActivatePath(file.path, file);
        }
      }}
      gitStatus={gitStatus}
      renderRowDecoration={
        getCommentCount
          ? buildCommentCountDecoration((path) => sourceByDisplayPath.get(path), getCommentCount)
          : undefined
      }
      renderContextMenu={
        renderContextMenu
          ? (item, context) => {
              if (item.kind === "directory") {
                return null;
              }
              const file = sourceByDisplayPath.get(item.path);
              return file ? renderContextMenu(file, item, context) : null;
            }
          : undefined
      }
    />
  );
}
