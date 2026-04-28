import type {
  FileTree as PierreFileTreeModel,
  FileTreeRowDecoration,
  FileTreeSortComparator,
  GitStatus,
  GitStatusEntry,
} from "@pierre/trees";

import {
  buildSourceControlFileTree,
  collectDirectoryPaths,
  type BuildSourceControlFileTreeOptions,
  type SourceControlTreeDirectoryNode,
  type SourceControlTreeNode,
} from "@/features/source-control/fileTree";
import type { Bucket, FileStatus } from "@/features/source-control/types";
import type { DisplayFile } from "./flatPierreTree";

export type PierreFileTreeBrowserFile = {
  path: string;
};

export type PierreFileTreeNavFile = {
  path: string;
  bucket?: Bucket;
  realPath?: string;
};

function toPierreSortEntry(path: string, basename: string, isDirectory: boolean) {
  const segments = path.split("/").filter(Boolean);
  return {
    basename,
    depth: Math.max(0, segments.length - 1),
    isDirectory,
    path,
    segments,
  };
}

export function buildTreeOptions<TFile extends PierreFileTreeBrowserFile>(
  compareTreeDirectories: BuildSourceControlFileTreeOptions<TFile>["compareDirectories"],
  flattenEmptyDirectories: boolean,
  sort: "default" | FileTreeSortComparator,
): BuildSourceControlFileTreeOptions<TFile> {
  return {
    compareDirectories: compareTreeDirectories,
    compareFiles:
      sort === "default"
        ? undefined
        : (left, right) =>
            sort(
              toPierreSortEntry(left.path, left.name, false),
              toPierreSortEntry(right.path, right.name, false),
            ),
    flattenEmptyDirectories,
  };
}

export function buildNavTreeOptions<TFile extends PierreFileTreeBrowserFile>(
  compareTreeDirectories: BuildSourceControlFileTreeOptions<TFile>["compareDirectories"],
  flattenEmptyDirectories: boolean,
  sort: "default" | FileTreeSortComparator,
): BuildSourceControlFileTreeOptions<PierreFileTreeNavFile> {
  return {
    compareDirectories: compareTreeDirectories
      ? (left, right, depth) =>
          compareTreeDirectories(
            left as SourceControlTreeDirectoryNode<TFile>,
            right as SourceControlTreeDirectoryNode<TFile>,
            depth,
          )
      : undefined,
    compareFiles:
      sort === "default"
        ? undefined
        : (left, right) =>
            sort(
              toPierreSortEntry(left.path, left.name, false),
              toPierreSortEntry(right.path, right.name, false),
            ),
    flattenEmptyDirectories,
  };
}

export function collectCollapsedDirectoryPaths<TFile extends PierreFileTreeBrowserFile>(
  files: ReadonlyArray<TFile>,
  model: PierreFileTreeModel,
  treeOptions: BuildSourceControlFileTreeOptions<TFile>,
) {
  const treeNodes = buildSourceControlFileTree(files, treeOptions);
  const collapsedPaths: string[] = [];

  for (const directoryPath of collectDirectoryPaths(treeNodes)) {
    const directoryItem = model.getItem(directoryPath);
    if (directoryItem && "isExpanded" in directoryItem && !directoryItem.isExpanded()) {
      collapsedPaths.push(directoryPath);
    }
  }

  return collapsedPaths;
}

export function collapseDirectoryPaths(
  model: PierreFileTreeModel,
  directoryPaths: ReadonlyArray<string>,
) {
  for (const directoryPath of directoryPaths) {
    const directoryItem = model.getItem(directoryPath);
    if (directoryItem && "collapse" in directoryItem) {
      directoryItem.collapse();
    }
  }
}

export function collectVisibleFilePaths<TFile extends PierreFileTreeBrowserFile>(
  files: ReadonlyArray<TFile>,
  model: PierreFileTreeModel,
  treeOptions: BuildSourceControlFileTreeOptions<TFile>,
) {
  return collectVisibleFiles(buildSourceControlFileTree(files, treeOptions), model).map(
    (file) => file.path,
  );
}

export function collectVisibleFiles<TFile extends PierreFileTreeBrowserFile>(
  nodes: ReadonlyArray<SourceControlTreeNode<TFile>>,
  model: PierreFileTreeModel,
): TFile[] {
  const visibleFiles: TFile[] = [];

  for (const node of nodes) {
    if (node.kind === "file") {
      visibleFiles.push(node.file);
      continue;
    }

    const directoryItem = model.getItem(node.path);
    const isExpanded =
      directoryItem && "isExpanded" in directoryItem ? directoryItem.isExpanded() : true;
    if (!isExpanded) {
      continue;
    }

    visibleFiles.push(...collectVisibleFiles(node.children, model));
  }

  return visibleFiles;
}

export function collectVisibleRowPaths<TFile extends PierreFileTreeBrowserFile>(
  nodes: ReadonlyArray<SourceControlTreeNode<TFile>>,
  model: PierreFileTreeModel,
): string[] {
  const visiblePaths: string[] = [];

  for (const node of nodes) {
    visiblePaths.push(node.path);

    if (node.kind === "file") {
      continue;
    }

    const directoryItem = model.getItem(node.path);
    const isExpanded =
      directoryItem && "isExpanded" in directoryItem ? directoryItem.isExpanded() : true;
    if (!isExpanded) {
      continue;
    }

    visiblePaths.push(...collectVisibleRowPaths(node.children, model));
  }

  return visiblePaths;
}

export function toPierreGitStatus(status: FileStatus | undefined): GitStatus | null {
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

export function buildPierreGitStatusEntries<TFile>(
  files: ReadonlyArray<TFile>,
  getPath: (file: TFile) => string,
  getStatus: (file: TFile) => FileStatus | undefined,
): GitStatusEntry[] {
  const entries: GitStatusEntry[] = [];

  for (const file of files) {
    const status = toPierreGitStatus(getStatus(file));
    if (status) {
      entries.push({ path: getPath(file), status });
    }
  }

  return entries;
}

export function buildGitStatusForDisplayFiles<TDisplay extends DisplayFile>(
  displayFiles: ReadonlyArray<TDisplay>,
  getFileStatus: (source: TDisplay["source"]) => FileStatus | undefined,
): GitStatusEntry[] {
  return buildPierreGitStatusEntries(
    displayFiles,
    (file) => file.path,
    (file) => getFileStatus(file.source),
  );
}

export function buildCommentCountDecoration<TFile>(
  getFileByPath: (path: string) => TFile | undefined,
  getCommentCount: (file: TFile) => number,
): (args: { item: { kind: string; path: string } }) => FileTreeRowDecoration | null {
  return ({ item }): FileTreeRowDecoration | null => {
    if (item.kind === "directory") {
      return null;
    }

    const file = getFileByPath(item.path);
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
  };
}
