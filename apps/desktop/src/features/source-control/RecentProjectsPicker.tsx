import { useEffect, useState } from "react";
import { FolderOpen, Search, ArrowUp, Folder, LoaderCircle } from "lucide-react";
import { Command as CommandPrimitive } from "cmdk";
import { useHotkey } from "@tanstack/react-hotkeys";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ProjectMonogram } from "@/components/ui/project-monogram";
import { repoLabel, repoParentPath } from "@/features/source-control/utils";
import { desktop } from "@/platform/desktop";
import type { DirectoryListing } from "@/platform/desktop/contracts";

type Props = {
  open: boolean;
  activeRepo: string;
  recentRepos: string[];
  onOpenChange: (open: boolean) => void;
  onSelectRepo: (repoPath: string) => Promise<boolean> | void;
  onChooseFolder: () => void;
  browseDirectory?: (path: string) => Promise<DirectoryListing>;
};

export function RecentProjectsPicker({
  open,
  activeRepo,
  recentRepos,
  onOpenChange,
  onSelectRepo,
  onChooseFolder,
  browseDirectory = desktop.browseDirectory,
}: Props) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState("");
  const [listing, setListing] = useState<{ query: string; result: DirectoryListing } | null>(null);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");
  const pathMode = search.startsWith("/") || search === "~" || search.startsWith("~/");
  const slash = search.lastIndexOf("/");
  const directory = search === "~" ? "~/" : search.slice(0, slash + 1);
  const prefix = search === "~" ? "" : search.slice(slash + 1);
  const result = listing?.query === directory ? listing.result : null;
  const folders = result?.ok
    ? result.entries.filter(
        (entry) =>
          entry.name.toLowerCase().startsWith(prefix.toLowerCase()) &&
          (!entry.name.startsWith(".") || prefix.startsWith(".")),
      )
    : [];
  const candidate = result?.ok ? `${result.path === "/" ? "" : result.path}/${prefix}` : null;
  const filteredRepos = recentRepos.filter((repo) =>
    repo.toLowerCase().includes(search.trim().toLowerCase()),
  );

  useEffect(() => {
    if (!open) {
      setSearch("");
      setError("");
      setListing(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !pathMode || !directory) return;
    let cancelled = false;
    void browseDirectory(directory).then(
      (result) => {
        if (!cancelled) setListing({ query: directory, result });
      },
      () => {
        if (!cancelled)
          setListing({
            query: directory,
            result: {
              ok: false,
              message: "Directory browsing is unavailable. Try choosing a folder.",
            },
          });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [open, pathMode, directory, browseDirectory]);

  function changeSearch(value: string) {
    setSearch(value);
    setSelected("");
    setError("");
  }
  function browse(path: string) {
    changeSearch(path.endsWith("/") ? path : `${path}/`);
  }
  async function openProject(path: string) {
    if (opening) return;
    setOpening(true);
    setError("");
    try {
      const opened = await onSelectRepo(path);
      if (opened === false) setError("This folder could not be opened as a Git repository.");
      else onOpenChange(false);
    } catch {
      setError("Could not open this project. Check the path and try again.");
    } finally {
      setOpening(false);
    }
  }
  useHotkey(
    "Mod+Enter",
    () => {
      if (candidate) void openProject(candidate);
    },
    { enabled: open && pathMode && !opening, ignoreInputs: false },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        animated={false}
        showCloseButton={false}
        className="bg-popover max-w-[640px] gap-0 overflow-hidden rounded-xl p-0"
      >
        <DialogTitle className="sr-only">Open project</DialogTitle>
        <DialogDescription className="sr-only">
          Search recent projects or type a directory path. Select a directory to browse it, then
          choose Open project.
        </DialogDescription>
        <Command
          shouldFilter={false}
          value={selected}
          onValueChange={setSelected}
          className="bg-transparent"
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) event.preventDefault();
          }}
        >
          <div className="flex items-center gap-3 border-b px-4 py-3">
            {pathMode ? (
              <FolderOpen className="text-muted-foreground size-4 shrink-0" />
            ) : (
              <Search className="text-muted-foreground size-4 shrink-0" />
            )}
            <CommandPrimitive.Input
              value={search}
              disabled={opening}
              onValueChange={changeSearch}
              aria-label="Project name or directory path"
              placeholder="Search projects or type a path, ~/proj/…"
              className="placeholder:text-muted-foreground h-8 min-w-0 flex-1 bg-transparent text-sm outline-hidden"
              onKeyDown={(event) => {
                if (event.key === "Tab" && !event.shiftKey && pathMode && folders.length) {
                  event.preventDefault();
                  browse(
                    folders.find((entry) => entry.path === selected)?.path ?? folders[0]!.path,
                  );
                }
              }}
            />
            {pathMode && (
              <button
                type="button"
                disabled={!candidate || opening}
                onClick={() => {
                  if (candidate) void openProject(candidate);
                }}
                className="bg-accent hover:bg-surface-active disabled:opacity-50 rounded-md px-2 py-1 text-xs"
              >
                {opening ? "Opening…" : "Open project"}
              </button>
            )}
          </div>
          <CommandList className="max-h-[360px] p-2" aria-busy={pathMode && !result}>
            {pathMode ? (
              !result ? (
                <div
                  role="status"
                  className="text-muted-foreground flex items-center gap-2 p-3 text-xs"
                >
                  <LoaderCircle className="size-3 animate-spin" /> Loading directories…
                </div>
              ) : !result.ok ? (
                <div role="alert" className="text-muted-foreground p-3 text-sm">
                  {result.message}
                </div>
              ) : (
                <CommandGroup heading="Directories">
                  {result.parentPath !== result.path && (
                    <CommandItem value="parent" onSelect={() => browse(result.parentPath)}>
                      <ArrowUp className="size-4" />
                      ..
                    </CommandItem>
                  )}
                  {folders.map((entry) => (
                    <CommandItem
                      key={entry.path}
                      value={entry.path}
                      onSelect={() => browse(entry.path)}
                      className="min-h-9"
                    >
                      <Folder className="text-muted-foreground size-4" />
                      <span className="truncate">{entry.name}</span>
                    </CommandItem>
                  ))}
                  {!folders.length && (
                    <p className="text-muted-foreground p-3 text-xs">
                      No matching subdirectories. Open this path or edit it to continue.
                    </p>
                  )}
                </CommandGroup>
              )
            ) : (
              <>
                <CommandGroup heading="Recent projects">
                  {filteredRepos.map((repo) => (
                    <CommandItem
                      key={repo}
                      value={repo}
                      disabled={opening}
                      onSelect={() => {
                        void openProject(repo);
                      }}
                      className="gap-3 rounded-md px-3 py-2"
                    >
                      <ProjectMonogram name={repoLabel(repo)} identity={repo} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm">{repoLabel(repo)}</div>
                        <div className="text-muted-foreground truncate text-xs">
                          {repoParentPath(repo)}
                        </div>
                      </div>
                      {repo === activeRepo && (
                        <span className="text-muted-foreground text-[10px]">Open</span>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
                <CommandEmpty>No matching projects. Type ~/ to browse folders.</CommandEmpty>
              </>
            )}
          </CommandList>
          {error && (
            <p role="alert" className="text-destructive px-4 pb-3 text-xs">
              {error}
            </p>
          )}
          <div className="text-muted-foreground flex items-center justify-between gap-3 border-t px-4 py-2 text-xs">
            <span>
              {pathMode
                ? "↑ ↓ Navigate · Tab Complete · ⌘ Enter Open"
                : "↑ ↓ Navigate · Enter Open"}
            </span>
            <button
              type="button"
              className="hover:text-foreground inline-flex shrink-0 items-center gap-2 rounded px-2 py-1 focus-visible:ring-1 focus-visible:ring-ring"
              onClick={() => {
                onOpenChange(false);
                onChooseFolder();
              }}
            >
              <FolderOpen className="size-3.5" />
              Choose folder…
            </button>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
