import { ChevronDown, ChevronRight } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

import { ExpandableMarkdown } from "@/components/markdown/ExpandableMarkdown";
import { cn } from "@/lib/utils";

type ReviewNoteProps = Readonly<{
  title: string;
  body: string;
  label: string;
  metadata?: ReactNode;
  actions?: ReactNode;
  details?: Readonly<{ label: string; body: string }>;
  defaultCollapsed?: boolean;
  className?: string;
}>;

export function ReviewNote({
  title,
  body,
  label,
  metadata,
  actions,
  details,
  defaultCollapsed = false,
  className,
}: ReviewNoteProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const id = useId();

  return (
    <section
      aria-label={label}
      data-slot="review-note"
      className={cn(
        "border-border bg-surface-elevated w-full min-w-0 max-w-3xl overflow-hidden rounded-md border font-sans whitespace-normal",
        className,
      )}
    >
      <div className="flex min-h-8 items-center gap-1 px-2">
        <h2 aria-label={title} className="min-w-0 flex-1 text-xs font-medium">
          <button
            type="button"
            className="focus-visible:ring-ring/50 flex min-h-8 w-full min-w-0 items-center gap-1.5 rounded-sm py-1 text-left outline-none focus-visible:ring-2"
            aria-label={`${collapsed ? "Expand" : "Collapse"} ${label.toLowerCase()}`}
            aria-expanded={!collapsed}
            aria-controls={id}
            onClick={() => setCollapsed((current) => !current)}
          >
            {collapsed ? (
              <ChevronRight className="size-3 shrink-0" />
            ) : (
              <ChevronDown className="size-3 shrink-0" />
            )}
            <span
              className={cn(
                "min-w-0 leading-4",
                collapsed ? "truncate" : "line-clamp-2 break-words",
              )}
            >
              {title}
            </span>
          </button>
        </h2>
        {metadata ? (
          <span className="text-muted-foreground shrink-0 text-[11px]">{metadata}</span>
        ) : null}
        {actions ? <div className="flex shrink-0 items-center gap-0.5">{actions}</div> : null}
      </div>
      <div id={id} hidden={collapsed} className="px-3 pb-3 pt-1">
        <ExpandableMarkdown>{body}</ExpandableMarkdown>
        {details ? (
          <details className="border-border mt-2 border-t pt-2">
            <summary className="text-muted-foreground cursor-pointer text-xs">
              {details.label}
            </summary>
            <div className="pt-2">
              <ExpandableMarkdown>{details.body}</ExpandableMarkdown>
            </div>
          </details>
        ) : null}
      </div>
    </section>
  );
}
