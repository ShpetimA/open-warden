import { useDeferredValue, useRef, useState } from "react";
import { useHotkey } from "@tanstack/react-hotkeys";
import { defaultFilter } from "cmdk";
import { File, FolderSearch } from "lucide-react";
import { useNavigate } from "react-router";

import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { Command, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ErrorNotice } from "@/components/ui/error-state";
import { Kbd } from "@/components/ui/kbd";
import { useGetRepoFilesQuery } from "../api";
import { createFileViewerFocusKey } from "../fileViewerNavigation";
import { openFileViewer } from "../sourceControlSlice";
import { workingFileKey } from "../fileEditorSlice";

export function FileQuickOpen({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const previousFocus = useRef<HTMLElement | null>(null);
  useHotkey(
    "Mod+P",
    (event) => {
      event.preventDefault();
      if (!open) previousFocus.current = activeElementWithinShadowRoots();
      onOpenChange(!open);
    },
    { ignoreInputs: false },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <FileQuickOpenContent
          restoreFocus={previousFocus.current}
          onClose={() => onOpenChange(false)}
        />
      ) : null}
    </Dialog>
  );
}

function FileQuickOpenContent({
  onClose,
  restoreFocus,
}: {
  onClose: () => void;
  restoreFocus: HTMLElement | null;
}) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const repoPath = useAppSelector((state) => state.sourceControl.activeRepo);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState("");
  const deferredQuery = useDeferredValue(query);
  const openingFile = useRef(false);
  const {
    currentData: files,
    isFetching,
    error,
    refetch,
  } = useGetRepoFilesQuery(repoPath, { skip: !repoPath });
  const { matches, location } = findFileMatches(files ?? [], deferredQuery);

  function openFile(path: string, position = location) {
    if (!repoPath) return;
    openingFile.current = true;
    dispatch(
      openFileViewer({
        repoPath,
        relPath: path,
        line: position ? Math.max(1, Number(position[1])) : null,
        column: position?.[2] ? Math.max(0, Number(position[2]) - 1) : null,
        focusKey: createFileViewerFocusKey(),
      }),
    );
    navigate("/changes/files");
    onClose();
  }

  return (
    <DialogContent
      className="bg-surface-elevated top-[12vh] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-[600px]"
      showCloseButton={false}
      animated={false}
      onCloseAutoFocus={(event) => {
        if (openingFile.current) event.preventDefault();
        else if (restoreFocus?.isConnected) {
          event.preventDefault();
          restoreFocus.focus({ preventScroll: true });
        }
      }}
    >
      <DialogTitle className="sr-only">Quick Open file</DialogTitle>
      <DialogDescription className="sr-only">
        Search repository files by name or path. Add :line to jump to a line.
      </DialogDescription>
      <Command
        shouldFilter={false}
        value={
          matches.some(({ file }) => file.path === highlighted)
            ? highlighted
            : (matches[0]?.file.path ?? "")
        }
        onValueChange={setHighlighted}
        className="bg-transparent"
      >
        <CommandInput
          aria-label="Quick Open file"
          placeholder="Search files by name or path…"
          value={query}
          onValueChange={(value) => {
            setHighlighted("");
            setQuery(value);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            event.stopPropagation();
            const current = findFileMatches(files ?? [], query);
            const selected =
              current.matches.find(({ file }) => file.path === highlighted) ?? current.matches[0];
            if (selected) openFile(selected.file.path, current.location);
          }}
        />
        <CommandList className="max-h-[min(360px,60vh)] p-1">
          {!repoPath ? (
            <p className="text-muted-foreground p-3 text-xs">Open a repository to find files.</p>
          ) : !files && isFetching ? (
            <p role="status" className="text-muted-foreground p-3 text-xs">
              Loading repository files…
            </p>
          ) : !error && matches.length === 0 ? (
            <p className="text-muted-foreground p-3 text-xs">No matching files.</p>
          ) : null}
          {matches.slice(0, 80).map(({ file }) => (
            <CommandItem
              key={file.path}
              value={file.path}
              disabled={query !== deferredQuery}
              onSelect={() => openFile(file.path)}
              className="gap-2 px-2 py-1.5 text-xs"
            >
              <File className="size-3.5" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{file.path.split("/").at(-1)}</span>
                <span className="text-muted-foreground block truncate text-[11px]">
                  {file.path}
                </span>
              </span>
              <QuickOpenDraftIndicator repoPath={repoPath} relPath={file.path} />
            </CommandItem>
          ))}
          {error ? (
            <ErrorNotice
              title="Couldn’t load files"
              error={error}
              busy={isFetching}
              recovery={{ label: "Retry", onAction: () => void refetch() }}
            />
          ) : null}
        </CommandList>
      </Command>
      <div className="text-muted-foreground flex items-center gap-2 border-t px-3 py-2 text-[11px]">
        <FolderSearch className="size-3.5" />
        <span className="min-w-0 flex-1 truncate">
          {matches.length} files · name, path or file:line
        </span>
        <Kbd>↵</Kbd> Open <Kbd>Esc</Kbd> Close
      </div>
    </DialogContent>
  );
}

function QuickOpenDraftIndicator({ repoPath, relPath }: { repoPath: string; relPath: string }) {
  const dirty = useAppSelector((state) => {
    const document = state.fileEditor.documents[workingFileKey({ repoPath, relPath })];
    return document && document.contents !== document.baseContents;
  });
  return dirty ? <span className="text-muted-foreground shrink-0 text-[11px]">Unsaved</span> : null;
}

function findFileMatches(files: readonly { path: string }[], query: string) {
  const location = /:(\d+)(?::(\d+))?$/.exec(query);
  const search = (location ? query.slice(0, location.index) : query).trim();
  const matches = files
    .filter((file) => !file.path.endsWith("/"))
    .map((file) => ({
      file,
      score: search
        ? defaultFilter(file.path, search, [file.path.split("/").at(-1) ?? file.path])
        : 1,
    }))
    .filter(({ score }) => score > 0)
    .toSorted((a, b) => b.score - a.score || a.file.path.localeCompare(b.file.path));
  return { matches, location };
}

function activeElementWithinShadowRoots() {
  let element = document.activeElement;
  while (element?.shadowRoot?.activeElement) element = element.shadowRoot.activeElement;
  return element instanceof HTMLElement ? element : null;
}
