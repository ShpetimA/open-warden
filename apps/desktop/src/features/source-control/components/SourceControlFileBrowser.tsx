import type { ReactNode } from "react";

import type { FileBrowserMode, FileStatus } from "@/features/source-control/types";
import { FileList } from "./FileList";

type RenderFileArgs<TFile> = {
  depth: number;
  file: TFile;
  mode: FileBrowserMode;
  name: string;
  navIndex: number;
  path: string;
};

type TreeContextMenuItem = {
  kind: "directory" | "file";
  name: string;
  path: string;
};

type TreeContextMenuOpenContext = {
  close: (options?: { restoreFocus?: boolean }) => void;
};

type SourceControlFileBrowserProps<TFile extends { path: string }> = {
  files: ReadonlyArray<TFile>;
  mode: FileBrowserMode;
  className?: string;
  emptyState?: ReactNode;
  renderFile: (args: RenderFileArgs<TFile>) => ReactNode;
  navRegion?: string;
  selectedPath?: string;
  onSelectPath?: (path: string, file: TFile) => void;
  onActivatePath?: (path: string, file: TFile) => void;
  getCommentCount?: (file: TFile) => number;
  getFileStatus?: (file: TFile) => FileStatus | undefined;
  renderTreeContextMenu?: (
    file: TFile,
    item: TreeContextMenuItem,
    context: TreeContextMenuOpenContext,
  ) => ReactNode;
};

export function SourceControlFileBrowser<TFile extends { path: string }>({
  files,
  mode,
  className,
  emptyState = null,
  renderFile,
  navRegion,
  selectedPath = "",
  onActivatePath,
  getCommentCount,
  getFileStatus,
  renderTreeContextMenu,
}: SourceControlFileBrowserProps<TFile>) {
  void renderFile;

  if (files.length === 0) {
    return <>{emptyState}</>;
  }

  if (!navRegion || !onActivatePath) {
    return null;
  }

  return (
    <FileList
      files={files}
      mode={mode}
      selectedPath={selectedPath}
      navRegion={navRegion}
      className={className}
      onActivatePath={onActivatePath}
      getCommentCount={getCommentCount}
      getFileStatus={getFileStatus}
      renderContextMenu={renderTreeContextMenu}
    />
  );
}
