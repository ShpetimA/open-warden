import { ScrollArea } from "@/components/ui/scroll-area";
import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { openFileViewer, setRepoTreeActivePath } from "@/features/source-control/sourceControlSlice";
import { useGetRepoFilesQuery } from "@/features/source-control/api";
import { SourceControlFileBrowser } from "./SourceControlFileBrowser";
import type { RepoFileItem } from "@/features/source-control/types";

type RepoTreeFileRowProps = {
  file: RepoFileItem;
  depth: number;
  label?: string;
  navIndex: number;
  showDirectoryPath: boolean;
};

function splitPath(path: string) {
  const normalizedPath = path.replace(/\\/g, "/");
  const pathParts = normalizedPath.split("/").filter(Boolean);
  const fileName = pathParts[pathParts.length - 1] ?? path;
  const directoryPath = pathParts.length > 1 ? pathParts.slice(0, -1).join("/") : "";
  return { fileName, directoryPath };
}

function RepoTreeFileRow({
  file,
  depth,
  label,
  navIndex,
  showDirectoryPath,
}: RepoTreeFileRowProps) {
  const dispatch = useAppDispatch();
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo);
  const activePath = useAppSelector((state) => state.sourceControl.repoTreeActivePath);
  const { fileName, directoryPath } = splitPath(file.path);
  const primaryLabel = label ?? fileName;
  const isActive = activePath === file.path;

  return (
    <div
      data-nav-index={navIndex}
      data-file-path={file.path}
      data-tree-file-row="true"
      className={`border-input flex min-w-0 items-center gap-2 overflow-hidden border-b py-1 pr-2 text-xs last:border-b-0 ${
        isActive ? "bg-surface-active" : "hover:bg-accent/60"
      }`}
      style={{ paddingLeft: `${8 + depth * 14}px` }}
    >
      <button
        type="button"
        className="w-full min-w-0 overflow-hidden text-left"
        onClick={() => {
          if (!activeRepo) {
            return;
          }

          dispatch(setRepoTreeActivePath(file.path));
          dispatch(
            openFileViewer({
              repoPath: activeRepo,
              relPath: file.path,
            }),
          );
        }}
        title={file.path}
      >
        <div className="flex min-w-0 items-center gap-2 overflow-hidden">
          <span className="text-foreground shrink-0 font-medium">{primaryLabel}</span>
          {showDirectoryPath && directoryPath ? (
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
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo);
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

  return (
    <div className="bg-surface-toolbar flex min-h-0 h-full flex-1 flex-col overflow-hidden">
      <ScrollArea data-nav-region="repo-files" className="min-h-0 h-full flex-1 overflow-hidden">
        <div className="px-3 py-1.5">
          <div className="text-foreground/80 text-[11px] font-semibold tracking-[0.14em]">FILES</div>
        </div>

        {isLoadingRepoFiles ? (
          <div className="text-muted-foreground px-2 py-2 text-xs">Loading files...</div>
        ) : null}

        <SourceControlFileBrowser
          files={repoFiles}
          mode={fileBrowserMode}
          className="space-y-0.5"
          emptyState={
            <div className="text-muted-foreground px-2 py-2 text-xs">No repository files found.</div>
          }
          renderFile={({ depth, file, mode, name, navIndex }) => (
            <RepoTreeFileRow
              key={file.path}
              file={file}
              depth={mode === "tree" ? depth : 0}
              label={mode === "tree" ? name : undefined}
              navIndex={navIndex}
              showDirectoryPath={mode !== "tree"}
            />
          )}
        />
      </ScrollArea>
    </div>
  );
}
