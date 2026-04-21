import type { ReactNode } from "react";
import { FolderTree, List } from "lucide-react";

import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { Button } from "@/components/ui/button";
import { updateFileTreeRenderMode } from "@/features/settings/actions";
import type { FileBrowserMode } from "@/features/source-control/types";

type SourceControlFileViewToggleProps = {
  className?: string;
};

export function SourceControlFileViewToggle({ className }: SourceControlFileViewToggleProps) {
  const dispatch = useAppDispatch();
  const fileBrowserMode = useAppSelector(
    (state) => state.settings.appSettings.sourceControl.fileTreeRenderMode,
  );

  return (
    <div className={className}>
      <div className="border-input bg-surface-alt inline-flex items-center rounded-md border p-0.5">
        <ViewModeButton
          active={fileBrowserMode === "tree"}
          label="Tree"
          mode="tree"
          onClick={(mode) => void dispatch(updateFileTreeRenderMode(mode))}
        >
          <FolderTree className="h-3.5 w-3.5" />
        </ViewModeButton>
        <ViewModeButton
          active={fileBrowserMode === "list"}
          label="List"
          mode="list"
          onClick={(mode) => void dispatch(updateFileTreeRenderMode(mode))}
        >
          <List className="h-3.5 w-3.5" />
        </ViewModeButton>
      </div>
    </div>
  );
}

type ViewModeButtonProps = {
  active: boolean;
  label: string;
  mode: FileBrowserMode;
  onClick: (mode: FileBrowserMode) => void;
  children: ReactNode;
};

function ViewModeButton({ active, label, mode, onClick, children }: ViewModeButtonProps) {
  return (
    <Button
      type="button"
      size="xs"
      variant={active ? "secondary" : "ghost"}
      className="h-6 gap-1 rounded-sm px-2"
      aria-pressed={active}
      title={`${label} view`}
      onClick={() => onClick(mode)}
    >
      {children}
      <span className="text-[10px] font-medium">{label}</span>
    </Button>
  );
}
