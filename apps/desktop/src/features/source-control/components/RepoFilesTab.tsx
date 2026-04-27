import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { countCommentsForPathInRepoContext } from "@/features/comments/selectors";
import { useGetRepoFilesQuery } from "@/features/source-control/api";
import {
  openFileViewer,
  setRepoTreeActivePath,
} from "@/features/source-control/sourceControlSlice";
import { FileList } from "./FileList";

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

  return (
    <aside className="bg-surface-toolbar border-border/70 flex h-full min-h-0 flex-col overflow-hidden border-r">
      {isLoadingRepoFiles && repoFiles.length === 0 ? (
        <div className="text-muted-foreground px-2 py-2 text-xs">Loading files...</div>
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
