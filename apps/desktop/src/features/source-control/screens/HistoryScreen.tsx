import { skipToken } from "@reduxjs/toolkit/query";

import { useAppSelector } from "@/app/hooks";
import { ResizableSidebarLayout } from "@/components/layout/ResizableSidebarLayout";
import { DiffWorkspace } from "@/features/diff-view/DiffWorkspace";
import { LspStatusNotice } from "@/features/lsp/components/LspStatusNotice";
import { useCurrentLspDocument } from "@/features/lsp/hooks/useCurrentLspDocument";
import { useDiffDiagnostics } from "@/features/lsp/hooks/useDiffDiagnostics";
import {
  useGetCommitFilesQuery,
  useGetCommitFileVersionsQuery,
} from "@/features/source-control/api";
import { HistoryFilesPane } from "@/features/source-control/components/HistoryFilesPane";
import { useHistoryKeyboardNav } from "@/features/source-control/hooks/useHistoryKeyboardNav";
import { useHistorySync } from "@/features/source-control/hooks/useHistorySync";
import { useThrottledDiffSelection } from "@/features/source-control/hooks/useThrottledDiffSelection";
import { errorMessageFrom } from "@/features/source-control/shared-utils/errorMessage";

export function HistoryScreen() {
  useHistoryKeyboardNav();

  return (
    <>
      <HistorySelectionSync />
      <ResizableSidebarLayout
        panelId="history-files"
        sidebarDefaultSize={24}
        sidebarMinSize={16}
        sidebarMaxSize={40}
        sidebar={<HistoryFilesPane />}
        content={<HistoryDiffPane />}
      />
    </>
  );
}

function HistorySelectionSync() {
  useHistorySync();
  return null;
}

function HistoryDiffPane() {
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo);
  const historyCommitId = useAppSelector((state) => state.sourceControl.historyCommitId);
  const activePath = useAppSelector((state) => state.sourceControl.activePath);
  const diffFocusTarget = useAppSelector((state) => state.sourceControl.diffFocusTarget);
  const { data: historyFiles } = useGetCommitFilesQuery(
    activeRepo && historyCommitId ? { repoPath: activeRepo, commitId: historyCommitId } : skipToken,
  );

  const selectedHistoryFile = historyFiles?.find((file) => file.path === activePath);
  const previewSelection = useThrottledDiffSelection(
    historyCommitId && activePath
      ? {
          commitId: historyCommitId,
          path: activePath,
          previousPath: selectedHistoryFile?.previousPath ?? undefined,
        }
      : null,
  );
  const historyFileVersions = useGetCommitFileVersionsQuery(
    activeRepo && previewSelection
      ? {
          repoPath: activeRepo,
          commitId: previewSelection.commitId,
          relPath: previewSelection.path,
          previousPath: previewSelection.previousPath,
        }
      : skipToken,
  );
  const fileVersions = historyFileVersions.currentData ?? historyFileVersions.data;
  const loadingPatch = !fileVersions && historyFileVersions.isFetching;
  const oldFile = fileVersions?.oldFile ?? null;
  const newFile = fileVersions?.newFile ?? null;
  const errorMessage = fileVersions ? "" : errorMessageFrom(historyFileVersions.error, "");
  const previewPath = previewSelection?.path ?? "";
  const lspText = !loadingPatch && newFile ? newFile.contents : null;
  const lspHoverDocument =
    activeRepo && previewPath && lspText !== null
      ? { repoPath: activeRepo, relPath: previewPath }
      : undefined;

  useCurrentLspDocument(activeRepo, previewPath, lspText);

  const lspDiagnostics = useDiffDiagnostics(activeRepo, previewPath);
  const focusedLineNumber =
    diffFocusTarget?.kind === "history" && diffFocusTarget.path === previewPath
      ? diffFocusTarget.lineNumber
      : null;
  const focusedLineIndex =
    diffFocusTarget?.kind === "history" && diffFocusTarget.path === previewPath
      ? diffFocusTarget.lineIndex
      : null;
  const focusedLineKey =
    diffFocusTarget?.kind === "history" && diffFocusTarget.path === previewPath
      ? diffFocusTarget.focusKey
      : null;

  return (
    <section className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1">
        {errorMessage ? (
          <div className="text-destructive p-3 text-sm">{errorMessage}</div>
        ) : loadingPatch ? (
          <div className="text-muted-foreground p-3 text-sm">Loading diff...</div>
        ) : !activePath ? (
          <div className="text-muted-foreground p-3 text-sm">
            Select a commit file to view diff.
          </div>
        ) : !oldFile && !newFile ? (
          <div className="text-muted-foreground p-3 text-sm">No diff content.</div>
        ) : (
          <div className="flex h-full min-h-0 min-w-0 flex-col">
            <LspStatusNotice repoPath={activeRepo} relPath={previewPath} active />
            <DiffWorkspace
              oldFile={oldFile}
              newFile={newFile}
              activePath={previewPath}
              commentContext={
                historyCommitId
                  ? { kind: "history", commitId: historyCommitId }
                  : { kind: "changes" }
              }
              canComment={Boolean(historyCommitId)}
              lspDiagnostics={lspDiagnostics}
              fileViewerRevision={historyCommitId}
              lspHoverDocument={lspHoverDocument}
              lspJumpContextKind="history"
              focusedLineNumber={focusedLineNumber}
              focusedLineIndex={focusedLineIndex}
              focusedLineKey={focusedLineKey}
            />
          </div>
        )}
      </div>
    </section>
  );
}
