import type { ReactNode } from "react";

import type { RootState } from "@/app/store";
import { SelectedPierreFileTree } from "./SelectedPierreFileTree";
import type { FileBrowserMode, FileStatus } from "@/features/source-control/types";
import { buildDisplayFiles, compareFlatPierreEntries } from "./flatPierreTree";
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

export type FileListContextMenuOpenContext = {
  close: (options?: { restoreFocus?: boolean }) => void;
};

type FileListProps<TFile extends { path: string }> = {
  files: ReadonlyArray<TFile>;
  mode: FileBrowserMode | "review";
  reviewGroupTitle?: string;
  reviewGroupHover?: ReactNode;
  autoFocus?: boolean;
  selectFirstFile?: boolean;
  selection: string | ((state: RootState) => string);
  navRegion: string;
  className?: string;
  onActivatePath: (path: string, file: TFile) => void;
  getCommentCount?: (file: TFile) => number;
  isViewed?: (file: TFile) => boolean;
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
  reviewGroupTitle,
  reviewGroupHover,
  autoFocus,
  selectFirstFile,
  selection,
  navRegion,
  className,
  onActivatePath,
  getCommentCount,
  isViewed,
  getFileStatus,
  renderContextMenu,
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

  const sourceByDisplayPath = new Map(displayFiles.map((file) => [file.path, file.source]));

  const displayPathBySourcePath = new Map(displayFiles.map((file) => [file.realPath, file.path]));
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
      directoryLabelPriority={reviewGroupTitle ? "start" : "end"}
      renderHoverContent={(path) =>
        path.replace(/\/$/, "") === reviewGroupTitle?.replaceAll("/", "∕").replaceAll("\\", "∖")
          ? reviewGroupHover
          : undefined
      }
      files={displayFiles}
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
