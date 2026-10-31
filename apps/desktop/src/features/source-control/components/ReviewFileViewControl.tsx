import { ChevronDown, FolderTree, GitCommitHorizontal, Layers3, List } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ReviewFileView } from "./reviewFileGrouping";

const views = [
  { value: "review", label: "Review groups", icon: Layers3 },
  { value: "tree", label: "Folders", icon: FolderTree },
  { value: "list", label: "Flat list", icon: List },
] as const;

export function ReviewFileViewControl({
  value,
  onChange,
  compact = false,
  commitGrouping,
}: {
  value: ReviewFileView;
  onChange: (value: ReviewFileView) => void;
  compact?: boolean;
  commitGrouping?: { selected: boolean; onSelect: () => void };
}) {
  const selected = commitGrouping?.selected
    ? { label: "Commits", icon: GitCommitHorizontal }
    : (views.find((view) => view.value === value) ?? views[0]);
  const Icon = selected.icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={compact ? "size-7 p-0" : "h-8 min-w-0 max-w-full gap-2 px-2 text-xs"}
          aria-label={`Group review files: ${selected.label}`}
          title={selected.label}
        >
          <Icon className="size-3.5" />
          {compact ? null : (
            <>
              <span className="truncate">{selected.label}</span>
              <ChevronDown className="size-3.5 text-muted-foreground" />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-48">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Group files by
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={commitGrouping?.selected ? "commits" : value}
          onValueChange={(next) => {
            if (next === "commits") {
              commitGrouping?.onSelect();
              return;
            }
            const view = views.find((candidate) => candidate.value === next);
            if (view) onChange(view.value);
          }}
        >
          {views.map((view) => (
            <DropdownMenuRadioItem key={view.value} value={view.value} className="min-h-8">
              <view.icon className="size-4 text-muted-foreground" />
              {view.label}
            </DropdownMenuRadioItem>
          ))}
          {commitGrouping ? (
            <DropdownMenuRadioItem value="commits" className="min-h-8">
              <GitCommitHorizontal className="text-muted-foreground size-4" />
              Commits
            </DropdownMenuRadioItem>
          ) : null}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
