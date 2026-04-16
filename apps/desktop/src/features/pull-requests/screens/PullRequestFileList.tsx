import { useHotkey } from "@tanstack/react-hotkeys";
import { Filter } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { isTypingTarget } from "@/features/source-control/utils";
import { scrollKeyboardNavItemIntoView } from "@/lib/keyboard-navigation";
import type {
  PullRequestChangedFile,
} from "@/platform/desktop";
import { FileListRow } from "@/features/source-control/components/FileListRow";

type FileCommentFilter = "all" | "with-comments" | "without-comments";

function FilesSidebar({
  files,
  commentCountByPath,
  selectedPath,
  filesError,
  isLoading,
  onSelectFile,
}: {
  files: PullRequestChangedFile[];
  commentCountByPath: Record<string, number>;
  selectedPath: string;
  filesError: string;
  isLoading: boolean;
  onSelectFile: (path: string) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [commentFilter, setCommentFilter] = useState<FileCommentFilter>("all");

  const visibleFiles = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return files.filter((file) => {
      const threadCount = commentCountByPath[file.path] ?? 0;
      const matchesCommentFilter =
        commentFilter === "all" ||
        (commentFilter === "with-comments" && threadCount > 0) ||
        (commentFilter === "without-comments" && threadCount === 0);

      if (!matchesCommentFilter) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return (
        file.path.toLowerCase().includes(normalizedQuery) ||
        (file.previousPath ?? "").toLowerCase().includes(normalizedQuery)
      );
    });
  }, [commentCountByPath, commentFilter, files, searchQuery]);

  const navigateByOffset = (offset: number) => {
    if (visibleFiles.length === 0) return;

    const currentIndex = visibleFiles.findIndex((file) => file.path === selectedPath);
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = Math.max(0, Math.min(visibleFiles.length - 1, safeIndex + offset));
    const nextFile = visibleFiles[nextIndex];
    if (nextFile) {
      scrollKeyboardNavItemIntoView("pull-request-files", nextIndex);
      onSelectFile(nextFile.path);
    }
  };

  useEffect(() => {
    const activeIndex = visibleFiles.findIndex((file) => file.path === selectedPath);
    if (activeIndex >= 0) {
      scrollKeyboardNavItemIntoView("pull-request-files", activeIndex);
    }
  }, [selectedPath, visibleFiles]);

  useHotkey(
    { key: "j" },
    (event) => {
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      navigateByOffset(1);
    },
    { enabled: visibleFiles.length > 0 },
  );

  useHotkey(
    { key: "k" },
    (event) => {
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      navigateByOffset(-1);
    },
    { enabled: visibleFiles.length > 0 },
  );

  return (
    <aside className="bg-surface-toolbar border-border/70 flex h-full min-h-0 flex-col overflow-hidden border-r">
      <div className="border-border border-b px-3 py-2">
        <div className="text-foreground/80 text-[11px] font-semibold tracking-[0.14em]">
          PR FILES
        </div>
        <div className="text-muted-foreground mt-1 text-xs">
          {isLoading && files.length === 0
            ? "Loading changed files..."
            : `${visibleFiles.length}/${files.length} file${files.length === 1 ? "" : "s"} · navigate with j/k`}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="border-input bg-background hover:bg-accent hover:text-accent-foreground inline-flex h-7 w-7 items-center justify-center rounded-md border"
                aria-label="Filter files"
                title="Filter files"
              >
                <Filter className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuRadioGroup
                value={commentFilter}
                onValueChange={(value) => {
                  setCommentFilter(value as FileCommentFilter);
                }}
              >
                <DropdownMenuRadioItem value="all">All files</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="with-comments">With comments</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="without-comments">
                  Without comments
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <Input
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.target.value);
            }}
            placeholder="Filter files..."
            className="h-7 text-xs"
          />
        </div>
      </div>

      <div data-nav-region="pull-request-files" className="min-h-0 flex-1 overflow-auto">
        {filesError ? (
          <div className="text-destructive px-3 py-4 text-sm">{filesError}</div>
        ) : isLoading && files.length === 0 ? (
          <div className="space-y-1 p-2">
            <div className="bg-background/80 h-8 animate-pulse rounded border border-white/6" />
            <div className="bg-background/80 h-8 animate-pulse rounded border border-white/6" />
            <div className="bg-background/80 h-8 animate-pulse rounded border border-white/6" />
          </div>
        ) : files.length === 0 ? (
          <div className="text-muted-foreground px-3 py-4 text-sm">
            No changed files were reported for this pull request.
          </div>
        ) : visibleFiles.length === 0 ? (
          <div className="text-muted-foreground px-3 py-4 text-sm">
            No files match the current filter.
          </div>
        ) : (
          <div className="border-border/70 border-b">
            {visibleFiles.map((file, index) => (
              <FileListRow
                key={`${file.path}:${file.previousPath ?? ""}`}
                path={file.path}
                status={file.status}
                commentCount={commentCountByPath[file.path] ?? 0}
                isActive={file.path === selectedPath}
                navIndex={index}
                onSelect={(event) => {
                  event.preventDefault();
                  onSelectFile(file.path);
                }}
                secondaryLabel={
                  file.previousPath && file.previousPath !== file.path
                    ? `from ${file.previousPath}`
                    : undefined
                }
              />
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

export default FilesSidebar;
