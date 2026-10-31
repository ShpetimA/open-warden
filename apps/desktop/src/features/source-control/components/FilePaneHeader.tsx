import { X } from "lucide-react";
import { useRef, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function FilePaneHeader({
  title,
  summary,
  description,
  actions,
  filter,
  onFilterChange,
  filterLabel = "Filter files",
  placeholder = "Filter files…",
  filterHint,
  filterLeading,
  notice,
}: {
  title: string;
  summary?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  filter: string;
  onFilterChange: (filter: string) => void;
  filterLabel?: string;
  placeholder?: string;
  filterHint?: string;
  filterLeading?: ReactNode;
  notice?: ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);

  return (
    <header
      data-slot="file-pane-header"
      className="flex shrink-0 flex-col gap-1 border-b px-2 py-2"
    >
      <div className="flex min-h-6 min-w-0 items-center gap-2">
        <h2 className="text-muted-foreground shrink-0 text-[11px] font-medium uppercase tracking-wider">
          {title}
        </h2>
        <div className="text-muted-foreground ml-auto min-w-0 truncate text-[11px] tabular-nums">
          {summary}
        </div>
        {actions}
      </div>
      {description ? (
        <div className="text-muted-foreground min-w-0 truncate text-[11px]">{description}</div>
      ) : null}
      <div className="flex items-center gap-2">
        {filterLeading}
        <div className="relative min-w-0 flex-1">
          <Input
            ref={input}
            aria-label={filterLabel}
            title={filterHint}
            placeholder={placeholder}
            value={filter}
            onChange={(event) => onFilterChange(event.target.value)}
            className="h-7 min-w-0 pr-8 pl-2 text-xs"
          />
          {filter ? (
            <Button
              variant="ghost"
              size="icon-xs"
              className="absolute top-0.5 right-0.5 size-6"
              aria-label="Clear file filter"
              onClick={() => {
                onFilterChange("");
                input.current?.focus();
              }}
            >
              <X className="size-3" />
            </Button>
          ) : null}
        </div>
      </div>
      {notice ? <div className="text-muted-foreground text-[11px]">{notice}</div> : null}
    </header>
  );
}

export function FilePaneEmpty({
  title = "No files",
  filtered = false,
  description,
  onClear,
}: {
  title?: string;
  filtered?: boolean;
  description: string;
  onClear?: () => void;
}) {
  return (
    <div role="status" className="flex flex-col items-start gap-2 px-3 py-4 text-xs">
      <p className="font-medium">{filtered ? "No matching files" : title}</p>
      <p className="text-muted-foreground max-w-prose leading-relaxed">
        {filtered ? "No files match the current filter." : description}
      </p>
      {filtered && onClear ? (
        <Button size="xs" variant="outline" onClick={onClear}>
          Clear filter
        </Button>
      ) : null}
    </div>
  );
}
