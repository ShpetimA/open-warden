import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getUnifiedChangeDirectoryContext } from "@/features/source-control/components/changesUnifiedPierreTree";
import type { Bucket, BucketedFile } from "@/features/source-control/types";
import type { ContextMenuItem, ContextMenuOpenContext } from "@pierre/trees";
import { Minus, Plus, Trash2 } from "lucide-react";
import type { ComponentProps, CSSProperties } from "react";

function getFloatingContextMenuTriggerStyle(
  anchorRect: ContextMenuOpenContext["anchorRect"],
): CSSProperties {
  return {
    border: 0,
    height: 1,
    left: `${String(anchorRect.left)}px`,
    opacity: 0,
    padding: 0,
    pointerEvents: "none",
    position: "fixed",
    top: `${String(anchorRect.bottom - 1)}px`,
    width: 1,
  };
}

export function getContextMenuSideOffset(anchorRect: ContextMenuOpenContext["anchorRect"]): number {
  return anchorRect.width === 0 && anchorRect.height === 0 ? 0 : 4;
}

function ChangesMenuContent(props: ComponentProps<typeof DropdownMenuContent>) {
  return (
    <DropdownMenuContent
      className="min-w-[154px] rounded-md border-border/70 bg-popover/98 p-0.5 shadow-lg shadow-black/12"
      {...props}
    />
  );
}

function ChangesMenuItem(props: ComponentProps<typeof DropdownMenuItem>) {
  return (
    <DropdownMenuItem
      className="h-6 gap-1.5 rounded-[4px] px-1.5 py-0 text-[11px] leading-none"
      {...props}
    />
  );
}

function ChangesMenuSeparator(props: ComponentProps<typeof DropdownMenuSeparator>) {
  return <DropdownMenuSeparator className="-mx-0.5 my-0.5" {...props} />;
}

function ChangesMenuShortcut(props: ComponentProps<typeof DropdownMenuShortcut>) {
  return (
    <DropdownMenuShortcut
      className="ml-3 rounded-[4px] border border-input bg-surface-alt px-1.5 py-0.5 text-[10px] font-medium leading-none tracking-normal"
      {...props}
    />
  );
}

type ChangesFileContextMenuProps = {
  item: ContextMenuItem;
  context: ContextMenuOpenContext;
  file: BucketedFile;
  sectionKey: "staged" | "unstaged" | "conflicts";
  hasRunningAction: boolean;
  onStageFile: (path: string) => void;
  onUnstageFile: (path: string) => void;
  onDiscardFile: (bucket: Bucket, path: string) => void;
};

export function ChangesFileContextMenu({
  context,
  file,
  sectionKey,
  hasRunningAction,
  onStageFile,
  onUnstageFile,
  onDiscardFile,
}: ChangesFileContextMenuProps) {
  return (
    <DropdownMenu
      open
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          context.close();
        }
      }}
      modal={false}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-hidden="true"
          tabIndex={-1}
          style={getFloatingContextMenuTriggerStyle(context.anchorRect)}
        />
      </DropdownMenuTrigger>
      <ChangesMenuContent
        data-file-tree-context-menu-root="true"
        align="start"
        side="bottom"
        sideOffset={getContextMenuSideOffset(context.anchorRect)}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          context.restoreFocus();
        }}
      >
        {sectionKey === "conflicts" ? (
          <ChangesMenuItem
            variant="destructive"
            disabled={hasRunningAction}
            onSelect={() => {
              context.close({ restoreFocus: false });
              onDiscardFile(file.bucket, file.path);
            }}
          >
            <Trash2 className="size-3.5" />
            Discard
            <ChangesMenuShortcut>⌘⎋</ChangesMenuShortcut>
          </ChangesMenuItem>
        ) : sectionKey === "staged" ? (
          <>
            <ChangesMenuItem
              disabled={hasRunningAction}
              onSelect={() => {
                context.close({ restoreFocus: false });
                onUnstageFile(file.path);
              }}
            >
              <Minus className="size-3.5" />
              Unstage
              <ChangesMenuShortcut>⌘↵</ChangesMenuShortcut>
            </ChangesMenuItem>
            <ChangesMenuSeparator />
            <ChangesMenuItem
              variant="destructive"
              disabled={hasRunningAction}
              onSelect={() => {
                context.close({ restoreFocus: false });
                onDiscardFile(file.bucket, file.path);
              }}
            >
              <Trash2 className="size-3.5" />
              Discard
              <ChangesMenuShortcut>⌘⎋</ChangesMenuShortcut>
            </ChangesMenuItem>
          </>
        ) : (
          <>
            <ChangesMenuItem
              disabled={hasRunningAction}
              onSelect={() => {
                context.close({ restoreFocus: false });
                onStageFile(file.path);
              }}
            >
              <Plus className="size-3.5" />
              Stage
              <ChangesMenuShortcut>⌘↵</ChangesMenuShortcut>
            </ChangesMenuItem>
            <ChangesMenuSeparator />
            <ChangesMenuItem
              variant="destructive"
              disabled={hasRunningAction}
              onSelect={() => {
                context.close({ restoreFocus: false });
                onDiscardFile(file.bucket, file.path);
              }}
            >
              <Trash2 className="size-3.5" />
              Discard
              <ChangesMenuShortcut>⌘⎋</ChangesMenuShortcut>
            </ChangesMenuItem>
          </>
        )}
      </ChangesMenuContent>
    </DropdownMenu>
  );
}

type ChangesSectionContextMenuProps = {
  context: ContextMenuOpenContext;
  sectionPath: string;
  stagedRows: BucketedFile[];
  changedRows: BucketedFile[];
  conflictRows: BucketedFile[];
  hasRunningAction: boolean;
  onStageAll: () => void;
  onUnstageAll: () => void;
  onStageFiles: (files: BucketedFile[]) => void;
  onUnstageFiles: (files: BucketedFile[]) => void;
  onDiscardChangesGroup: (files: BucketedFile[]) => void;
};

export function ChangesSectionContextMenu({
  context,
  sectionPath,
  stagedRows,
  changedRows,
  conflictRows,
  hasRunningAction,
  onStageAll,
  onUnstageAll,
  onStageFiles,
  onUnstageFiles,
  onDiscardChangesGroup,
}: ChangesSectionContextMenuProps) {
  const directoryContext = getUnifiedChangeDirectoryContext(
    sectionPath,
    stagedRows,
    changedRows,
    conflictRows,
  );
  if (!directoryContext) {
    return null;
  }

  const { isRoot, rows, sectionKey } = directoryContext;
  const isStagedSection = sectionKey === "staged";
  const isConflictSection = sectionKey === "conflicts";

  return (
    <DropdownMenu
      open
      onOpenChange={(nextOpen) => {
        if (!nextOpen) context.close();
      }}
      modal={false}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-hidden="true"
          tabIndex={-1}
          style={getFloatingContextMenuTriggerStyle(context.anchorRect)}
        />
      </DropdownMenuTrigger>
      <ChangesMenuContent
        data-file-tree-context-menu-root="true"
        align="start"
        side="bottom"
        sideOffset={getContextMenuSideOffset(context.anchorRect)}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          context.restoreFocus();
        }}
      >
        {isConflictSection ? (
          <ChangesMenuItem
            variant="destructive"
            disabled={hasRunningAction || rows.length === 0}
            onSelect={() => {
              context.close({ restoreFocus: false });
              onDiscardChangesGroup(rows);
            }}
          >
            <Trash2 className="size-3.5" />
            {isRoot ? "Discard all conflicts" : "Discard folder"}
          </ChangesMenuItem>
        ) : isStagedSection ? (
          <ChangesMenuItem
            disabled={hasRunningAction || rows.length === 0}
            onSelect={() => {
              context.close({ restoreFocus: false });
              if (isRoot) {
                onUnstageAll();
              } else {
                onUnstageFiles(rows);
              }
            }}
          >
            <Minus className="size-3.5" />
            {isRoot ? "Unstage all" : "Unstage folder"}
          </ChangesMenuItem>
        ) : (
          <>
            <ChangesMenuItem
              disabled={hasRunningAction || rows.length === 0}
              onSelect={() => {
                context.close({ restoreFocus: false });
                if (isRoot) {
                  onStageAll();
                } else {
                  onStageFiles(rows);
                }
              }}
            >
              <Plus className="size-3.5" />
              {isRoot ? "Stage all" : "Stage folder"}
            </ChangesMenuItem>
            <ChangesMenuSeparator />
            <ChangesMenuItem
              variant="destructive"
              disabled={hasRunningAction || rows.length === 0}
              onSelect={() => {
                context.close({ restoreFocus: false });
                onDiscardChangesGroup(rows);
              }}
            >
              <Trash2 className="size-3.5" />
              {isRoot ? "Discard changes" : "Discard folder"}
            </ChangesMenuItem>
          </>
        )}
      </ChangesMenuContent>
    </DropdownMenu>
  );
}
