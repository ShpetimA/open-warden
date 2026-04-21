import { skipToken } from "@reduxjs/toolkit/query";

import { useAppSelector } from "@/app/hooks";
import { ResizableSidebarLayout } from "@/components/layout/ResizableSidebarLayout";
import { DiffWorkspace } from "@/features/diff-view/DiffWorkspace";
import { LspStatusNotice } from "@/features/lsp/components/LspStatusNotice";
import { useCurrentLspDocument } from "@/features/lsp/hooks/useCurrentLspDocument";
import { useDiffDiagnostics } from "@/features/lsp/hooks/useDiffDiagnostics";
import { useGetFileVersionsQuery } from "@/features/source-control/api";
import { ChangesSidebar } from "@/features/source-control/components/ChangesSidebar";
import { useChangesKeyboardNav } from "@/features/source-control/hooks/useChangesKeyboardNav";
import { useChangesSync } from "@/features/source-control/hooks/useChangesSync";
import { useThrottledDiffSelection } from "@/features/source-control/hooks/useThrottledDiffSelection";
import { errorMessageFrom } from "@/features/source-control/shared-utils/errorMessage";

export function ChangesScreen() {
  useChangesKeyboardNav("changes");
  useChangesSync();

  return (
    <ResizableSidebarLayout
      panelId="primary"
      sidebarDefaultSize={22}
      sidebarMinSize={14}
      sidebarMaxSize={34}
      sidebar={<ChangesSidebar />}
      content={<ChangesDiffPane />}
    />
  );
}

function ChangesDiffPane() {
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo);
  const activeBucket = useAppSelector((state) => state.sourceControl.activeBucket);
  const activePath = useAppSelector((state) => state.sourceControl.activePath);
  const diffFocusTarget = useAppSelector((state) => state.sourceControl.diffFocusTarget);

  const previewSelection = useThrottledDiffSelection(
    activePath
      ? {
          bucket: activeBucket,
          path: activePath,
        }
      : null,
  );

  const workingFileVersions = useGetFileVersionsQuery(
    activeRepo && previewSelection
      ? { repoPath: activeRepo, bucket: previewSelection.bucket, relPath: previewSelection.path }
      : skipToken,
    {
      refetchOnFocus: true,
      refetchOnReconnect: true,
    },
  );
  const fileVersions = workingFileVersions.currentData ?? workingFileVersions.data;
  const loadingPatch = !fileVersions && workingFileVersions.isFetching;
  const oldFile = fileVersions?.oldFile ?? null;
  const newFile = fileVersions?.newFile ?? null;
  const errorMessage = fileVersions ? "" : errorMessageFrom(workingFileVersions.error, "");
  const previewPath = previewSelection?.path ?? "";
  const lspText = !loadingPatch && newFile ? newFile.contents : null;
  const lspHoverDocument =
    activeRepo && previewPath && lspText !== null
      ? { repoPath: activeRepo, relPath: previewPath }
      : undefined;

  useCurrentLspDocument(activeRepo, previewPath, lspText);

  const lspDiagnostics = useDiffDiagnostics(activeRepo, previewPath);
  const focusedLineNumber =
    diffFocusTarget?.kind === "changes" && diffFocusTarget.path === previewPath
      ? diffFocusTarget.lineNumber
      : null;
  const focusedLineIndex =
    diffFocusTarget?.kind === "changes" && diffFocusTarget.path === previewPath
      ? diffFocusTarget.lineIndex
      : null;
  const focusedLineKey =
    diffFocusTarget?.kind === "changes" && diffFocusTarget.path === previewPath
      ? diffFocusTarget.focusKey
      : null;

  return (
    <div className="grid h-full min-h-0 min-w-0">
      <section className="flex h-full min-h-0 min-w-0 flex-col">
        <div className="min-h-0 min-w-0 flex-1">
          {errorMessage ? (
            <div className="text-destructive p-3 text-sm">{errorMessage}</div>
          ) : loadingPatch ? (
            <div className="text-muted-foreground p-3 text-sm">Loading diff...</div>
          ) : !activePath ? (
            <div className="text-muted-foreground p-3 text-sm">Select a file to view diff.</div>
          ) : !oldFile && !newFile ? (
            <div className="text-muted-foreground p-3 text-sm">No diff content.</div>
          ) : (
            <div className="flex h-full min-h-0 min-w-0 flex-col">
              <LspStatusNotice repoPath={activeRepo} relPath={previewPath} active />
              <DiffWorkspace
                oldFile={oldFile}
                newFile={newFile}
                activePath={previewPath}
                commentContext={{ kind: "changes" }}
                canComment
                lspDiagnostics={lspDiagnostics}
                fileViewerRevision={null}
                lspHoverDocument={lspHoverDocument}
                lspJumpContextKind="changes"
                focusedLineNumber={focusedLineNumber}
                focusedLineIndex={focusedLineIndex}
                focusedLineKey={focusedLineKey}
              />
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
