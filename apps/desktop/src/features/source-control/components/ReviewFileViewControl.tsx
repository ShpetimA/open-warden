import { ChevronDown, FolderTree, Layers3, List } from "lucide-react";

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
}: {
  value: ReviewFileView;
  onChange: (value: ReviewFileView) => void;
}) {
  const selected = views.find((view) => view.value === value) ?? views[0];
  const Icon = selected.icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-10 min-w-0 max-w-full gap-2 px-2 text-xs"
          aria-label={`Group review files: ${selected.label}`}
        >
          <Icon className="size-3.5" />
          <span className="truncate">{selected.label}</span>
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-48">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Group files by
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next) => {
            const view = views.find((candidate) => candidate.value === next);
            if (view) onChange(view.value);
          }}
        >
          {views.map((view) => (
            <DropdownMenuRadioItem key={view.value} value={view.value} className="min-h-10">
              <view.icon className="size-4 text-muted-foreground" />
              {view.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
