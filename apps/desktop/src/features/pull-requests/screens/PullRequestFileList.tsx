import { skipToken } from "@reduxjs/toolkit/query";
import { Filter } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { countCommentsForPathInRepoContext } from "@/features/comments/selectors";
import { useGetPullRequestConversationQuery } from "@/features/hosted-repos/api";
import { FileList } from "@/features/source-control/components/FileList";
import { useSimpleFileListKeyboardNav } from "@/features/source-control/hooks/useSimpleFileListKeyboardNav";
import { countPullRequestThreadsForFile } from "@/features/pull-requests/utils/reviewThreadAnnotations";
import { setPullRequestPreviewActiveFilePath } from "@/features/pull-requests/pullRequestsSlice";
import type { PullRequestChangedFile, PullRequestReviewThread } from "@/platform/desktop";

type FileCommentFilter = "all" | "with-comments" | "without-comments";

const EMPTY_REVIEW_THREADS: PullRequestReviewThread[] = [];

type PullRequestFileListProps = {
  files: PullRequestChangedFile[];
  repoPath: string;
  pullRequestNumber: number;
  compareBaseRef: string;
  compareHeadRef: string;
  filesError: string;
  isLoading: boolean;
};

function loadingState() {
  return (
    <div className="space-y-1 p-2">
      <div className="bg-background/80 h-8 animate-pulse rounded border border-white/6" />
      <div className="bg-background/80 h-8 animate-pulse rounded border border-white/6" />
      <div className="bg-background/80 h-8 animate-pulse rounded border border-white/6" />
    </div>
  );
}

export default function PullRequestFileList({
  files,
  repoPath,
  pullRequestNumber,
  compareBaseRef,
  compareHeadRef,
  filesError,
  isLoading,
}: PullRequestFileListProps) {
  const dispatch = useAppDispatch();
  const fileBrowserMode = useAppSelector(
    (state) => state.settings.appSettings.sourceControl.fileTreeRenderMode,
  );
  const activePath = useAppSelector((state) => state.pullRequests.previewActiveFilePath);
  const comments = useAppSelector((state) => state.comments);
  const [searchQuery, setSearchQuery] = useState("");
  const [commentFilter, setCommentFilter] = useState<FileCommentFilter>("all");
  const { reviewThreads } = useGetPullRequestConversationQuery(
    repoPath && pullRequestNumber > 0 ? { repoPath, pullRequestNumber } : skipToken,
    {
      selectFromResult: ({ data }) => ({
        reviewThreads: data?.reviewThreads ?? EMPTY_REVIEW_THREADS,
      }),
      pollingInterval: 10000,
      refetchOnFocus: true,
      refetchOnReconnect: true,
    },
  );
  const pendingCommentCountByPath = useMemo(() => {
    const counts: Record<string, number> = {};

    for (const file of files) {
      counts[file.path] = countCommentsForPathInRepoContext(comments, repoPath, file.path, {
        kind: "review",
        baseRef: compareBaseRef,
        headRef: compareHeadRef,
      });
    }

    return counts;
  }, [comments, compareBaseRef, compareHeadRef, files, repoPath]);
  const commentCountByPath = useMemo(() => {
    const counts: Record<string, number> = {};

    for (const file of files) {
      counts[file.path] =
        countPullRequestThreadsForFile({
          path: file.path,
          previousPath: file.previousPath,
          reviewThreads,
        }) + (pendingCommentCountByPath[file.path] ?? 0);
    }

    return counts;
  }, [files, pendingCommentCountByPath, reviewThreads]);

  const visibleFiles = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return files.filter((file) => {
      const commentCount = commentCountByPath[file.path] ?? 0;
      const matchesCommentFilter =
        commentFilter === "all" ||
        (commentFilter === "with-comments" && commentCount > 0) ||
        (commentFilter === "without-comments" && commentCount === 0);

      if (!matchesCommentFilter) {
        return false;
      }

      return (
        !normalizedQuery ||
        file.path.toLowerCase().includes(normalizedQuery) ||
        (file.previousPath ?? "").toLowerCase().includes(normalizedQuery)
      );
    });
  }, [commentCountByPath, commentFilter, files, searchQuery]);

  useSimpleFileListKeyboardNav({
    regionId: "pull-request-files",
    getAllFilePaths: () => visibleFiles.map((file) => file.path),
    getActivePath: (state) => state.pullRequests.previewActiveFilePath,
    onSelectPath: (path) => {
      dispatch(setPullRequestPreviewActiveFilePath(path));
    },
    includeSymbolPeek: false,
  });

  const subtitle =
    isLoading && files.length === 0
      ? "Loading changed files..."
      : `${visibleFiles.length}/${files.length} file${files.length === 1 ? "" : "s"} · navigate with j/k`;

  return (
    <>
      <PullRequestVisibleSelectionSync visibleFiles={visibleFiles} />
      <aside className="bg-surface-toolbar border-border/70 flex h-full min-h-0 flex-col overflow-hidden border-r">
        <div className="border-border border-b px-3 py-2">
          <div className="text-foreground/80 text-[11px] font-semibold tracking-[0.14em]">
            PR FILES
          </div>
          <div className="text-muted-foreground mt-1 text-xs">{subtitle}</div>
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
        {isLoading && visibleFiles.length === 0 ? (
          loadingState()
        ) : filesError ? (
          <div className="text-destructive px-3 py-4 text-sm">{filesError}</div>
        ) : visibleFiles.length === 0 ? (
          files.length === 0 ? (
            <div className="text-muted-foreground px-3 py-4 text-sm">
              No changed files were reported for this pull request.
            </div>
          ) : (
            <div className="text-muted-foreground px-3 py-4 text-sm">
              No files match the current filter.
            </div>
          )
        ) : (
          <FileList
            files={visibleFiles}
            mode={fileBrowserMode}
            selectedPath={activePath}
            navRegion="pull-request-files"
            onActivatePath={(path) => {
              dispatch(setPullRequestPreviewActiveFilePath(path));
            }}
            getCommentCount={(file) => commentCountByPath[file.path] ?? 0}
            getFileStatus={(file) => file.status}
          />
        )}
      </aside>
    </>
  );
}

function PullRequestVisibleSelectionSync({
  visibleFiles,
}: {
  visibleFiles: PullRequestChangedFile[];
}) {
  const dispatch = useAppDispatch();
  const activePath = useAppSelector((state) => state.pullRequests.previewActiveFilePath);

  useEffect(() => {
    if (visibleFiles.length === 0) {
      return;
    }

    const activeVisibleFile = visibleFiles.find((file) => file.path === activePath);
    if (!activeVisibleFile) {
      dispatch(setPullRequestPreviewActiveFilePath(visibleFiles[0].path));
    }
  }, [activePath, dispatch, visibleFiles]);

  return null;
}
