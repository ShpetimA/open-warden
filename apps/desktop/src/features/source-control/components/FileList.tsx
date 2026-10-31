import type { PierreTreeInlineEditor } from "./InlinePierreTreeRow";
import type { ReactNode } from "react";

import type { RootState } from "@/app/store";
import { SelectedPierreFileTree } from "./SelectedPierreFileTree";
import type { FileBrowserMode, FileStatus } from "@/features/source-control/types";
import { buildDisplayFiles, compareFlatPierreEntries, toDisplayPath } from "./flatPierreTree";
import { buildGitStatusForDisplayFiles } from "./pierreFileTree";
import {
  buildReviewDisplayFiles,
  compareReviewDirectories,
  compareReviewFileEntries,
} from "./reviewFileGrouping";
import { type PierreFileTreeBrowserProps } from "./PierreFileTreeBrowser";

export type FileListContextMenuItem = {
  kind: "directory" | "file";
  name: string;
  path: string;
};

export type FileListContextMenuOpenContext = import("@pierre/trees").ContextMenuOpenContext;

type FileListProps<TFile extends { path: string }> = {
  files: ReadonlyArray<TFile>;
  inlineEditor?: PierreTreeInlineEditor;
  mode: FileBrowserMode | "review";
  reviewGroupTitle?: string;
  reviewGroupHover?: ReactNode;
  autoFocus?: boolean;
  selectFirstFile?: boolean;
  initialExpansion?: "open" | "closed";
  selection: string | ((state: RootState) => string);
  navRegion: string;
  className?: string;
  onActivatePath: (path: string, file: TFile) => void;
  getCommentCount?: (file: TFile) => number;
  isViewed?: (file: TFile) => boolean;
  getFileStatus?: (file: TFile) => FileStatus | undefined;
  renderDirectoryContextMenu?: (
    item: FileListContextMenuItem,
    context: FileListContextMenuOpenContext,
  ) => ReactNode;
  renderContextMenu?: (
    file: TFile,
    item: FileListContextMenuItem,
    context: FileListContextMenuOpenContext,
  ) => ReactNode;
};

const SORT_LOCALE_OPTIONS: Intl.CollatorOptions = { numeric: true, sensitivity: "base" };

export function FileList<TFile extends { path: string }>({
  files,
  inlineEditor,
  mode,
  reviewGroupTitle,
  reviewGroupHover,
  autoFocus,
  selectFirstFile,
  initialExpansion,
  selection,
  navRegion,
  className,
  onActivatePath,
  getCommentCount,
  isViewed,
  getFileStatus,
  renderContextMenu,
  renderDirectoryContextMenu,
}: FileListProps<TFile>) {
  const isList = mode === "list";

  const displayFiles =
    mode === "review"
      ? buildReviewDisplayFiles(files, reviewGroupTitle)
      : buildDisplayFiles(mode, files, {
          sort: isList
            ? (left, right) => left.path.localeCompare(right.path, undefined, SORT_LOCALE_OPTIONS)
            : undefined,
        });

  const inlinePath = inlineEditor
    ? toDisplayPath(mode === "list" ? "list" : "tree", inlineEditor.path, displayFiles.length)
    : null;
  const displayPathBySourcePath = new Map(displayFiles.map((file) => [file.realPath, file.path]));
  const renderedFiles =
    inlineEditor && inlinePath
      ? [...displayFiles, { path: inlinePath, realPath: inlineEditor.path }]
      : displayFiles;

  const sourceByDisplayPath = new Map(displayFiles.map((file) => [file.path, file.source]));

  const groupCounts = new Map<string, number>();
  if (mode === "review") {
    for (const file of displayFiles) {
      const group = file.path.split("/")[0] ?? "";
      groupCounts.set(group, (groupCounts.get(group) ?? 0) + 1);
    }
  }

  const gitStatus = getFileStatus
    ? buildGitStatusForDisplayFiles(displayFiles, getFileStatus)
    : undefined;

  const renderRowDecoration: PierreFileTreeBrowserProps<TFile>["renderRowDecoration"] = ({
    item,
  }) => {
    if (item.kind === "directory") {
      const count = groupCounts.get(item.path.replace(/\/$/, ""));
      return count === undefined
        ? null
        : { text: String(count), title: `${count} ${count === 1 ? "file" : "files"}` };
    }
    const file = sourceByDisplayPath.get(item.path);
    if (!file) return null;
    const viewed = isViewed?.(file) ?? false;
    const commentCount = getCommentCount?.(file) ?? 0;
    if (!viewed && commentCount === 0) return null;
    return {
      text: `${viewed ? "✓" : ""}${viewed && commentCount ? " " : ""}${commentCount || ""}`,
      title: `${viewed ? "Viewed" : ""}${viewed && commentCount ? " · " : ""}${commentCount ? `${commentCount} comment${commentCount === 1 ? "" : "s"}` : ""}`,
    };
  };

  return (
    <SelectedPierreFileTree
      key={mode}
      autoFocus={autoFocus}
      selectFirstFile={selectFirstFile}
      initialExpansion={initialExpansion}
      directoryLabelPriority={reviewGroupTitle ? "start" : "end"}
      renderHoverContent={(path) =>
        path.replace(/\/$/, "") === reviewGroupTitle?.replaceAll("/", "∕").replaceAll("\\", "∖")
          ? reviewGroupHover
          : undefined
      }
      files={renderedFiles}
      inlineEditor={
        inlineEditor && inlinePath
          ? {
              path: inlinePath,
              anchorPath: inlineEditor.anchorPath
                ? (displayPathBySourcePath.get(inlineEditor.anchorPath) ?? inlineEditor.anchorPath)
                : undefined,
              children: inlineEditor.children,
            }
          : undefined
      }
      selection={selection}
      displayPathBySourcePath={displayPathBySourcePath}
      navRegion={navRegion}
      className={className}
      flattenEmptyDirectories={mode === "tree"}
      sort={
        mode === "review" ? compareReviewFileEntries : isList ? compareFlatPierreEntries : "default"
      }
      compareTreeDirectories={mode === "review" ? compareReviewDirectories : undefined}
      onActivatePath={(path) => {
        const file = sourceByDisplayPath.get(path);
        if (file) {
          onActivatePath(file.path, file);
        }
      }}
      gitStatus={gitStatus}
      renderRowDecoration={renderRowDecoration}
      rowDecorationInvalidationKey={renderRowDecoration}
      renderContextMenu={
        renderContextMenu || renderDirectoryContextMenu
          ? (item, context) => {
              if (item.kind === "directory") {
                const source = sourceByDisplayPath.get(item.path);
                return (
                  renderDirectoryContextMenu?.(
                    { ...item, path: source?.path ?? item.path },
                    context,
                  ) ?? null
                );
              }
              const file = sourceByDisplayPath.get(item.path);
              return file ? (renderContextMenu?.(file, item, context) ?? null) : null;
            }
          : undefined
      }
    />
  );
}
