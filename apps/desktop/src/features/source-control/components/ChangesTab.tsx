import { useState } from "react";
import { FilePaneEmpty, FilePaneHeader } from "./FilePaneHeader";
import { filePaneCount, filterFilePaths } from "./filePaneFilter";
import { useAppDispatch, useAppSelector } from "@/app/hooks";
import type { ReactNode } from "react";
import { RetainedFileList } from "./RetainedFileList";
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
  const [filter, setFilter] = useState("");
  const dispatch = useAppDispatch();
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo);
  const fileBrowserMode = useAppSelector(
    (state) => state.settings.appSettings.sourceControl.fileTreeRenderMode,
  );
  const { snapshot: snapshotData } = useGetGitSnapshotQuery(activeRepo, {
    skip: !activeRepo,
    refetchOnFocus: true,
    refetchOnReconnect: true,
    selectFromResult: ({ currentData }) => ({ snapshot: currentData }),
  });
  const snapshot = activeRepo ? snapshotData : undefined;

  const unstagedFiles = filterFilePaths(snapshot?.unstaged ?? [], filter);
  const stagedFiles = filterFilePaths(snapshot?.staged ?? [], filter);
  const untrackedFiles = filterFilePaths(snapshot?.untracked ?? [], filter);
  const total =
    (snapshot?.staged.length ?? 0) +
    (snapshot?.unstaged.length ?? 0) +
    (snapshot?.untracked.length ?? 0);
  const visibleCount = unstagedFiles.length + stagedFiles.length + untrackedFiles.length;

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
    void dispatch(filter.trim() ? stageFilesAction(changedFiles) : stageAllAction());
  };
  const onUnstageAll = () => {
    void dispatch(filter.trim() ? unstageFilesAction(stagedRows) : unstageAllAction());
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
    <>
      <FilePaneHeader
        title="Changed files"
        summary={snapshot ? filePaneCount(visibleCount, total) : undefined}
        filter={filter}
        onFilterChange={setFilter}
      />
      <ChangesFileReadState repoPath={activeRepo}>
        {visibleCount === 0 ? (
          <FilePaneEmpty
            filtered={Boolean(filter.trim())}
            description="Your working tree is clean. New edits will appear here."
            onClear={() => setFilter("")}
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
      </ChangesFileReadState>
    </>
  );
}

function ChangesFileReadState({ repoPath, children }: { repoPath: string; children: ReactNode }) {
  const { hasData, fetching, error, refetch } = useGetGitSnapshotQuery(repoPath, {
    skip: !repoPath,
    selectFromResult: ({ currentData, isFetching, error }) => ({
      hasData: Boolean(currentData),
      fetching: isFetching,
      error,
    }),
  });
  return (
    <RetainedFileList
      hasData={hasData}
      fetching={fetching}
      error={error}
      loadingLabel="Loading changes…"
      errorTitle="Couldn’t load changes"
      onRetry={() => {
        void refetch();
      }}
    >
      {children}
    </RetainedFileList>
  );
}
