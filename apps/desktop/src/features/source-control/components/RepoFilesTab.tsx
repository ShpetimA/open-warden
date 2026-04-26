import type { FileTreeRowDecoration } from "@pierre/trees";

import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { countCommentsForPathInRepoContext } from "@/features/comments/selectors";
import { useGetRepoFilesQuery } from "@/features/source-control/api";
import {
  openFileViewer,
  setRepoTreeActivePath,
} from "@/features/source-control/sourceControlSlice";
import type { RepoFileItem } from "@/features/source-control/types";
import { FileListPane, type FileListPaneRowArgs } from "./FileListPane";
import { PierreFileTreeBrowser } from "./PierreFileTreeBrowser";

type RepoTreeFileRowProps = {
  row: FileListPaneRowArgs<RepoFileItem>;
};

function splitPath(path: string) {
  const normalizedPath = path.replace(/\\/g, "/");
  const pathParts = normalizedPath.split("/").filter(Boolean);
  const fileName = pathParts[pathParts.length - 1] ?? path;
  const directoryPath = pathParts.length > 1 ? pathParts.slice(0, -1).join("/") : "";
  return { fileName, directoryPath };
}

function RepoTreeFileRow({ row }: RepoTreeFileRowProps) {
  const dispatch = useAppDispatch();
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo);
  const isActive = useAppSelector(
    (state) => state.sourceControl.repoTreeActivePath === row.file.path,
  );
  const { fileName, directoryPath } = splitPath(row.file.path);
  const primaryLabel = row.label ?? fileName;

  return (
    <div
      data-nav-index={row.navIndex}
      data-file-path={row.file.path}
      data-tree-file-row="true"
      className={`border-input flex min-w-0 items-center gap-2 overflow-hidden border-b py-1 pr-2 text-xs last:border-b-0 ${
        isActive ? "bg-surface-active" : "hover:bg-accent/60"
      }`}
      style={{ paddingLeft: `${8 + row.depth * 14}px` }}
    >
      <button
        type="button"
        className="w-full min-w-0 overflow-hidden text-left"
        onClick={() => {
          if (!activeRepo) {
            return;
          }

          dispatch(setRepoTreeActivePath(row.file.path));
          dispatch(
            openFileViewer({
              repoPath: activeRepo,
              relPath: row.file.path,
            }),
          );
        }}
        title={row.file.path}
      >
        <div className="flex min-w-0 items-center gap-2 overflow-hidden">
          <span className="text-foreground shrink-0 font-medium">{primaryLabel}</span>
          {row.showDirectoryPath && directoryPath ? (
            <span className="text-muted-foreground block min-w-0 flex-1 truncate whitespace-nowrap">
              {` ${directoryPath}`}
            </span>
          ) : null}
        </div>
      </button>
    </div>
  );
}

export function RepoFilesTab() {
  const dispatch = useAppDispatch();
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo);
  const activePath = useAppSelector((state) => state.sourceControl.repoTreeActivePath);
  const comments = useAppSelector((state) => state.comments);
  const fileBrowserMode = useAppSelector(
    (state) => state.settings.appSettings.sourceControl.fileTreeRenderMode,
  );
  const { repoFiles, isLoadingRepoFiles } = useGetRepoFilesQuery(activeRepo, {
    skip: !activeRepo,
    refetchOnFocus: true,
    refetchOnReconnect: true,
    selectFromResult: ({ data, isLoading }) => ({
      repoFiles: data ?? [],
      isLoadingRepoFiles: isLoading,
    }),
  });
  const openRepoFilePath = (path: string) => {
    if (!activeRepo) {
      dispatch(setRepoTreeActivePath(path));
      return;
    }

    dispatch(
      openFileViewer({
        repoPath: activeRepo,
        relPath: path,
      }),
    );
  };
  const filesByPath = new Map(repoFiles.map((file) => [file.path, file]));

  if (fileBrowserMode === "tree") {
    return (
      <aside className="bg-surface-toolbar border-border/70 flex h-full min-h-0 flex-col overflow-hidden border-r">
        {isLoadingRepoFiles && repoFiles.length === 0 ? (
          <div className="text-muted-foreground px-2 py-2 text-xs">Loading files...</div>
        ) : repoFiles.length === 0 ? (
          <div className="text-muted-foreground px-2 py-2 text-xs">No repository files found.</div>
        ) : (
          <PierreFileTreeBrowser
            files={repoFiles}
            selectedPath={activePath}
            navRegion="repo-files"
            onActivatePath={(path) => {
              openRepoFilePath(path);
            }}
            renderRowDecoration={({ item }): FileTreeRowDecoration | null => {
              if (item.kind === "directory") {
                return null;
              }

              const file = filesByPath.get(item.path);
              if (!file) {
                return null;
              }

              const commentCount = countCommentsForPathInRepoContext(
                comments,
                activeRepo,
                file.path,
              );
              return commentCount > 0
                ? {
                    text: String(commentCount),
                    title: `${commentCount} comment${commentCount === 1 ? "" : "s"}`,
                  }
                : null;
            }}
          />
        )}
      </aside>
    );
  }

  return (
    <FileListPane
      navRegion="repo-files"
      files={repoFiles}
      mode={fileBrowserMode}
      isLoading={isLoadingRepoFiles}
      loadingState={<div className="text-muted-foreground px-2 py-2 text-xs">Loading files...</div>}
      emptyState={
        <div className="text-muted-foreground px-2 py-2 text-xs">No repository files found.</div>
      }
      headerClassName="px-3 py-1.5"
      bodyClassName="space-y-0.5"
      renderRow={(row) => <RepoTreeFileRow key={row.file.path} row={row} />}
    />
  );
}
