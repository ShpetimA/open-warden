import type { ReactNode } from "react";
import type { FileTreeRowDecoration, GitStatus, GitStatusEntry } from "@pierre/trees";

import type { FileBrowserMode, FileStatus } from "@/features/source-control/types";
import { PierreFileTreeBrowser } from "./PierreFileTreeBrowser";
import { SourceControlFileTree } from "./SourceControlFileTree";

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
  if (files.length === 0) {
    return <>{emptyState}</>;
  }

  if (mode === "list") {
    const flatRows = buildFlatRows(files);

    return (
      <div className={className}>
        {flatRows.map((row, index) =>
          renderFile({
            depth: 0,
            file: row.file,
            mode,
            name: row.name,
            navIndex: index,
            path: row.path,
          }),
        )}
      </div>
    );
  }

  if (navRegion && onActivatePath) {
    const filesByPath = new Map(files.map((file) => [file.path, file]));
    const gitStatus = getFileStatus ? buildPierreGitStatus(files, getFileStatus) : undefined;

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
          renderTreeContextMenu
            ? (item, context) => {
                if (item.kind === "directory") {
                  return null;
                }
                const file = filesByPath.get(item.path);
                return file ? renderTreeContextMenu(file, item, context) : null;
              }
            : undefined
        }
      />
    );
  }

  return (
    <SourceControlFileTree
      files={files}
      className={className}
      emptyState={emptyState}
      renderFile={({ depth, file, name, navIndex, path }) =>
        renderFile({
          depth,
          file,
          mode,
          name,
          navIndex,
          path,
        })
      }
    />
  );
}

function buildPierreGitStatus<TFile extends { path: string }>(
  files: ReadonlyArray<TFile>,
  getFileStatus: (file: TFile) => FileStatus | undefined,
): GitStatusEntry[] {
  const entries: GitStatusEntry[] = [];

  for (const file of files) {
    const status = toPierreGitStatus(getFileStatus(file));
    if (status) {
      entries.push({ path: file.path, status });
    }
  }

  return entries;
}

function toPierreGitStatus(status: FileStatus | undefined): GitStatus | null {
  if (!status) {
    return null;
  }

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

function buildFlatRows<TFile extends { path: string }>(files: ReadonlyArray<TFile>) {
  const rows = files.map((file) => ({
    file,
    path: normalizePath(file.path),
    name: leafName(file.path),
  }));

  rows.sort((a, b) =>
    a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: "base" }),
  );
  return rows;
}

function normalizePath(pathValue: string): string {
  return pathValue.replaceAll("\\", "/").replace(/^\/+/, "");
}

function leafName(pathValue: string): string {
  const normalized = normalizePath(pathValue);
  const segments = normalized.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? normalized;
}
