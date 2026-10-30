import { RetainedFileList } from "./RetainedFileList";
import { RestoreHistoryFile } from "./RestoreHistoryFile";
import { skipToken } from "@reduxjs/toolkit/query";
import { FileText } from "lucide-react";

import { useAppDispatch, useAppSelector } from "@/app/hooks";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { countCommentsForPathInRepoContext } from "@/features/comments/selectors";
import {
  useGetBranchFilesQuery,
  useGetCommitFilesQuery,
  useGetCommitHistoryQuery,
} from "@/features/source-control/api";
import { selectHistoryFile } from "@/features/source-control/actions";
import { selectHistoryFilePath } from "../fileSelection";
import { FileList } from "@/features/source-control/components/FileList";
import { setHistoryNavTarget } from "@/features/source-control/sourceControlSlice";
import { getHistoryComparison } from "@/features/source-control/historySelection";
import type { FileItem } from "@/features/source-control/types";

const EMPTY_FILES: FileItem[] = [];
const EMPTY_COMMITS: import("@/features/source-control/types").HistoryCommit[] = [];

export function HistoryFilesPane() {
  const dispatch = useAppDispatch();
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
  const fileCount =
    query.currentData === undefined
      ? query.isFetching
        ? "Loading files…"
        : "Files unavailable"
      : `${files.length} file${files.length === 1 ? "" : "s"}`;

  return (
    <aside
      onMouseDown={() => {
        dispatch(setHistoryNavTarget("files"));
      }}
      className="bg-surface-toolbar border-border/70 flex h-full min-h-0 flex-col overflow-hidden border-r"
    >
      <div className="border-border border-b px-3 py-2">
        <div className="text-foreground/80 text-[11px] font-semibold tracking-[0.14em]">
          {comparison ? "COMBINED FILES" : "COMMIT FILES"}
        </div>
        <div className="text-muted-foreground mt-1 text-xs">
          {comparison
            ? `${historySelectedCommitIds.length} commits · ${fileCount}`
            : selectedCommit
              ? `${selectedCommit.shortId} · ${fileCount}`
              : historyCommitId
                ? `${historyCommitId.slice(0, 8)} · ${fileCount}`
                : "No commit selected"}
        </div>
        {!comparison && historyCommitId ? (
          <SelectedHistoryFileRestore
            repoPath={activeRepo}
            commit={historyCommitId}
            files={files}
          />
        ) : null}
      </div>
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
        {files.length === 0 ? (
          <Empty className="h-auto border-0 p-4">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileText className="h-5 w-5" />
              </EmptyMedia>
              <EmptyTitle>No files</EmptyTitle>
              <EmptyDescription>
                {comparison
                  ? "No combined changes between these commits."
                  : historyCommitId
                    ? "No changed files in this commit."
                    : "Select a commit to view files."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <FileList
            autoFocus={false}
            files={files}
            mode={fileBrowserMode}
            selection={selectHistoryFilePath}
            navRegion="history-files"
            onActivatePath={(path) => {
              dispatch(setHistoryNavTarget("files"));
              void dispatch(selectHistoryFile(path));
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
