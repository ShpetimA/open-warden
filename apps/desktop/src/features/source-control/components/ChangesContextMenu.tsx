import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { STAGED_ROOT_PATH } from "@/features/source-control/components/changesUnifiedPierreTree";
import type { Bucket, BucketedFile } from "@/features/source-control/types";
import type { ContextMenuItem, ContextMenuOpenContext } from "@pierre/trees";
import { Minus, Plus, Trash2 } from "lucide-react";
import type { CSSProperties } from "react";

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

type ChangesFileContextMenuProps = {
  item: ContextMenuItem;
  context: ContextMenuOpenContext;
  file: BucketedFile;
  sectionKey: "staged" | "unstaged";
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
      <DropdownMenuContent
        data-file-tree-context-menu-root="true"
        align="start"
        side="bottom"
        sideOffset={getContextMenuSideOffset(context.anchorRect)}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          context.restoreFocus();
        }}
      >
        {sectionKey === "staged" ? (
          <>
            <DropdownMenuItem
              disabled={hasRunningAction}
              onSelect={() => {
                context.close({ restoreFocus: false });
                onUnstageFile(file.path);
              }}
            >
              <Minus className="size-4" />
              Unstage
              <DropdownMenuShortcut>Cmd+Enter</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              disabled={hasRunningAction}
              onSelect={() => {
                context.close({ restoreFocus: false });
                onDiscardFile(file.bucket, file.path);
              }}
            >
              <Trash2 className="size-4" />
              Discard
              <DropdownMenuShortcut>Cmd+Esc</DropdownMenuShortcut>
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuItem
              disabled={hasRunningAction}
              onSelect={() => {
                context.close({ restoreFocus: false });
                onStageFile(file.path);
              }}
            >
              <Plus className="size-4" />
              Stage
              <DropdownMenuShortcut>Cmd+Enter</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              disabled={hasRunningAction}
              onSelect={() => {
                context.close({ restoreFocus: false });
                onDiscardFile(file.bucket, file.path);
              }}
            >
              <Trash2 className="size-4" />
              Discard
              <DropdownMenuShortcut>Cmd+Esc</DropdownMenuShortcut>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type ChangesSectionContextMenuProps = {
  context: ContextMenuOpenContext;
  sectionPath: string;
  stagedRows: BucketedFile[];
  changedRows: BucketedFile[];
  hasRunningAction: boolean;
  onStageAll: () => void;
  onUnstageAll: () => void;
  onDiscardChangesGroup: (files: BucketedFile[]) => void;
};

export function ChangesSectionContextMenu({
  context,
  sectionPath,
  stagedRows,
  changedRows,
  hasRunningAction,
  onStageAll,
  onUnstageAll,
  onDiscardChangesGroup,
}: ChangesSectionContextMenuProps) {
  const isStagedSection = sectionPath === STAGED_ROOT_PATH;
  const rows = isStagedSection ? stagedRows : changedRows;

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
      <DropdownMenuContent
        data-file-tree-context-menu-root="true"
        align="start"
        side="bottom"
        sideOffset={getContextMenuSideOffset(context.anchorRect)}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          context.restoreFocus();
        }}
      >
        {isStagedSection ? (
          <DropdownMenuItem
            disabled={hasRunningAction || rows.length === 0}
            onSelect={() => {
              context.close({ restoreFocus: false });
              onUnstageAll();
            }}
          >
            <Minus className="size-4" />
            Unstage all
          </DropdownMenuItem>
        ) : (
          <>
            <DropdownMenuItem
              disabled={hasRunningAction || rows.length === 0}
              onSelect={() => {
                context.close({ restoreFocus: false });
                onStageAll();
              }}
            >
              <Plus className="size-4" />
              Stage all
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              disabled={hasRunningAction || rows.length === 0}
              onSelect={() => {
                context.close({ restoreFocus: false });
                onDiscardChangesGroup(rows);
              }}
            >
              <Trash2 className="size-4" />
              Discard changes
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
