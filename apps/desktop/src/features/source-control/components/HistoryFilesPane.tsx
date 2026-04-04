import { skipToken } from "@reduxjs/toolkit/query";
import { FileText } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import { FileListRow } from "./FileListRow";
import { SourceControlFileBrowser } from "./SourceControlFileBrowser";

export function HistoryFilesPane() {
  const dispatch = useAppDispatch();
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo);
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
        <div className="text-muted-foreground mt-1 truncate text-xs">
          {selectedCommit
            ? `${selectedCommit.shortId} · ${historyFiles.length} file${historyFiles.length === 1 ? "" : "s"}`
            : "No commit selected"}
        </div>
      </div>

      <ScrollArea data-nav-region="history-files" className="min-h-0 flex-1 overflow-hidden">
        {loadingHistoryFiles ? (
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
          <SourceControlFileBrowser
            files={files}
            mode={fileBrowserMode}
            className="space-y-0.5 p-0.5"
            renderFile={({ depth, file, mode, name, navIndex }) => (
              <HistoryFileRow
                key={`${file.path}:${file.status}`}
                file={file}
                depth={mode === "tree" ? depth : 0}
                label={mode === "tree" ? name : undefined}
                navIndex={navIndex}
                showDirectoryPath={mode !== "tree"}
                activeRepo={activeRepo}
              />
            )}
          />
        )}
      </ScrollArea>
    </aside>
  );
}

type HistoryFileRowProps = {
  file: FileItem;
  depth: number;
  label?: string;
  navIndex: number;
  showDirectoryPath: boolean;
  activeRepo: string;
};

function HistoryFileRow({
  file,
  depth,
  label,
  navIndex,
  showDirectoryPath,
  activeRepo,
}: HistoryFileRowProps) {
  const dispatch = useAppDispatch();
  const commentCount = useAppSelector((state) =>
    countCommentsForPathInRepoContext(state.comments, activeRepo, file.path),
  );
  const isActive = useAppSelector((state) => state.sourceControl.activePath === file.path);

  return (
    <FileListRow
      path={file.path}
      status={file.status}
      commentCount={commentCount}
      isActive={isActive}
      navIndex={navIndex}
      depth={depth}
      label={label}
      showDirectoryPath={showDirectoryPath}
      onSelect={() => {
        dispatch(setHistoryNavTarget("files"));
        void dispatch(selectHistoryFile(file.path));
      }}
      secondaryLabel={
        file.previousPath && file.previousPath !== file.path
          ? `from ${file.previousPath}`
          : undefined
      }
    />
  );
}
