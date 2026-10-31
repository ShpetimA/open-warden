import { cva } from "class-variance-authority";
import { MessageSquare } from "lucide-react";

import { DiffStat } from "@/components/ui/diff-stat";
import { cn } from "@/lib/utils";

const fileChangeStatuses = {
  added: {
    label: "Added",
    marker: "A",
    markerClassName: "bg-diff-addition-surface text-diff-addition",
  },
  deleted: {
    label: "Deleted",
    marker: "D",
    markerClassName: "bg-diff-deletion-surface text-diff-deletion",
  },
  modified: {
    label: "Modified",
    marker: "M",
    markerClassName: "bg-diff-modification-surface text-diff-modification",
  },
  renamed: { label: "Renamed", marker: "R", markerClassName: "bg-info-surface text-info" },
  conflicted: {
    label: "Conflict",
    marker: "!",
    markerClassName: "bg-diff-conflict-surface text-diff-conflict",
  },
  untracked: { label: "Untracked", marker: "?", markerClassName: "bg-muted text-muted-foreground" },
} as const;

type FileChangeStatus = keyof typeof fileChangeStatuses;

const fileChangeRowVariants = cva(
  "group flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1 text-left text-xs outline-none transition-[background-color] duration-100 ease-out focus-visible:ring-2 focus-visible:ring-ring/50",
  {
    variants: {
      selected: {
        true: "bg-surface-active text-foreground",
        false: "text-foreground hover:bg-accent/60",
      },
    },
    defaultVariants: {
      selected: false,
    },
  },
);

function splitPath(path: string) {
  const separatorIndex = path.lastIndexOf("/");
  if (separatorIndex < 0) {
    return { directory: "", name: path };
  }

  return {
    directory: path.slice(0, separatorIndex + 1),
    name: path.slice(separatorIndex + 1),
  };
}

type FileChangeRowProps = Omit<React.ComponentProps<"button">, "children"> & {
  path: string;
  previousPath?: string;
  status: FileChangeStatus;
  additions?: number;
  deletions?: number;
  commentCount?: number;
  selected?: boolean;
};

function FileChangeRow({
  className,
  path,
  previousPath,
  status,
  additions,
  deletions,
  commentCount,
  selected = false,
  ...props
}: FileChangeRowProps) {
  const pathParts = splitPath(path);
  const statusMetadata = fileChangeStatuses[status];

  return (
    <button
      type="button"
      data-slot="file-change-row"
      data-status={status}
      aria-pressed={selected}
      className={cn(fileChangeRowVariants({ selected }), className)}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          "inline-flex size-4 shrink-0 items-center justify-center rounded-sm font-mono text-[10px] font-semibold",
          statusMetadata.markerClassName,
        )}
      >
        {statusMetadata.marker}
      </span>
      <span className="sr-only">{statusMetadata.label} file:</span>

      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-baseline">
          {pathParts.directory ? (
            <span className="text-muted-foreground min-w-0 truncate font-mono text-xs">
              {pathParts.directory}
            </span>
          ) : null}
          <span className="shrink-0 font-mono text-xs font-medium">{pathParts.name}</span>
        </span>
        {previousPath ? (
          <span className="text-muted-foreground block truncate text-[11px]">
            from {previousPath}
          </span>
        ) : null}
      </span>

      <span className="ml-auto flex shrink-0 items-center gap-1.5">
        {commentCount && commentCount > 0 ? (
          <span
            className="text-muted-foreground inline-flex items-center gap-1 text-[11px] tabular-nums"
            aria-label={`${commentCount} comments`}
          >
            <MessageSquare aria-hidden="true" className="size-3" />
            {commentCount}
          </span>
        ) : null}
        {typeof additions === "number" && additions > 0 ? (
          <DiffStat kind="addition" value={additions} />
        ) : null}
        {typeof deletions === "number" && deletions > 0 ? (
          <DiffStat kind="deletion" value={deletions} />
        ) : null}
      </span>
    </button>
  );
}

export { FileChangeRow };
export type { FileChangeStatus };
