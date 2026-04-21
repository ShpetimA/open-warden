import type { MouseEventHandler, ReactNode } from "react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { SourceControlFileBrowser } from "@/features/source-control/components/SourceControlFileBrowser";
import type { FileBrowserMode } from "@/features/source-control/types";

export type FileListPaneRowArgs<TFile> = {
  file: TFile;
  depth: number;
  label?: string;
  navIndex: number;
  showDirectoryPath: boolean;
};

type FileListPaneProps<TFile extends { path: string }> = {
  title?: ReactNode;
  subtitle?: ReactNode;
  toolbar?: ReactNode;
  navRegion: string;
  files: ReadonlyArray<TFile>;
  mode: FileBrowserMode;
  renderRow: (args: FileListPaneRowArgs<TFile>) => ReactNode;
  isLoading?: boolean;
  error?: string;
  loadingState?: ReactNode;
  emptyState?: ReactNode;
  paneClassName?: string;
  headerClassName?: string;
  bodyClassName?: string;
  scrollAreaClassName?: string;
  onMouseDown?: MouseEventHandler<HTMLElement>;
};

export function FileListPane<TFile extends { path: string }>({
  title,
  subtitle,
  toolbar,
  navRegion,
  files,
  mode,
  renderRow,
  isLoading = false,
  error = "",
  loadingState = null,
  emptyState = null,
  paneClassName = "",
  headerClassName = "px-3 py-2",
  bodyClassName = "space-y-0.5 p-0.5",
  scrollAreaClassName = "min-h-0 flex-1 overflow-hidden",
  onMouseDown,
}: FileListPaneProps<TFile>) {
  return (
    <aside
      onMouseDown={onMouseDown}
      className={`bg-surface-toolbar border-border/70 flex h-full min-h-0 flex-col overflow-hidden border-r ${paneClassName}`.trim()}
    >
      {title || subtitle || toolbar ? (
        <div className={`border-border border-b ${headerClassName}`.trim()}>
          {title ? (
            <div className="text-foreground/80 text-[11px] font-semibold tracking-[0.14em]">
              {title}
            </div>
          ) : null}
          {subtitle ? <div className="text-muted-foreground mt-1 text-xs">{subtitle}</div> : null}
          {toolbar ? <div className="mt-2">{toolbar}</div> : null}
        </div>
      ) : null}
      <ScrollArea data-nav-region={navRegion} className={scrollAreaClassName}>
        {error ? (
          <div className="text-destructive px-3 py-4 text-sm">{error}</div>
        ) : isLoading && files.length === 0 ? (
          loadingState
        ) : files.length === 0 ? (
          emptyState
        ) : (
          <SourceControlFileBrowser
            files={files}
            mode={mode}
            className={bodyClassName}
            renderFile={({ depth, file, mode: currentMode, name, navIndex }) =>
              renderRow({
                file,
                depth: currentMode === "tree" ? depth : 0,
                label: currentMode === "tree" ? name : undefined,
                navIndex,
                showDirectoryPath: currentMode !== "tree",
              })
            }
          />
        )}
      </ScrollArea>
    </aside>
  );
}
