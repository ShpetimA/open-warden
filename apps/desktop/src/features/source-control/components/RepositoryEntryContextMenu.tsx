import type { ContextMenuOpenContext } from "@pierre/trees";
import { Trash2 } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function RepositoryEntryContextMenu({
  context,
  disabled,
  onTrash,
}: {
  context: ContextMenuOpenContext;
  disabled: boolean;
  onTrash: () => void;
}) {
  return (
    <DropdownMenu
      open
      modal={false}
      onOpenChange={(open) => {
        if (!open) context.close();
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-hidden="true"
          tabIndex={-1}
          style={{
            position: "fixed",
            top: context.anchorRect.bottom - 1,
            left: context.anchorRect.left,
            width: 1,
            height: 1,
            padding: 0,
            border: 0,
            opacity: 0,
            pointerEvents: "none",
          }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        data-file-tree-context-menu-root="true"
        align="start"
        side="bottom"
        className="min-w-40 p-0.5"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          context.restoreFocus();
        }}
      >
        <DropdownMenuItem
          variant="destructive"
          className="h-7 gap-2 px-2 py-0 text-xs"
          disabled={disabled}
          onSelect={() => {
            context.close({ restoreFocus: false });
            onTrash();
          }}
        >
          <Trash2 className="size-3.5" />
          Move to Trash
          <DropdownMenuShortcut>D</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
