import { useState } from "react";
import { FilePaneEmpty, FilePaneHeader } from "./FilePaneHeader";
import { filePaneCount, filterFilePaths } from "./filePaneFilter";
import { RetainedFileList } from "./RetainedFileList";
import { RestoreHistoryFile } from "./RestoreHistoryFile";
import { skipToken } from "@reduxjs/toolkit/query";

import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { countCommentsForPathInRepoContext } from "@/features/comments/selectors";
import {
  useGetBranchFilesQuery,
  useGetCommitFilesQuery,
  useGetCommitHistoryQuery,
} from "@/features/source-control/api";
import { selectHistoryFilePath } from "../fileSelection";
import { FileList } from "@/features/source-control/components/FileList";
import { setActivePath, setHistoryNavTarget } from "@/features/source-control/sourceControlSlice";
import { getHistoryComparison } from "@/features/source-control/historySelection";
import type { FileItem } from "@/features/source-control/types";

const EMPTY_FILES: FileItem[] = [];
const EMPTY_COMMITS: import("@/features/source-control/types").HistoryCommit[] = [];

export function HistoryFilesPane() {
  const dispatch = useAppDispatch();
  const [filter, setFilter] = useState("");
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo);
  const comments = useAppSelector((state) => state.comments);
  const historyCommitId = useAppSelector((state) => state.sourceControl.historyCommitId);
  const historySelectedCommitIds = useAppSelector(
    (state) => state.sourceControl.historySelectedCommitIds,
  );
  const fileBrowserMode = useAppSelector(
    (state) => state.settings.appSettings.sourceControl.fileTreeRenderMode,
  );
  const { historyCommits } = useGetCommitHistoryQuery(
    activeRepo ? { repoPath: activeRepo } : skipToken,
    {
      selectFromResult: ({ currentData }) => ({ historyCommits: currentData ?? EMPTY_COMMITS }),
    },
  );
  const comparison = getHistoryComparison(historyCommits, historySelectedCommitIds);
  const commitFiles = useGetCommitFilesQuery(
    activeRepo && historyCommitId && !comparison
      ? { repoPath: activeRepo, commitId: historyCommitId }
      : skipToken,
    { selectFromResult: fileReadFields },
  );
  const comparedFiles = useGetBranchFilesQuery(
    activeRepo && comparison
      ? { repoPath: activeRepo, baseRef: comparison.baseRef, headRef: comparison.headRef }
      : skipToken,
    { selectFromResult: fileReadFields },
  );
  const selectedCommit = historyCommits.find((commit) => commit.commitId === historyCommitId);
  const query = comparison ? comparedFiles : commitFiles;
  const files = query.currentData ?? EMPTY_FILES;
  const visibleFiles = filterFilePaths(files, filter);
  const summary =
    query.currentData === undefined ? undefined : filePaneCount(visibleFiles.length, files.length);
  let description = "Select a commit to view files.";
  let emptyDescription = "Select a commit to view files.";

  if (historyCommitId) description = selectedCommit?.shortId ?? historyCommitId.slice(0, 8);
  if (historyCommitId) emptyDescription = "No changed files in this commit.";
  if (comparison) {
    description = `${historySelectedCommitIds.length} selected commits`;
    emptyDescription = "No combined changes between these commits.";
  }

  return (
    <aside
      onMouseDown={() => {
        dispatch(setHistoryNavTarget("files"));
      }}
      className="bg-surface-toolbar border-border/70 flex h-full min-h-0 flex-col overflow-hidden border-r"
    >
      <FilePaneHeader
        title={comparison ? "Combined files" : "Commit files"}
        summary={summary}
        description={description}
        filter={filter}
        onFilterChange={setFilter}
        actions={
          !comparison && historyCommitId ? (
            <SelectedHistoryFileRestore
              repoPath={activeRepo}
              commit={historyCommitId}
              files={files}
            />
          ) : undefined
        }
      />
      <RetainedFileList
        hasData={query.currentData !== undefined}
        fetching={query.isFetching}
        error={query.error}
        loadingLabel="Loading commit files…"
        errorTitle={
          comparison ? "Couldn’t load combined files" : "Couldn’t load this commit’s files"
        }
        onRetry={() => {
          void query.refetch();
        }}
      >
        {visibleFiles.length === 0 ? (
          <FilePaneEmpty
            filtered={Boolean(filter.trim())}
            onClear={() => setFilter("")}
            description={emptyDescription}
          />
        ) : (
          <FileList
            selectFirstFile
            autoFocus={false}
            files={visibleFiles}
            mode={fileBrowserMode}
            selection={selectHistoryFilePath}
            navRegion="history-files"
            onActivatePath={(path) => {
              dispatch(setActivePath(path));
            }}
            getCommentCount={(file) =>
              countCommentsForPathInRepoContext(
                comments,
                activeRepo,
                file.path,
                comparison
                  ? {
                      kind: "history-range",
                      baseRef: comparison.baseRef,
                      headRef: comparison.headRef,
                    }
                  : historyCommitId
                    ? { kind: "history", commitId: historyCommitId }
                    : undefined,
              )
            }
            getFileStatus={(file) => file.status}
          />
        )}
      </RetainedFileList>
    </aside>
  );
}

function SelectedHistoryFileRestore({
  repoPath,
  commit,
  files,
}: {
  repoPath: string;
  commit: string;
  files: readonly FileItem[];
}) {
  const activePath = useAppSelector(selectHistoryFilePath);
  if (!activePath || !files.some((file) => file.path === activePath)) return null;
  return <RestoreHistoryFile repoPath={repoPath} commit={commit} path={activePath} />;
}

function fileReadFields(result: {
  currentData?: FileItem[];
  isFetching: boolean;
  error?: unknown;
}) {
  return { currentData: result.currentData, isFetching: result.isFetching, error: result.error };
}
