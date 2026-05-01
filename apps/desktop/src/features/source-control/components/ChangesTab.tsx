import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  const { snapshot: snapshotData, isLoadingSnapshot } = useGetGitSnapshotQuery(activeRepo, {
    skip: !activeRepo,
    refetchOnFocus: true,
    refetchOnReconnect: true,
    selectFromResult: ({ data, isLoading }) => ({
      snapshot: data,
      isLoadingSnapshot: isLoading,
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
    <div className="bg-surface-toolbar flex min-h-0 h-full flex-1 flex-col overflow-hidden">
      <ScrollArea data-nav-region="changes-files" className="min-h-0 h-full flex-1 overflow-hidden">
        <div>
          {isLoadingSnapshot ? (
            <div className="text-muted-foreground px-2 py-2 text-xs">Loading changes...</div>
          ) : null}
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
        </div>
      </ScrollArea>
    </div>
  );
}
