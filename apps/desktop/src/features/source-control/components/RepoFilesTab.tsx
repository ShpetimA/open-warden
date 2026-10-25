import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { ListLoadingState } from "@/components/ui/list-loading-state";
import { Spinner } from "@/components/ui/spinner";
import { countCommentsForPathInRepoContext } from "@/features/comments/selectors";
import { useGetRepoFilesQuery } from "@/features/source-control/api";
import {
  openFileViewer,
  setRepoTreeActivePath,
} from "@/features/source-control/sourceControlSlice";
import { FileList } from "./FileList";
import { errorMessageFrom } from "@/features/source-control/shared-utils/errorMessage";

export function RepoFilesTab() {
  const dispatch = useAppDispatch();
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo);
  const activePath = useAppSelector((state) => state.sourceControl.repoTreeActivePath);
  const comments = useAppSelector((state) => state.comments);
  const fileBrowserMode = useAppSelector(
    (state) => state.settings.appSettings.sourceControl.fileTreeRenderMode,
  );
  const { repoFiles, isLoadingRepoFiles, refreshingRepoFiles, filesError } = useGetRepoFilesQuery(
    activeRepo,
    {
      skip: !activeRepo,
      refetchOnFocus: true,
      refetchOnReconnect: true,
      selectFromResult: ({ currentData, isFetching, error }) => ({
        repoFiles: currentData ?? [],
        isLoadingRepoFiles: isFetching && !currentData,
        refreshingRepoFiles: isFetching && Boolean(currentData),
        filesError: currentData ? "" : errorMessageFrom(error, ""),
      }),
    },
  );
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

  return (
    <aside className="bg-surface-toolbar border-border/70 flex h-full min-h-0 flex-col overflow-hidden border-r">
      {refreshingRepoFiles ? (
        <div role="status" className="text-muted-foreground flex items-center gap-2 p-3 text-xs">
          <Spinner aria-hidden="true" className="motion-reduce:animate-none" />
          Refreshing files…
        </div>
      ) : null}
      {isLoadingRepoFiles && repoFiles.length === 0 ? (
        <ListLoadingState label="Loading repository files…" />
      ) : filesError ? (
        <p role="alert" className="text-destructive p-3 text-sm">
          {filesError}
        </p>
      ) : repoFiles.length === 0 ? (
        <div className="text-muted-foreground px-2 py-2 text-xs">No repository files found.</div>
      ) : (
        <FileList
          files={repoFiles}
          mode={fileBrowserMode}
          selectedPath={activePath}
          navRegion="repo-files"
          onActivatePath={(path) => {
            openRepoFilePath(path);
          }}
          getCommentCount={(file) =>
            countCommentsForPathInRepoContext(comments, activeRepo, file.path)
          }
        />
      )}
    </aside>
  );
}
