import { useCallback, useEffect, useMemo, useState } from "react";
import { File as PierreFile, UnresolvedFile, Virtualizer } from "@pierre/diffs/react";
import type { FileContents } from "@pierre/diffs";
import type { MergeConflictDiffAction } from "@pierre/diffs/utils/parseMergeConflictDiffFromFile";
import { useTheme } from "next-themes";

import { useAppDispatch } from "@/app/hooks";
import { gitApi, useGetRepoFileQuery } from "@/features/source-control/api";
import { getDiffTheme, getDiffThemeType } from "@/features/diff-view/diffRenderConfig";

const STICKY_HEADER_CSS = `
:host {
  min-width: 0;
  max-width: 100%;
}

[data-diffs-header] {
  position: sticky;
  top: 0;
  z-index: 10;
  background-color: var(--diffs-bg);
  border-bottom: 1px solid color-mix(in lab, var(--diffs-bg) 90%, var(--diffs-fg));
  min-width: 0;
  overflow: hidden;
}

pre[data-diff-type='single'] {
  overflow: hidden;
  min-width: 0;
}
`;

type MergeConflictViewerProps = {
  repoPath: string;
  relPath: string;
};

type PendingResolution = "current" | "incoming" | "both";

type PendingSelection = {
  key: string;
  resolution: PendingResolution;
  action: MergeConflictDiffAction;
};

export function MergeConflictViewer({ repoPath, relPath }: MergeConflictViewerProps) {
  const dispatch = useAppDispatch();
  const { resolvedTheme } = useTheme();
  const diffThemeType = getDiffThemeType(resolvedTheme);
  const diffTheme = useMemo(() => getDiffTheme(), []);

  const repoFileQuery = useGetRepoFileQuery(
    { repoPath, relPath },
    { refetchOnFocus: true, refetchOnReconnect: true },
  );
  const repoFile = repoFileQuery.currentData ?? repoFileQuery.data;

  // Local applied copy so accepted conflict updates are visible immediately
  // while refetch catches up.
  const [workingFile, setWorkingFile] = useState<FileContents | null>(null);

  // One active pending preview selection shown in sticky bottom bar.
  const [pendingSelection, setPendingSelection] = useState<PendingSelection | null>(null);
  const [isApplying, setIsApplying] = useState(false);

  useEffect(() => {
    setWorkingFile(null);
    setPendingSelection(null);
    setIsApplying(false);
  }, [repoPath, relPath]);

  const file: FileContents | null = useMemo(() => {
    if (workingFile) return workingFile;
    if (!repoFile) return null;
    return {
      name: repoFile.name,
      contents: repoFile.contents,
    };
  }, [repoFile, workingFile]);

  const options = useMemo(
    () => ({
      theme: diffTheme,
      themeType: diffThemeType,
      unsafeCSS: STICKY_HEADER_CSS,
      diffStyle: "unified" as const,
    }),
    [diffTheme, diffThemeType],
  );

  const setPendingResolution = useCallback(
    (action: MergeConflictDiffAction, resolution: PendingResolution) => {
      setPendingSelection({
        key: getConflictKey(action),
        resolution,
        action,
      });
    },
    [],
  );

  const clearPendingResolution = useCallback(() => {
    if (isApplying) return;
    setPendingSelection(null);
  }, [isApplying]);

  const applyPendingResolution = useCallback(() => {
    if (!file || !pendingSelection || isApplying) return;

    const { action, resolution } = pendingSelection;
    const nextContents = resolveMergeConflictRegion(file.contents, action, resolution);
    if (nextContents === file.contents) return;

    const previousFile = file;
    const nextFile: FileContents = {
      name: file.name,
      contents: nextContents,
    };

    setWorkingFile(nextFile);
    setPendingSelection(null);
    setIsApplying(true);

    const mutation = dispatch(
      gitApi.endpoints.updateWorktreeFileContents.initiate({
        repoPath,
        relPath,
        contents: nextContents,
      }),
    );

    void mutation
      .unwrap()
      .then(async () => {
        await repoFileQuery.refetch();
        setWorkingFile(null);
      })
      .catch(() => {
        setWorkingFile(previousFile);
      })
      .finally(() => {
        setIsApplying(false);
      });
  }, [dispatch, file, isApplying, pendingSelection, relPath, repoPath, repoFileQuery]);

  if (!file) {
    return (
      <div className="text-muted-foreground p-3 text-sm">
        {repoFileQuery.isFetching ? "Loading conflict..." : "No conflict content."}
      </div>
    );
  }

  const fileIdentity = `${relPath}:${file.contents.length}:${hashContents(file.contents)}`;
  const hasUnresolvedConflicts = containsMergeConflictMarkers(file.contents);
  const pendingPreviewText = pendingSelection
    ? getConflictResolutionPreview(
        file.contents,
        pendingSelection.action,
        pendingSelection.resolution,
      )
    : "";
  const pendingPreviewFile: FileContents | null = pendingSelection
    ? {
        name: file.name,
        contents: pendingPreviewText || "\n",
      }
    : null;

  return (
    <div key={fileIdentity} className="relative flex h-full min-h-0 min-w-0 flex-1 overflow-hidden">
      <div
        className={`min-h-0 min-w-0 ${pendingSelection ? "w-1/2 border-r border-border/70" : "w-full"}`}
      >
        <Virtualizer
          config={{
            overscrollSize: 600,
            intersectionObserverMargin: 1200,
          }}
          className="diff-viewport-scroll relative h-full min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden pr-3 pb-3"
        >
          {hasUnresolvedConflicts ? (
            <UnresolvedFile
              className="block min-w-0 max-w-full"
              file={file}
              options={options}
              renderMergeConflictUtility={(action) => {
                const key = getConflictKey(action);
                const pending = pendingSelection?.key === key ? pendingSelection.resolution : null;

                return (
                  <div className="px-2 py-1">
                    <div className="flex justify-end gap-1">
                      {pending ? (
                        <>
                          <button
                            type="button"
                            title="Apply pending resolution"
                            className="inline-flex h-5 items-center justify-center rounded-xs border border-border/60 bg-surface-1 px-1.5 text-[11px] text-foreground shadow-sm transition-[background-color,color,scale] hover:bg-surface-1/80 active:scale-[0.96] disabled:opacity-60"
                            onClick={applyPendingResolution}
                            disabled={isApplying}
                          >
                            {isApplying ? "Applying…" : "Apply"}
                          </button>
                          <button
                            type="button"
                            title="Revert pending resolution"
                            className="inline-flex h-5 items-center justify-center rounded-xs border border-border/60 bg-background/90 px-1.5 text-[11px] text-muted-foreground shadow-sm transition-[background-color,color,scale] hover:bg-surface-1 hover:text-foreground active:scale-[0.96] disabled:opacity-60"
                            onClick={clearPendingResolution}
                            disabled={isApplying}
                          >
                            Revert
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            title="Preview current"
                            className={`inline-flex h-5 items-center justify-center rounded-xs border border-border/60 px-1.5 text-[11px] shadow-sm transition-[background-color,color,scale] hover:bg-surface-1 active:scale-[0.96] ${pending === "current" ? "bg-surface-1 text-foreground" : "bg-background/90 text-muted-foreground"}`}
                            onClick={() => setPendingResolution(action, "current")}
                            disabled={isApplying}
                          >
                            Current
                          </button>
                          <button
                            type="button"
                            title="Preview incoming"
                            className={`inline-flex h-5 items-center justify-center rounded-xs border border-border/60 px-1.5 text-[11px] shadow-sm transition-[background-color,color,scale] hover:bg-surface-1 active:scale-[0.96] ${pending === "incoming" ? "bg-surface-1 text-foreground" : "bg-background/90 text-muted-foreground"}`}
                            onClick={() => setPendingResolution(action, "incoming")}
                            disabled={isApplying}
                          >
                            Incoming
                          </button>
                          <button
                            type="button"
                            title="Preview both"
                            className={`inline-flex h-5 items-center justify-center rounded-xs border border-border/60 px-1.5 text-[11px] shadow-sm transition-[background-color,color,scale] hover:bg-surface-1 active:scale-[0.96] ${pending === "both" ? "bg-surface-1 text-foreground" : "bg-background/90 text-muted-foreground"}`}
                            onClick={() => setPendingResolution(action, "both")}
                            disabled={isApplying}
                          >
                            Both
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              }}
            />
          ) : (
            <div className="min-h-0">
              <div className="text-muted-foreground px-3 py-2 text-xs">
                All conflict markers are resolved. Stage this file to complete the merge.
              </div>
              <PierreFile
                className="block min-w-0 max-w-full"
                file={file}
                options={{
                  theme: diffTheme,
                  themeType: diffThemeType,
                  unsafeCSS: STICKY_HEADER_CSS,
                  disableLineNumbers: false,
                  disableFileHeader: false,
                }}
              />
            </div>
          )}
        </Virtualizer>
      </div>

      {pendingSelection ? (
        <aside className="bg-surface-toolbar flex min-h-0 w-1/2 min-w-[340px] flex-col">
          <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
            <div className="text-muted-foreground text-xs">
              Preview mode · {pendingSelection.resolution}
            </div>
            <div className="flex gap-1">
              <button
                type="button"
                className="inline-flex h-6 items-center justify-center rounded-xs border border-border/60 bg-background px-2 text-[11px] text-foreground hover:bg-surface-1 disabled:opacity-60"
                onClick={applyPendingResolution}
                disabled={isApplying}
              >
                {isApplying ? "Applying…" : "Apply"}
              </button>
              <button
                type="button"
                className="inline-flex h-6 items-center justify-center rounded-xs border border-border/60 bg-background px-2 text-[11px] text-muted-foreground hover:bg-surface-1 disabled:opacity-60"
                onClick={clearPendingResolution}
                disabled={isApplying}
              >
                Revert
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto px-1 py-1">
            {pendingPreviewFile ? (
              <PierreFile
                className="block min-w-0 max-w-full"
                file={pendingPreviewFile}
                options={{
                  theme: diffTheme,
                  themeType: diffThemeType,
                  unsafeCSS: STICKY_HEADER_CSS,
                  disableLineNumbers: false,
                  disableFileHeader: true,
                }}
              />
            ) : (
              <div className="text-muted-foreground px-2 py-2 text-xs">∅ (empty)</div>
            )}
          </div>
        </aside>
      ) : null}
    </div>
  );
}

function getConflictKey(action: MergeConflictDiffAction) {
  const { conflict } = action;
  return `${conflict.startLineIndex}:${conflict.separatorLineIndex}:${conflict.endLineIndex}`;
}

function getConflictResolutionPreview(
  contents: string,
  action: MergeConflictDiffAction,
  resolution: PendingResolution,
) {
  const conflict = action.conflict;
  const lines = splitLinesKeepingNewline(contents);

  const currentEnd = conflict.baseMarkerLineIndex ?? conflict.separatorLineIndex;
  const currentLines = lines.slice(conflict.startLineIndex + 1, currentEnd);
  const incomingLines = lines.slice(conflict.separatorLineIndex + 1, conflict.endLineIndex);

  const replacementLines =
    resolution === "current"
      ? currentLines
      : resolution === "incoming"
        ? incomingLines
        : [...currentLines, ...incomingLines];

  return replacementLines.join("");
}

function resolveMergeConflictRegion(
  contents: string,
  action: MergeConflictDiffAction,
  resolution: PendingResolution,
) {
  const conflict = action.conflict;
  const lines = splitLinesKeepingNewline(contents);

  if (
    conflict.startLineIndex < 0 ||
    conflict.separatorLineIndex < 0 ||
    conflict.endLineIndex < 0 ||
    conflict.startLineIndex >= lines.length ||
    conflict.separatorLineIndex >= lines.length ||
    conflict.endLineIndex >= lines.length ||
    conflict.startLineIndex >= conflict.separatorLineIndex ||
    conflict.separatorLineIndex >= conflict.endLineIndex
  ) {
    return contents;
  }

  const replacement = getConflictResolutionPreview(contents, action, resolution);
  const replacementLines = splitLinesKeepingNewline(replacement);

  return [
    ...lines.slice(0, conflict.startLineIndex),
    ...replacementLines,
    ...lines.slice(conflict.endLineIndex + 1),
  ].join("");
}

function splitLinesKeepingNewline(value: string) {
  return value.match(/[^\n]*\n|[^\n]+/g) ?? [];
}

function containsMergeConflictMarkers(contents: string) {
  return (
    contents.includes("<<<<<<<") && contents.includes("=======") && contents.includes(">>>>>>>")
  );
}

function hashContents(value: string) {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(36);
}
