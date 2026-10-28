import { ErrorState, ErrorNotice } from "@/components/ui/error-state";
import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { ListLoadingState } from "@/components/ui/list-loading-state";
import { Spinner } from "@/components/ui/spinner";
import { confirmDiscard } from "@/features/comments/actions";
import { useGetGitSnapshotQuery } from "@/features/source-control/api";
import {
  discardChangesGroupAction,
  discardFileAction,
  stageAllAction,
  stageFileAction,
  stageFilesAction,
  unstageAllAction,
  unstageFileAction,
  unstageFilesAction,
} from "@/features/source-control/actions";
import type { Bucket, BucketedFile, FileItem } from "@/features/source-control/types";
import { CommitBox } from "./CommitBox";
import { ChangesUnifiedPierreFileTree } from "./ChangesUnifiedPierreFileTree";

export function ChangesTab() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CommitBox />
      <ChangesFileList />
    </div>
  );
}

function toBucketedFile(file: FileItem, bucket: Bucket) {
  return {
    path: file.path,
    previousPath: file.previousPath,
    status: file.status,
    bucket,
  } satisfies BucketedFile;
}

function ChangesFileList() {
  const dispatch = useAppDispatch();
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo);
  const fileBrowserMode = useAppSelector(
    (state) => state.settings.appSettings.sourceControl.fileTreeRenderMode,
  );
  const {
    snapshot: snapshotData,
    isLoadingSnapshot,
    refreshingSnapshot,
    snapshotError,
    refetch,
  } = useGetGitSnapshotQuery(activeRepo, {
    skip: !activeRepo,
    refetchOnFocus: true,
    refetchOnReconnect: true,
    selectFromResult: ({ currentData, isFetching, error }) => ({
      snapshot: currentData,
      isLoadingSnapshot: isFetching && !currentData,
      refreshingSnapshot: isFetching && Boolean(currentData),
      snapshotError: error,
    }),
  });
  const snapshot = activeRepo ? snapshotData : undefined;

  const unstagedFiles = snapshot?.unstaged ?? [];
  const stagedFiles = snapshot?.staged ?? [];
  const untrackedFiles = snapshot?.untracked ?? [];

  const conflictFiles = unstagedFiles.filter((file) => file.status === "unmerged");
  const nonConflictUnstaged = unstagedFiles.filter((file) => file.status !== "unmerged");

  const changedFiles: BucketedFile[] = [
    ...nonConflictUnstaged.map((file) => toBucketedFile(file, "unstaged")),
    ...untrackedFiles.map((file) => toBucketedFile(file, "untracked")),
  ];
  const stagedRows: BucketedFile[] = stagedFiles
    .filter((file) => file.status !== "unmerged")
    .map((file) => toBucketedFile(file, "staged"));
  const conflictRows: BucketedFile[] = conflictFiles.map((file) =>
    toBucketedFile(file, "unstaged"),
  );
  const onStageAll = () => {
    void dispatch(stageAllAction());
  };
  const onUnstageAll = () => {
    void dispatch(unstageAllAction());
  };

  const onDiscardChangesGroup = async (files: BucketedFile[]) => {
    if (files.length === 0) return;
    if (!(await confirmDiscard(`Discard all changes in CHANGES (${files.length} files)?`))) return;
    void dispatch(discardChangesGroupAction(files));
  };

  const onStageFile = (path: string) => {
    void dispatch(stageFileAction(path));
  };

  const onUnstageFile = (path: string) => {
    void dispatch(unstageFileAction(path));
  };

  const onStageFiles = (files: BucketedFile[]) => {
    void dispatch(stageFilesAction(files));
  };

  const onUnstageFiles = (files: BucketedFile[]) => {
    void dispatch(unstageFilesAction(files));
  };

  const onDiscardFile = async (bucket: Bucket, path: string) => {
    if (!(await confirmDiscard(`Discard changes for ${path}?`))) return;
    void dispatch(discardFileAction(bucket, path));
  };

  return (
    <div className="bg-surface-toolbar flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      {refreshingSnapshot ? (
        <div role="status" className="text-muted-foreground flex items-center gap-2 p-3 text-xs">
          <Spinner aria-hidden="true" className="motion-reduce:animate-none" />
          Refreshing changes…
        </div>
      ) : null}
      {snapshotError && Boolean(snapshot) ? (
        <ErrorNotice
          title="Couldn’t refresh"
          error={snapshotError}
          recovery={{
            label: "Retry",
            onAction: () => {
              void refetch();
            },
          }}
        />
      ) : null}
      {isLoadingSnapshot && !snapshot ? (
        <ListLoadingState label="Loading changes…" />
      ) : snapshotError && !snapshot ? (
        <ErrorState
          title="Couldn’t load changes"
          error={snapshotError}
          busy={isLoadingSnapshot}
          recovery={{
            label: "Retry",
            onAction: () => {
              void refetch();
            },
          }}
        />
      ) : (
        <ChangesUnifiedPierreFileTree
          mode={fileBrowserMode}
          stagedRows={stagedRows}
          changedRows={changedFiles}
          conflictRows={conflictRows}
          activeRepo={activeRepo}
          onStageAll={onStageAll}
          onUnstageAll={onUnstageAll}
          onStageFile={onStageFile}
          onUnstageFile={onUnstageFile}
          onStageFiles={onStageFiles}
          onUnstageFiles={onUnstageFiles}
          onDiscardFile={onDiscardFile}
          onDiscardChangesGroup={onDiscardChangesGroup}
        />
      )}
    </div>
  );
}
