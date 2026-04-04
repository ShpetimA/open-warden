import { useEffect, useRef } from "react";
import { skipToken } from "@reduxjs/toolkit/query";
import { File as PierreFile } from "@pierre/diffs/react";
import { useTheme } from "next-themes";

import { useAppSelector } from "@/app/hooks";
import {
  getDiffTheme,
  getDiffThemeType,
} from "@/features/diff-view/diffRenderConfig";
import { useGetRepoFileQuery } from "@/features/source-control/api";
import { errorMessageFrom } from "@/features/source-control/shared-utils/errorMessage";
import { repoLabel } from "@/features/source-control/utils";

const FILE_VIEWER_CSS = `
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

pre[data-file-type='single'] {
  overflow: hidden;
  min-width: 0;
}
`;

function formatViewerSubtitle(repoPath: string, revision?: string | null) {
  if (revision?.trim()) {
    return `${repoLabel(repoPath)} · ${revision}`;
  }

  return `${repoLabel(repoPath)} · Worktree`;
}

export function GeneralFileViewer() {
  const { resolvedTheme } = useTheme();
  const target = useAppSelector((state) => state.sourceControl.fileViewerTarget);
  const viewerRef = useRef<HTMLDivElement | null>(null);

  const repoFileQuery = useGetRepoFileQuery(
    target
      ? {
          repoPath: target.repoPath,
          relPath: target.relPath,
          revision: target.revision,
        }
      : skipToken,
    {
      refetchOnFocus: true,
      refetchOnReconnect: true,
    },
  );

  const file = repoFileQuery.data;
  const errorMessage = errorMessageFrom(repoFileQuery.error, "");
  const selectedLine = target?.line && target.line > 0 ? target.line : null;

  useEffect(() => {
    if (!selectedLine || !file) {
      return;
    }

    const frameId = requestAnimationFrame(() => {
      const lineNode = viewerRef.current?.querySelector<HTMLElement>(
        `[data-line="${selectedLine}"]`,
      );
      lineNode?.scrollIntoView({
        block: "center",
        inline: "nearest",
      });
    });

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [file, selectedLine]);

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col">
      <div className="border-border/70 border-b px-4 py-2">
        <div className="truncate text-sm font-medium">{target?.relPath ?? "File viewer"}</div>
        <div className="text-muted-foreground truncate text-xs">
          {target ? formatViewerSubtitle(target.repoPath, target.revision) : ""}
        </div>
      </div>

      <div ref={viewerRef} className="min-h-0 flex-1 overflow-auto">
        {errorMessage ? (
          <div className="text-destructive p-4 text-sm">{errorMessage}</div>
        ) : repoFileQuery.isFetching ? (
          <div className="text-muted-foreground p-4 text-sm">Loading file...</div>
        ) : !target ? (
          <div className="text-muted-foreground p-4 text-sm">Select a file to view it.</div>
        ) : !file ? (
          <div className="text-muted-foreground p-4 text-sm">File content is unavailable.</div>
        ) : (
          <PierreFile
            file={file}
            className="block min-w-0 max-w-full"
            selectedLines={selectedLine ? { start: selectedLine, end: selectedLine } : null}
            options={{
              theme: getDiffTheme(),
              themeType: getDiffThemeType(resolvedTheme),
              unsafeCSS: FILE_VIEWER_CSS,
              disableLineNumbers: false,
              disableFileHeader: false,
            }}
          />
        )}
      </div>
    </section>
  );
}
