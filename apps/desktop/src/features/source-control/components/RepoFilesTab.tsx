import { ErrorState, ErrorNotice } from "@/components/ui/error-state";
import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { ListLoadingState } from "@/components/ui/list-loading-state";
import { Spinner } from "@/components/ui/spinner";
import { countCommentsForPathInRepoContext } from "@/features/comments/selectors";
import { useGetRepoFilesQuery } from "@/features/source-control/api";
import {
  openFileViewer,
  setRepoTreeActivePath,
} from "@/features/source-control/sourceControlSlice";
import { selectRepoFilePath } from "../fileSelection";
import { FileList } from "./FileList";

export function RepoFilesTab() {
  const dispatch = useAppDispatch();
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo);
  const comments = useAppSelector((state) => state.comments);
  const fileBrowserMode = useAppSelector(
    (state) => state.settings.appSettings.sourceControl.fileTreeRenderMode,
  );
  const { repoFiles, isLoadingRepoFiles, refreshingRepoFiles, filesError, refetch } =
    useGetRepoFilesQuery(activeRepo, {
      skip: !activeRepo,
      refetchOnFocus: true,
      refetchOnReconnect: true,
      selectFromResult: ({ currentData, isFetching, error }) => ({
        repoFiles: currentData ?? [],
        isLoadingRepoFiles: isFetching && !currentData,
        refreshingRepoFiles: isFetching && Boolean(currentData),
        filesError: error,
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

  return (
    <aside className="bg-surface-toolbar border-border/70 flex h-full min-h-0 flex-col overflow-hidden border-r">
      {refreshingRepoFiles ? (
        <div role="status" className="text-muted-foreground flex items-center gap-2 p-3 text-xs">
          <Spinner aria-hidden="true" className="motion-reduce:animate-none" />
          Refreshing files…
        </div>
      ) : null}
      {filesError && repoFiles.length > 0 ? (
        <ErrorNotice
          title="Couldn’t refresh"
          error={filesError}
          recovery={{
            label: "Retry",
            onAction: () => {
              void refetch();
            },
          }}
        />
      ) : null}
      {isLoadingRepoFiles && repoFiles.length === 0 ? (
        <ListLoadingState label="Loading repository files…" />
      ) : filesError && !(repoFiles.length > 0) ? (
        <ErrorState
          title="Couldn’t load repository files"
          error={filesError}
          busy={isLoadingRepoFiles}
          recovery={{
            label: "Retry",
            onAction: () => {
              void refetch();
            },
          }}
        />
      ) : repoFiles.length === 0 ? (
        <div className="text-muted-foreground px-2 py-2 text-xs">No repository files found.</div>
      ) : (
        <FileList
          files={repoFiles}
          mode={fileBrowserMode}
          selection={selectRepoFilePath}
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
