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
import { FileList } from "@/features/source-control/components/FileList";
import { setHistoryNavTarget } from "@/features/source-control/sourceControlSlice";
import { getHistoryComparison } from "@/features/source-control/historySelection";
import type { FileItem } from "@/features/source-control/types";

export function HistoryFilesPane() {
  const dispatch = useAppDispatch();
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo);
  const activePath = useAppSelector((state) => state.sourceControl.activePath);
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
      selectFromResult: ({ data }) => ({ historyCommits: data ?? [] }),
    },
  );
  const comparison = getHistoryComparison(historyCommits, historySelectedCommitIds);
  const { data: historyFiles = [], isFetching: loadingHistoryFiles } = useGetCommitFilesQuery(
    activeRepo && historyCommitId && !comparison
      ? { repoPath: activeRepo, commitId: historyCommitId }
      : skipToken,
  );
  const { data: combinedFiles = [], isFetching: loadingCombinedFiles } = useGetBranchFilesQuery(
    activeRepo && comparison
      ? { repoPath: activeRepo, baseRef: comparison.baseRef, headRef: comparison.headRef }
      : skipToken,
  );

  const selectedCommit = historyCommits.find((commit) => commit?.commitId === historyCommitId);
  const files = (comparison ? combinedFiles : historyFiles) as FileItem[];
  const loadingFiles = comparison ? loadingCombinedFiles : loadingHistoryFiles;

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
            ? `${historySelectedCommitIds.length} commits · ${files.length} file${files.length === 1 ? "" : "s"}`
            : selectedCommit
              ? `${selectedCommit.shortId} · ${files.length} file${files.length === 1 ? "" : "s"}`
              : "No commit selected"}
        </div>
      </div>
      {loadingFiles && files.length === 0 ? (
        <Empty className="h-auto border-0 p-4">
          <EmptyHeader>
            <EmptyDescription>Loading files...</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : files.length === 0 ? (
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
          files={files}
          mode={fileBrowserMode}
          selectedPath={activePath}
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
    </aside>
  );
}
