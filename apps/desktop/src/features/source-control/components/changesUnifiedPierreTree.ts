import type { FileTreeSortComparator } from "@pierre/trees";

import {
  buildSourceControlFileTree,
  collectDirectoryPaths,
  type SourceControlTreeDirectoryNode,
} from "@/features/source-control/fileTree";
import type { BucketedFile, FileBrowserMode } from "@/features/source-control/types";
import { getFlatPierrePathIndex, toDisplayPath } from "./flatPierreTree";
import { PIERRE_FILE_TREE_ITEM_HEIGHT } from "./PierreFileTreeBrowser";

const STAGED_ROOT = "Staged Changes";
export const STAGED_ROOT_PATH = `${STAGED_ROOT}/`;

const CHANGES_ROOT = "Changes";
export const CHANGES_ROOT_PATH = `${CHANGES_ROOT}/`;

const CONFLICTS_ROOT = "Merge Conflicts";
export const CONFLICTS_ROOT_PATH = `${CONFLICTS_ROOT}/`;

const SECTION_SORT_ORDER = new Map([
  [CONFLICTS_ROOT, 0],
  [STAGED_ROOT, 1],
  [CHANGES_ROOT, 2],
]);
const SORT_LOCALE_OPTIONS: Intl.CollatorOptions = { numeric: true, sensitivity: "base" };

export type UnifiedChangeTreeFile = BucketedFile & {
  path: string;
  realPath: string;
  sectionKey: "staged" | "unstaged" | "conflicts";
};

export function buildUnifiedChangeTreeFiles(
  stagedRows: ReadonlyArray<BucketedFile>,
  changedRows: ReadonlyArray<BucketedFile>,
  conflictRows: ReadonlyArray<BucketedFile>,
  mode: FileBrowserMode,
): UnifiedChangeTreeFile[] {
  return [
    ...conflictRows.map((file, index) => toUnifiedFile(file, "conflicts", mode, index)),
    ...stagedRows.map((file, index) => toUnifiedFile(file, "staged", mode, index)),
    ...changedRows.map((file, index) => toUnifiedFile(file, "unstaged", mode, index)),
  ];
}

function toUnifiedFile(
  file: BucketedFile,
  sectionKey: "staged" | "unstaged" | "conflicts",
  mode: FileBrowserMode,
  index: number,
): UnifiedChangeTreeFile {
  const root =
    sectionKey === "staged"
      ? STAGED_ROOT
      : sectionKey === "conflicts"
        ? CONFLICTS_ROOT
        : CHANGES_ROOT;
  return {
    ...file,
    path: `${root}/${toDisplayPath(mode, file.path, index)}`,
    realPath: file.path,
    sectionKey,
  };
}

export const compareUnifiedChangeListEntries: FileTreeSortComparator = (left, right) => {
  const sectionComparison = compareSectionNames(left.segments[0], right.segments[0]);
  if (sectionComparison !== 0) {
    return sectionComparison;
  }

  if (left.isDirectory !== right.isDirectory) {
    return left.isDirectory ? -1 : 1;
  }

  return getFlatPierrePathIndex(left.path) - getFlatPierrePathIndex(right.path);
};

export const compareUnifiedChangeTreeEntries: FileTreeSortComparator = (left, right) => {
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

export function compareUnifiedChangeTreeDirectories(
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

export function getUnifiedChangeTreeHeight(rows: ReadonlyArray<UnifiedChangeTreeFile>) {
  const treeNodes = buildSourceControlFileTree(rows, {
    compareDirectories: compareUnifiedChangeTreeDirectories,
    flattenEmptyDirectories: false,
  });
  const rowCount = rows.length + collectDirectoryPaths(treeNodes).length;
  return Math.max(PIERRE_FILE_TREE_ITEM_HEIGHT, rowCount * PIERRE_FILE_TREE_ITEM_HEIGHT + 4);
}

export function isMergeConflictPath(
  rows: ReadonlyArray<UnifiedChangeTreeFile>,
  treePath: string,
): boolean {
  const file = rows.find((row) => row.path === treePath);
  return file?.sectionKey === "conflicts";
}

export function getUnifiedChangeDirectoryContext(
  sectionPath: string,
  stagedRows: ReadonlyArray<BucketedFile>,
  changedRows: ReadonlyArray<BucketedFile>,
  conflictRows: ReadonlyArray<BucketedFile>,
) {
  const normalizedSectionPath = normalizeTreePath(sectionPath);
  const stagedRoot = normalizeTreePath(STAGED_ROOT_PATH);
  const changesRoot = normalizeTreePath(CHANGES_ROOT_PATH);
  const conflictsRoot = normalizeTreePath(CONFLICTS_ROOT_PATH);

  const sectionKey = getSectionKey(normalizedSectionPath, stagedRoot, changesRoot, conflictsRoot);
  if (!sectionKey) {
    return null;
  }

  const rootPath =
    sectionKey === "staged" ? stagedRoot : sectionKey === "conflicts" ? conflictsRoot : changesRoot;
  const sectionRows =
    sectionKey === "staged" ? stagedRows : sectionKey === "conflicts" ? conflictRows : changedRows;
  const directoryPath = normalizedSectionPath.slice(rootPath.length).replace(/^\/+/, "");
  const rows =
    directoryPath.length === 0
      ? [...sectionRows]
      : sectionRows.filter((file) => normalizeTreePath(file.path).startsWith(`${directoryPath}/`));

  return {
    isRoot: directoryPath.length === 0,
    rows,
    sectionKey,
  };
}

function getSectionKey(
  sectionPath: string,
  stagedRoot: string,
  changesRoot: string,
  conflictsRoot: string,
) {
  if (sectionPath === stagedRoot || sectionPath.startsWith(`${stagedRoot}/`)) {
    return "staged";
  }

  if (sectionPath === changesRoot || sectionPath.startsWith(`${changesRoot}/`)) {
    return "unstaged";
  }

  if (sectionPath === conflictsRoot || sectionPath.startsWith(`${conflictsRoot}/`)) {
    return "conflicts";
  }

  return null;
}

function normalizeTreePath(path: string) {
  return path.replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
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
