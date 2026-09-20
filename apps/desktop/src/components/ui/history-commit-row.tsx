import { GitCommitHorizontal } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

type HistoryCommitRowProps = Readonly<{
  summary: string;
  shortId: string;
  author: string;
  relativeTime: string;
  active?: boolean;
  selected?: boolean;
  selectionDisabled?: boolean;
  className?: string;
  onOpen?: () => void;
  onSelectedChange?: (selected: boolean) => void;
}>;

function HistoryCommitRow({
  summary,
  shortId,
  author,
  relativeTime,
  active = false,
  selected = false,
  selectionDisabled = false,
  className,
  onOpen,
  onSelectedChange,
}: HistoryCommitRowProps) {
  const label = summary || shortId;

  return (
    <div
      data-slot="history-commit-row"
      data-active={active || undefined}
      className={cn(
        "border-border/70 bg-surface group/commit flex min-h-16 min-w-0 items-stretch rounded-lg border transition-[background-color,box-shadow]",
        active ? "bg-surface-active shadow-[inset_3px_0_0_var(--primary)]" : "hover:bg-accent/45",
        className,
      )}
    >
      <label className="relative flex w-10 shrink-0 cursor-pointer items-center justify-center">
        <span className="sr-only">Include {label} in a history comparison</span>
        <Checkbox
          checked={selected}
          disabled={selectionDisabled}
          onCheckedChange={(checked) => onSelectedChange?.(checked === true)}
        />
      </label>
      <button
        type="button"
        className="focus-visible:ring-ring/60 flex min-w-0 flex-1 items-start gap-2 rounded-r-lg px-2.5 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset"
        onClick={onOpen}
      >
        <GitCommitHorizontal
          aria-hidden="true"
          className="text-muted-foreground mt-0.5 size-3.5 shrink-0"
        />
        <span className="min-w-0 flex-1">
          <span className="text-foreground block truncate text-[13px] leading-5 font-medium">
            {summary || "(no commit message)"}
          </span>
          <span className="text-muted-foreground mt-1 flex min-w-0 items-center gap-2 text-[11px] tabular-nums">
            <code className="bg-surface-alt text-foreground/85 shrink-0 rounded px-1.5 py-0.5">
              {shortId}
            </code>
            <span className="min-w-0 flex-1 truncate">{author || "Unknown"}</span>
            <span className="shrink-0">{relativeTime}</span>
          </span>
        </span>
      </button>
    </div>
  );
}

export { HistoryCommitRow };
export type { HistoryCommitRowProps };
