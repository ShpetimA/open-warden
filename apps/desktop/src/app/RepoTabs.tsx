import { useState, type WheelEvent } from "react";
import { ChevronRight, FolderOpen, Plus, X } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { repoLabel, repoParentPath } from "@/features/source-control/utils";

type Props = {
  repos: Array<string | undefined>;
  activeRepo: string;
  recentRepos: string[];
  placement?: "top" | "bottom";
  onSelectRepo: (repo: string) => void;
  onCloseRepo: (repo: string) => void;
  onOpenRecentRepo: (repo: string) => void;
  onShowAllRecentProjects: () => void;
  onOpenFolder: () => void;
};

function tabPillClass(isActive: boolean): string {
  if (isActive) {
    return "bg-surface-active text-foreground shadow-xs ring-1 ring-border/60";
  }
  return "text-muted-foreground hover:bg-accent/60 hover:text-foreground";
}

function scrollTabsWithVerticalWheel(event: WheelEvent<HTMLDivElement>) {
  if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
    return;
  }

  const tabList = event.currentTarget;
  const maximumScrollLeft = Math.max(0, tabList.scrollWidth - tabList.clientWidth);
  const nextScrollLeft = Math.min(
    maximumScrollLeft,
    Math.max(0, tabList.scrollLeft + event.deltaY),
  );
  if (nextScrollLeft === tabList.scrollLeft) {
    return;
  }

  tabList.scrollLeft = nextScrollLeft;
  event.preventDefault();
}

export function RepoTabs({
  repos,
  activeRepo,
  recentRepos,
  placement = "bottom",
  onSelectRepo,
  onCloseRepo,
  onOpenRecentRepo,
  onShowAllRecentProjects,
  onOpenFolder,
}: Props) {
  const openRepos = repos.filter((repoPath): repoPath is string => Boolean(repoPath));
  const [pickerOpen, setPickerOpen] = useState(false);
  const previewRecentRepos = recentRepos.slice(0, 5);

  return (
    <div
      className={cn(
        "border-border/70 bg-surface h-full min-w-0 overflow-hidden px-1.5",
        placement === "top" ? "border-b pt-1.5" : "border-t",
      )}
    >
      <div
        role="navigation"
        aria-label="Open repositories"
        className="flex h-full w-full min-w-0 items-center gap-1 overflow-x-auto overflow-y-hidden overscroll-x-contain"
        onWheel={scrollTabsWithVerticalWheel}
      >
        {openRepos.map((repoPath, index) => {
          const isActive = repoPath === activeRepo;
          const pillClass = tabPillClass(isActive);
          const firstTabEdgeClass = index === 0 && placement === "bottom" ? "rounded-tl-none" : "";

          return (
            <div
              key={repoPath}
              data-active={isActive || undefined}
              className={`group/tab flex h-7 shrink-0 items-center rounded-md pr-1 pl-2 transition-[background-color,color,box-shadow,--tw-ring-color] duration-150 ease-out ${pillClass} ${firstTabEdgeClass}`}
              title={repoPath}
            >
              <button
                type="button"
                className="flex h-full max-w-56 min-w-0 items-center truncate text-sm font-medium"
                onClick={() => onSelectRepo(repoPath)}
              >
                {repoLabel(repoPath)}
              </button>
              <button
                type="button"
                className="text-muted-foreground hover:bg-foreground/12 hover:text-foreground ml-1 inline-flex size-5 items-center justify-center rounded-sm opacity-0 transition-[transform,background-color,color,opacity] duration-150 ease-[var(--ease-out)] group-hover/tab:opacity-80 hover:scale-110 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:hover:scale-110 active:scale-90 active:opacity-100"
                onClick={(event) => {
                  event.stopPropagation();
                  onCloseRepo(repoPath);
                }}
                aria-label={`Close ${repoLabel(repoPath)} repository`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}

        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="border-border/70 text-muted-foreground hover:bg-accent hover:text-foreground inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition-[transform,background-color] duration-150 ease-[var(--ease-out)] active:scale-[0.95]"
              title="Open repository menu"
              aria-label="Open repository menu"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            side={placement === "top" ? "bottom" : "top"}
            align="start"
            sideOffset={8}
            className="border-border/70 bg-background/96 w-[320px] rounded-xl p-1.5 shadow-[0_18px_48px_rgba(0,0,0,0.35)] backdrop-blur-xl"
          >
            <div className="px-2 pb-1 pt-0.5">
              <div className="text-foreground text-xs font-medium">Recent Projects</div>
              <div className="text-muted-foreground text-[11px]">
                Reopen quickly or browse the full list.
              </div>
            </div>

            <div className="space-y-1">
              {previewRecentRepos.length > 0 ? (
                previewRecentRepos.map((repoPath) => {
                  const isActive = repoPath === activeRepo;

                  return (
                    <button
                      key={repoPath}
                      type="button"
                      className="hover:bg-accent/50 flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-[transform,background-color] duration-150 ease-[var(--ease-out)] active:scale-[0.99]"
                      onClick={() => {
                        setPickerOpen(false);
                        onOpenRecentRepo(repoPath);
                      }}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{repoLabel(repoPath)}</div>
                        <div className="text-muted-foreground truncate text-xs">
                          {repoParentPath(repoPath)}
                        </div>
                      </div>
                      {isActive ? (
                        <span className="text-muted-foreground rounded-full border border-white/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em]">
                          Open
                        </span>
                      ) : (
                        <ChevronRight className="text-muted-foreground h-3.5 w-3.5" />
                      )}
                    </button>
                  );
                })
              ) : (
                <div className="text-muted-foreground px-2.5 py-3 text-sm">
                  No recent projects yet.
                </div>
              )}
            </div>

            <div className="border-border/60 mt-1 border-t pt-1">
              <button
                type="button"
                className="hover:bg-accent/50 flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm transition-[transform,background-color] duration-150 ease-[var(--ease-out)] active:scale-[0.99]"
                onClick={() => {
                  setPickerOpen(false);
                  onShowAllRecentProjects();
                }}
              >
                <span>Show all recent projects</span>
                <ChevronRight className="text-muted-foreground h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className="hover:bg-accent/50 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-[transform,background-color] duration-150 ease-[var(--ease-out)] active:scale-[0.99]"
                onClick={() => {
                  setPickerOpen(false);
                  onOpenFolder();
                }}
              >
                <FolderOpen className="text-muted-foreground h-3.5 w-3.5" />
                <span>Create or open folder</span>
              </button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
