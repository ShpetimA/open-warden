import { Minus, Plus, Trash2 } from "lucide-react";
import type { MouseEvent } from "react";

import { useAppSelector } from "@/app/hooks";
import { AccordionContent, AccordionTrigger } from "@/components/ui/accordion";
import type { Bucket, BucketedFile } from "@/features/source-control/types";
import { FileRow } from "./FileRow";
import { SourceControlFileBrowser } from "./SourceControlFileBrowser";

type Props = {
  sectionKey: "staged" | "unstaged";
  title: string;
  rows: BucketedFile[];
  startIndex: number;
  unstagedCount: number;
  untrackedCount: number;
  onSelectFile: (bucket: Bucket, path: string, event: MouseEvent<HTMLButtonElement>) => void;
  onStageFile: (path: string) => void;
  onUnstageFile: (path: string) => void;
  onDiscardFile: (bucket: Bucket, path: string) => void;
  onStageAll: () => void;
  onUnstageAll: () => void;
  onDiscardChangesGroup: (files: BucketedFile[]) => void;
};

export function FileSection({
  sectionKey,
  title,
  rows,
  startIndex,
  unstagedCount,
  untrackedCount,
  onSelectFile,
  onStageFile,
  onUnstageFile,
  onDiscardFile,
  onStageAll,
  onUnstageAll,
  onDiscardChangesGroup,
}: Props) {
  const runningAction = useAppSelector((state) => state.sourceControl.runningAction);
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo);
  const fileBrowserMode = useAppSelector((state) => state.sourceControl.fileBrowserMode);
  const isChanges = sectionKey === "unstaged";

  return (
    <>
      <AccordionTrigger className="text-foreground/80 border-border group flex items-center gap-2 rounded-none border-b px-3 py-2 text-[11px] font-semibold tracking-[0.14em] hover:no-underline">
        <span className="min-w-0 truncate font-medium">{title}</span>
        {isChanges ? (
          <>
            <span className="text-muted-foreground text-[10px]">M {unstagedCount}</span>
            <span className="text-muted-foreground text-[10px]">A {untrackedCount}</span>
          </>
        ) : null}
        <span className="text-muted-foreground ml-auto text-[10px]">{rows.length}</span>

        <div
          className="flex items-center gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100"
          onClick={(e) => e.stopPropagation()}
        >
          {isChanges ? (
            <>
              <button
                type="button"
                className="text-muted-foreground hover:bg-success/20 hover:text-success p-1"
                title="Stage all"
                disabled={rows.length === 0 || !!runningAction}
                onClick={(e) => {
                  e.stopPropagation();
                  onStageAll();
                }}
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className="text-muted-foreground hover:bg-destructive/20 hover:text-destructive p-1"
                title="Discard changes"
                disabled={rows.length === 0 || !!runningAction}
                onClick={(e) => {
                  e.stopPropagation();
                  onDiscardChangesGroup(rows);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          ) : (
            <button
              type="button"
              className="text-muted-foreground hover:bg-secondary hover:text-secondary-foreground p-1"
              title="Unstage all"
              disabled={rows.length === 0 || !!runningAction}
              onClick={(e) => {
                e.stopPropagation();
                onUnstageAll();
              }}
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </AccordionTrigger>

      <AccordionContent className="pb-0">
        {rows.length > 0 ? (
          <SourceControlFileBrowser
            files={rows}
            mode={fileBrowserMode}
            className="space-y-0.5 py-0.5"
            renderFile={({ depth, file, mode, name, navIndex }) => (
              <FileRow
                key={`${file.bucket}-${file.path}`}
                file={file}
                depth={mode === "tree" ? depth : 0}
                label={mode === "tree" ? name : undefined}
                navIndex={startIndex + navIndex}
                showDirectoryPath={mode !== "tree"}
                onSelectFile={onSelectFile}
                onStageFile={onStageFile}
                onUnstageFile={onUnstageFile}
                onDiscardFile={onDiscardFile}
                activeRepo={activeRepo}
              />
            )}
          />
        ) : (
          <div className="text-muted-foreground px-3 py-2 text-xs">No files.</div>
        )}
      </AccordionContent>
    </>
  );
}
