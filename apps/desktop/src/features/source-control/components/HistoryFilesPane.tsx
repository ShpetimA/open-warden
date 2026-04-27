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
import { useGetCommitFilesQuery, useGetCommitHistoryQuery } from "@/features/source-control/api";
import { selectHistoryFile } from "@/features/source-control/actions";
import { FileList } from "@/features/source-control/components/FileList";
import { setHistoryNavTarget } from "@/features/source-control/sourceControlSlice";
import type { FileItem } from "@/features/source-control/types";

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
    <aside
      onMouseDown={() => {
        dispatch(setHistoryNavTarget("files"));
      }}
      className="bg-surface-toolbar border-border/70 flex h-full min-h-0 flex-col overflow-hidden border-r"
    >
      <div className="border-border border-b px-3 py-2">
        <div className="text-foreground/80 text-[11px] font-semibold tracking-[0.14em]">
          COMMIT FILES
        </div>
        <div className="text-muted-foreground mt-1 text-xs">
          {selectedCommit
            ? `${selectedCommit.shortId} · ${historyFiles.length} file${historyFiles.length === 1 ? "" : "s"}`
            : "No commit selected"}
        </div>
      </div>
      {loadingHistoryFiles && files.length === 0 ? (
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
              {historyCommitId
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
            countCommentsForPathInRepoContext(comments, activeRepo, file.path)
          }
          getFileStatus={(file) => file.status}
        />
      )}
    </aside>
  );
}
