import { ErrorNotice, ErrorState } from "@/components/ui/error-state";
import { skipToken } from "@reduxjs/toolkit/query";
import { useLayoutEffect } from "react";
import { useLocation } from "react-router";

import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { ResizableSidebarLayout } from "@/components/layout/ResizableSidebarLayout";
import { DiffWorkspace } from "@/features/diff-view/DiffWorkspace";
import { LspStatusNotice } from "@/features/lsp/components/LspStatusNotice";
import { useCurrentLspDocument } from "@/features/lsp/hooks/useCurrentLspDocument";
import { useDiffDiagnostics } from "@/features/lsp/hooks/useDiffDiagnostics";
import {
  useGetBranchFileVersionsQuery,
  useGetBranchFilesQuery,
  useGetCommitFileVersionsQuery,
  useGetCommitFilesQuery,
  useGetCommitHistoryQuery,
} from "@/features/source-control/api";
import { HistoryFilesPane } from "@/features/source-control/components/HistoryFilesPane";
import { getHistoryComparison } from "@/features/source-control/historySelection";
import { useHistoryKeyboardNav } from "@/features/source-control/hooks/useHistoryKeyboardNav";
import { useHistorySync } from "@/features/source-control/hooks/useHistorySync";
import { selectHistoryPullRequestCommit } from "@/features/source-control/actions";
import { useThrottledDiffSelection } from "@/features/source-control/hooks/useThrottledDiffSelection";
import { getTextFile } from "@/platform/desktop/fileContent";

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
  const dispatch = useAppDispatch();
  const location = useLocation();
  const commitId = new URLSearchParams(location.search).get("commit");
  useLayoutEffect(() => {
    if (commitId && /^[a-f0-9]{40,64}$/.test(commitId)) {
      void dispatch(selectHistoryPullRequestCommit(commitId));
    }
  }, [commitId, dispatch]);
  useHistorySync();
  return null;
}

function HistoryDiffPane() {
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo);
  const historyCommitId = useAppSelector((state) => state.sourceControl.historyCommitId);
  const historySelectedCommitIds = useAppSelector(
    (state) => state.sourceControl.historySelectedCommitIds,
  );
  const activePath = useAppSelector((state) => state.sourceControl.activePath);
  const diffFocusTarget = useAppSelector((state) => state.sourceControl.diffFocusTarget);
  const { currentData: historyCommits = [] } = useGetCommitHistoryQuery(
    activeRepo ? { repoPath: activeRepo } : skipToken,
  );
  const comparison = getHistoryComparison(historyCommits, historySelectedCommitIds);
  const { currentData: historyFiles = [] } = useGetCommitFilesQuery(
    activeRepo && historyCommitId && !comparison
      ? { repoPath: activeRepo, commitId: historyCommitId }
      : skipToken,
  );
  const { currentData: combinedFiles = [] } = useGetBranchFilesQuery(
    activeRepo && comparison
      ? { repoPath: activeRepo, baseRef: comparison.baseRef, headRef: comparison.headRef }
      : skipToken,
  );
  const visibleFiles = comparison ? combinedFiles : historyFiles;
  const selectedHistoryFile = visibleFiles.find((file) => file.path === activePath);
  const previewSelection = useThrottledDiffSelection({
    commitId: comparison ? "" : historyCommitId,
    baseRef: comparison?.baseRef ?? "",
    headRef: comparison?.headRef ?? "",
    path: activePath,
    previousPath: selectedHistoryFile?.previousPath ?? "",
  });
  const rangePreview = Boolean(previewSelection.baseRef && previewSelection.headRef);
  const historyFileVersions = useGetCommitFileVersionsQuery(
    activeRepo && !rangePreview && previewSelection.commitId && previewSelection.path
      ? {
          repoPath: activeRepo,
          commitId: previewSelection.commitId,
          relPath: previewSelection.path,
          previousPath: previewSelection.previousPath || undefined,
        }
      : skipToken,
  );
  const combinedFileVersions = useGetBranchFileVersionsQuery(
    activeRepo &&
      rangePreview &&
      previewSelection.baseRef &&
      previewSelection.headRef &&
      previewSelection.path
      ? {
          repoPath: activeRepo,
          baseRef: previewSelection.baseRef,
          headRef: previewSelection.headRef,
          relPath: previewSelection.path,
          previousPath: previewSelection.previousPath || undefined,
        }
      : skipToken,
  );
  const query = rangePreview ? combinedFileVersions : historyFileVersions;
  const fileVersions = query.currentData;
  const loadingPatch = !fileVersions && query.isFetching;
  const oldFile = fileVersions?.oldFile ?? null;
  const newFile = fileVersions?.newFile ?? null;
  const initialReadFailed = !fileVersions && Boolean(query.error);
  const previewPath = previewSelection.path;
  const lspText = !loadingPatch ? (getTextFile(newFile)?.contents ?? null) : null;
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
        {initialReadFailed ? (
          <ErrorState
            title="Couldn’t load this commit’s diff"
            error={query.error}
            recovery={{
              label: "Retry",
              onAction: () => {
                void query.refetch();
              },
            }}
            busy={query.isFetching}
          />
        ) : loadingPatch ? (
          <div className="text-muted-foreground p-3 text-sm">Loading diff...</div>
        ) : !activePath ? (
          <div className="text-muted-foreground p-3 text-sm">
            {comparison
              ? "Select a combined change file to view diff."
              : "Select a commit file to view diff."}
          </div>
        ) : !oldFile && !newFile ? (
          <div className="text-muted-foreground p-3 text-sm">No diff content.</div>
        ) : (
          <div className="flex h-full min-h-0 min-w-0 flex-col">
            {query.error ? (
              <ErrorNotice
                title="Couldn’t refresh this diff"
                error={query.error}
                busy={query.isFetching}
                lastUpdated={query.fulfilledTimeStamp}
                recovery={{
                  label: "Retry",
                  onAction: () => {
                    void query.refetch();
                  },
                }}
              />
            ) : null}
            <LspStatusNotice
              repoPath={activeRepo}
              relPath={previewPath}
              active={lspText !== null}
            />
            <DiffWorkspace
              oldFile={oldFile}
              newFile={newFile}
              activePath={previewPath}
              commentContext={
                rangePreview
                  ? {
                      kind: "history-range",
                      baseRef: previewSelection.baseRef,
                      headRef: previewSelection.headRef,
                    }
                  : previewSelection.commitId
                    ? { kind: "history", commitId: previewSelection.commitId }
                    : { kind: "changes" }
              }
              canComment={Boolean(fileVersions && (rangePreview || previewSelection.commitId))}
              lspDiagnostics={lspDiagnostics}
              fileViewerRevision={
                rangePreview ? previewSelection.headRef : previewSelection.commitId
              }
              lspHoverDocument={lspHoverDocument}
              lspJumpContextKind={rangePreview ? "history-range" : "history"}
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
