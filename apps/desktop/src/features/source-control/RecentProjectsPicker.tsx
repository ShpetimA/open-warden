import { useDeferredValue, useEffect, useState } from "react";
import { FolderOpen, Search, ArrowRight, X } from "lucide-react";
import { Command as CommandPrimitive } from "cmdk";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { repoLabel, repoParentPath } from "@/features/source-control/utils";

type RecentProjectsPickerProps = {
  open: boolean;
  activeRepo: string;
  recentRepos: string[];
  onOpenChange: (open: boolean) => void;
  onSelectRepo: (repoPath: string) => void;
  onChooseFolder: () => void;
};

function matchesSearch(repoPath: string, query: string): boolean {
  if (!query) return true;

  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  return `${repoLabel(repoPath)} ${repoPath}`.toLowerCase().includes(normalizedQuery);
}

export function RecentProjectsPicker({
  open,
  activeRepo,
  recentRepos,
  onOpenChange,
  onSelectRepo,
  onChooseFolder,
}: RecentProjectsPickerProps) {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const filteredRepos = recentRepos.filter((repoPath) => matchesSearch(repoPath, deferredSearch));

  useEffect(() => {
    if (!open) {
      setSearch("");
    }
  }, [open]);

  function handleChooseFolder() {
    onOpenChange(false);
    onChooseFolder();
  }

  function handleSelectRepo(repoPath: string) {
    onOpenChange(false);
    onSelectRepo(repoPath);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader className="sr-only">
        <DialogTitle>Recent projects</DialogTitle>
        <DialogDescription>Search and reopen a recent repository.</DialogDescription>
      </DialogHeader>
      <DialogContent
        animated={false}
        showCloseButton={false}
        className="border-border/70 bg-background/96 max-w-[820px] gap-0 overflow-hidden rounded-2xl p-0 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl"
      >
        <Command shouldFilter={false} className="bg-transparent">
          <div className="border-border/70 flex items-center gap-3 border-b px-4 py-3">
            <Search className="text-muted-foreground h-4 w-4 shrink-0" />
            <CommandPrimitive.Input
              value={search}
              onValueChange={setSearch}
              className="placeholder:text-muted-foreground h-8 flex-1 bg-transparent text-[15px] outline-hidden"
              placeholder="Select to open a recent project or choose a folder..."
            />
            {search ? (
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground inline-flex h-7 w-7 items-center justify-center rounded-md transition-[transform,color] duration-150 ease-[var(--ease-out)] active:scale-[0.95]"
                onClick={() => {
                  setSearch("");
                }}
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          <CommandList className="max-h-[460px] px-2 py-2">
            {filteredRepos.length > 0 ? (
              <CommandGroup heading={`Recent Projects (${filteredRepos.length})`}>
                {filteredRepos.map((repoPath) => {
                  const isActive = repoPath === activeRepo;

                  return (
                    <CommandItem
                      key={repoPath}
                      value={`${repoLabel(repoPath)} ${repoPath}`}
                      className="data-[selected=true]:bg-accent/55 group min-h-12 rounded-xl px-3 py-2"
                      onSelect={() => {
                        handleSelectRepo(repoPath);
                      }}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-[15px] font-medium">{repoLabel(repoPath)}</span>
                          {isActive ? (
                            <span className="text-muted-foreground rounded-full border border-white/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.16em]">
                              Open
                            </span>
                          ) : null}
                        </div>
                        <div className="text-muted-foreground truncate text-xs">
                          {repoParentPath(repoPath)}
                        </div>
                      </div>
                      <ArrowRight className="text-muted-foreground h-4 w-4 opacity-0 transition-opacity duration-150 group-data-[selected=true]:opacity-100" />
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ) : (
              <CommandEmpty className="py-12">
                <div className="flex flex-col items-center gap-3">
                  <div className="bg-surface-alt text-muted-foreground flex h-10 w-10 items-center justify-center rounded-xl border border-white/8">
                    <FolderOpen className="h-4 w-4" />
                  </div>
                  <div className="space-y-1 text-center">
                    <div className="text-sm font-medium">No matching recent projects</div>
                    <div className="text-muted-foreground text-xs">
                      Choose a folder to open a repository directly.
                    </div>
                  </div>
                </div>
              </CommandEmpty>
            )}
          </CommandList>

          <div className="border-border/70 flex items-center justify-between border-t px-3 py-2">
            <div className="text-muted-foreground text-xs">
              {recentRepos.length} recent project{recentRepos.length === 1 ? "" : "s"}
            </div>
            <button
              type="button"
              className="bg-surface-alt text-foreground hover:bg-accent inline-flex h-9 items-center gap-2 rounded-lg border border-white/8 px-3 text-sm transition-[transform,background-color] duration-150 ease-[var(--ease-out)] active:scale-[0.98]"
              onClick={handleChooseFolder}
            >
              <FolderOpen className="h-4 w-4" />
              Create or Open Folder
            </button>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
