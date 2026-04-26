import { skipToken } from "@reduxjs/toolkit/query";
import { FileText } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/app/hooks";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { countCommentsForPathInRepoContext } from "@/features/comments/selectors";
import { useGetCommitFilesQuery, useGetCommitHistoryQuery } from "@/features/source-control/api";
import { selectHistoryFile } from "@/features/source-control/actions";
import { setHistoryNavTarget } from "@/features/source-control/sourceControlSlice";
import type { FileItem } from "@/features/source-control/types";
import { FileListPane, type FileListPaneRowArgs } from "./FileListPane";
import { FileListRow } from "./FileListRow";

export function HistoryFilesPane() {
  const dispatch = useAppDispatch();
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo);
  const activePath = useAppSelector((state) => state.sourceControl.activePath);
  const comments = useAppSelector((state) => state.comments);
  const historyCommitId = useAppSelector((state) => state.sourceControl.historyCommitId);
  const fileBrowserMode = useAppSelector(
    (state) => state.settings.appSettings.sourceControl.fileTreeRenderMode,
  );
  const { historyCommits } = useGetCommitHistoryQuery(
    activeRepo ? { repoPath: activeRepo } : skipToken,
    {
      selectFromResult: ({ data }) => ({ historyCommits: data ?? [] }),
    },
  );
  const { historyFiles, loadingHistoryFiles } = useGetCommitFilesQuery(
    activeRepo && historyCommitId ? { repoPath: activeRepo, commitId: historyCommitId } : skipToken,
    {
      selectFromResult: ({ data, isFetching }) => ({
        historyFiles: data ?? [],
        loadingHistoryFiles: isFetching,
      }),
    },
  );

  const selectedCommit = historyCommits.find((commit) => commit?.commitId === historyCommitId);
  const files = historyFiles as FileItem[];

  return (
    <FileListPane
      title="COMMIT FILES"
      subtitle={
        selectedCommit
          ? `${selectedCommit.shortId} · ${historyFiles.length} file${historyFiles.length === 1 ? "" : "s"}`
          : "No commit selected"
      }
      navRegion="history-files"
      files={files}
      mode={fileBrowserMode}
      activePath={activePath}
      onSelectFile={(file) => {
        dispatch(setHistoryNavTarget("files"));
        void dispatch(selectHistoryFile(file.path));
      }}
      onActivateFile={(file) => {
        dispatch(setHistoryNavTarget("files"));
        void dispatch(selectHistoryFile(file.path));
      }}
      getCommentCount={(file) => countCommentsForPathInRepoContext(comments, activeRepo, file.path)}
      getFileStatus={(file) => file.status}
      isLoading={loadingHistoryFiles}
      loadingState={
        <Empty className="h-auto border-0 p-4">
          <EmptyHeader>
            <EmptyDescription>Loading files...</EmptyDescription>
          </EmptyHeader>
        </Empty>
      }
      emptyState={
        <Empty className="h-auto border-0 p-4">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileText className="h-5 w-5" />
            </EmptyMedia>
            <EmptyTitle>No files</EmptyTitle>
            <EmptyDescription>
              {historyCommitId
                ? "No changed files in this commit."
                : "Select a commit to view files."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      }
      bodyClassName="space-y-0.5 p-0.5"
      onMouseDown={() => {
        dispatch(setHistoryNavTarget("files"));
      }}
      renderRow={(row) => (
        <HistoryFileRow
          key={`${row.file.path}:${row.file.status}`}
          row={row}
          activeRepo={activeRepo}
        />
      )}
    />
  );
}

type HistoryFileRowProps = {
  row: FileListPaneRowArgs<FileItem>;
  activeRepo: string;
};

function HistoryFileRow({ row, activeRepo }: HistoryFileRowProps) {
  const dispatch = useAppDispatch();
  const commentCount = useAppSelector((state) =>
    countCommentsForPathInRepoContext(state.comments, activeRepo, row.file.path),
  );
  const isActive = useAppSelector((state) => state.sourceControl.activePath === row.file.path);

  return (
    <FileListRow
      path={row.file.path}
      status={row.file.status}
      commentCount={commentCount}
      isActive={isActive}
      navIndex={row.navIndex}
      depth={row.depth}
      label={row.label}
      showDirectoryPath={row.showDirectoryPath}
      onSelect={() => {
        dispatch(setHistoryNavTarget("files"));
        void dispatch(selectHistoryFile(row.file.path));
      }}
      secondaryLabel={
        row.file.previousPath && row.file.previousPath !== row.file.path
          ? `from ${row.file.previousPath}`
          : undefined
      }
    />
  );
}
