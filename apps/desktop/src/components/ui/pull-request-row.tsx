import { GitPullRequest } from "lucide-react";

import { DiffStat } from "@/components/ui/diff-stat";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";

type PullRequestRowProps = Readonly<{
  number: number;
  title: string;
  author: string;
  sourceRef: string;
  targetRef: string;
  updatedLabel: string;
  additions?: number;
  deletions?: number;
  draft?: boolean;
  selected?: boolean;
  className?: string;
  onOpen?: () => void;
}>;

function PullRequestRow({
  number,
  title,
  author,
  sourceRef,
  targetRef,
  updatedLabel,
  additions,
  deletions,
  draft = false,
  selected = false,
  className,
  onOpen,
}: PullRequestRowProps) {
  return (
    <button
      type="button"
      data-slot="pull-request-row"
      aria-current={selected ? "true" : undefined}
      className={cn(
        "text-foreground flex min-h-11 w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left outline-none transition-[background-color] focus-visible:ring-2 focus-visible:ring-ring/50",
        selected ? "bg-surface-active" : "hover:bg-accent/60",
        className,
      )}
      onClick={onOpen}
    >
      <GitPullRequest
        aria-hidden="true"
        className={cn("size-4 shrink-0", draft ? "text-muted-foreground" : "text-success")}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium">{title}</span>
        <span className="text-muted-foreground mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px]">
          <span className="shrink-0 font-mono">
            {targetRef}#{number}
          </span>
          <span aria-hidden="true">·</span>
          <span className="flex min-w-0 items-center gap-1">
            <code className="truncate font-mono">{sourceRef}</code>
          </span>
          {draft ? (
            <StatusBadge size="sm" showDot={false} tone="neutral" className="-my-0.5">
              Draft
            </StatusBadge>
          ) : null}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-0.5">
        {additions !== undefined || deletions !== undefined ? (
          <span className="flex items-center gap-1.5">
            {additions === undefined ? null : <DiffStat kind="addition" value={additions} />}
            {deletions === undefined ? null : <DiffStat kind="deletion" value={deletions} />}
          </span>
        ) : null}
        <span className="text-muted-foreground flex items-center gap-1.5 text-[11px]">
          <span className="tabular-nums">{updatedLabel}</span>
          <span className="max-w-40 truncate">{author}</span>
        </span>
      </span>
    </button>
  );
}

export { PullRequestRow };
export type { PullRequestRowProps };
