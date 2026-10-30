import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export const COMMIT_ROW_HEIGHT = 46;

type CommitRowProps = Readonly<{
  commitId: string;
  summary: string;
  shortId: string;
  author: string;
  relativeTime: string;
  active?: boolean;
  navIndex?: number;
  selection?: Readonly<{
    checked: boolean;
    disabled?: boolean;
    onCheckedChange: (checked: boolean) => void;
  }>;
  className?: string;
  onOpen?: () => void;
}>;

function CommitRow({
  commitId,
  summary,
  shortId,
  author,
  relativeTime,
  active = false,
  navIndex,
  selection,
  className,
  onOpen,
}: CommitRowProps) {
  const label = summary || shortId;

  return (
    <div
      data-slot="commit-row"
      data-active={active || undefined}
      style={{ height: COMMIT_ROW_HEIGHT }}
      className={cn(
        "flex w-full min-w-0 shrink-0 items-stretch border-l-2 border-transparent hover:bg-accent",
        active && "border-primary bg-surface-active",
        className,
      )}
    >
      {selection ? (
        <div className="flex w-10 shrink-0 items-center justify-center">
          <Checkbox
            aria-label={`Include ${label} in combined changes`}
            className="relative after:absolute after:-inset-3"
            checked={selection.checked}
            disabled={selection.disabled}
            onCheckedChange={(checked) => selection.onCheckedChange(checked === true)}
          />
        </div>
      ) : null}
      <button
        type="button"
        data-nav-index={navIndex}
        data-type="item"
        data-item-path={commitId}
        aria-pressed={active}
        aria-label={`${label} ${shortId} ${author} ${relativeTime}`}
        className="focus-visible:ring-ring/50 flex h-full min-w-0 flex-1 flex-col gap-0.5 px-2 py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset"
        onClick={onOpen}
      >
        <span className="w-full truncate text-xs leading-4 font-medium">
          {summary || "(no commit message)"}
        </span>
        <span className="text-muted-foreground flex w-full min-w-0 gap-2 text-[11px] leading-4">
          <span className="shrink-0 font-mono">{shortId}</span>
          <span className="min-w-0 flex-1 truncate">{author || "Unknown"}</span>
          <span className="shrink-0 tabular-nums">{relativeTime}</span>
        </span>
      </button>
    </div>
  );
}

export { CommitRow };
export type { CommitRowProps };
