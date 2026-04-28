import type { FileTreeRowDecoration, GitStatusEntry } from "@pierre/trees";

import type { FileBrowserMode, FileStatus } from "@/features/source-control/types";
import {
  compareFlatPierreEntries,
  getFlatPierrePathIndex,
  toFlatPierreLeafPath,
} from "./flatPierrePaths";
import { buildPierreGitStatusEntries } from "./pierreGitStatus";

export { compareFlatPierreEntries, getFlatPierrePathIndex, toFlatPierreLeafPath };

export type DisplayFile<TSource = unknown> = {
  path: string;
  realPath: string;
  source: TSource;
};

export function toDisplayPath(mode: FileBrowserMode, realPath: string, index: number): string {
  return mode === "list" ? toFlatPierreLeafPath(realPath, index) : realPath;
}

export function buildDisplayFiles<TSource extends { path: string }>(
  mode: FileBrowserMode,
  files: ReadonlyArray<TSource>,
  options?: {
    sort?: (left: TSource, right: TSource) => number;
  },
): Array<DisplayFile<TSource>> {
  const isList = mode === "list";
  const sorted = isList && options?.sort ? [...files].sort(options.sort) : [...files];

  return sorted.map((file, index) => ({
    path: toDisplayPath(mode, file.path, index),
    realPath: file.path,
    source: file,
  }));
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
