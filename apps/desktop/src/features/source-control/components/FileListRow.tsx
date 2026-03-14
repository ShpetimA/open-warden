import type { MouseEvent, ReactNode } from "react";

import type { FileStatus } from "@/features/source-control/types";
import { statusBadge } from "@/features/source-control/utils";

type FileListRowProps = {
  path: string;
  status: FileStatus;
  commentCount?: number;
  isActive?: boolean;
  isSelected?: boolean;
  navIndex?: number;
  onSelect: (event: MouseEvent<HTMLButtonElement>) => void;
  actions?: ReactNode;
  secondaryLabel?: string;
};

function splitPath(path: string) {
  const normalizedPath = path.replace(/\\/g, "/");
  const pathParts = normalizedPath.split("/").filter(Boolean);
  const fileName = pathParts[pathParts.length - 1] ?? path;
  const directoryPath = pathParts.length > 1 ? pathParts.slice(0, -1).join("/") : "";
  return { fileName, directoryPath };
}

function rowStateClass(isActive: boolean, isSelected: boolean) {
  if (isActive) return "bg-surface-active";
  if (isSelected) return "bg-accent/50";
  return "hover:bg-accent/60";
}

export function FileListRow({
  path,
  status,
  commentCount = 0,
  isActive = false,
  isSelected = false,
  navIndex,
  onSelect,
  actions,
  secondaryLabel,
}: FileListRowProps) {
  const { fileName, directoryPath } = splitPath(path);
  const stateClass = rowStateClass(isActive, isSelected);

  return (
    <div
      data-nav-index={navIndex}
      className={`border-input group flex min-w-0 items-center gap-2 overflow-hidden border-b px-2 py-1 text-xs last:border-b-0 ${stateClass}`}
    >
      <button
        type="button"
        className="w-0 min-w-0 flex-1 overflow-hidden text-left"
        onClick={onSelect}
        title={path}
      >
        <div className="flex min-w-0 items-center gap-2 overflow-hidden">
          <span className="text-warning w-3 text-center text-[10px]">{statusBadge(status)}</span>
          <span className="text-foreground shrink-0 font-medium">{fileName}</span>
          {commentCount > 0 ? (
            <span className="border-input bg-surface-alt text-foreground inline-flex h-4 min-w-4 items-center justify-center border px-1 text-[10px]">
              {commentCount}
            </span>
          ) : null}
          {directoryPath ? (
            <span className="text-muted-foreground block min-w-0 flex-1 truncate whitespace-nowrap">
              {` ${directoryPath}`}
            </span>
          ) : null}
        </div>

        {secondaryLabel ? (
          <div className="text-muted-foreground mt-0.5 truncate pl-5 text-[11px]">
            {secondaryLabel}
          </div>
        ) : null}
      </button>

      {actions ? (
        <div className="flex items-center gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
