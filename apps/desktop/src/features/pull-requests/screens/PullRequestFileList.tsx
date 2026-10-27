import { skipToken } from "@reduxjs/toolkit/query";
import { useHotkey } from "@tanstack/react-hotkeys";
import { Filter } from "lucide-react";
import { useEffect, useState } from "react";

import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ListLoadingState } from "@/components/ui/list-loading-state";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { countCommentsForPathInRepoContext } from "@/features/comments/selectors";
import { useGetPullRequestConversationQuery } from "@/features/hosted-repos/api";
import type { usePullRequestViewedFiles } from "@/features/pull-requests/hooks/usePullRequestViewedFiles";
import { ReviewFileViewControl } from "@/features/source-control/components/ReviewFileViewControl";
import { CommitHoverDetails } from "@/features/source-control/components/CommitHoverDetails";
import type { ReviewFileView } from "@/features/source-control/components/reviewFileGrouping";
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
  viewedState: ReturnType<typeof usePullRequestViewedFiles> | null;
  keyboardNavigationEnabled?: boolean;
  fileView: ReviewFileView;
  onFileViewChange: (view: ReviewFileView) => void;
  onGroupByCommit?: () => void;
  commitTitle?: string;
  commitId?: string;
};

export default function PullRequestFileList({
  files,
  repoPath,
  pullRequestNumber,
  compareBaseRef,
  compareHeadRef,
  filesError,
  isLoading,
  viewedState,
  keyboardNavigationEnabled = true,
  fileView,
  onFileViewChange,
  onGroupByCommit,
  commitTitle,
  commitId,
}: PullRequestFileListProps) {
  const dispatch = useAppDispatch();
  const activePath = useAppSelector((state) => state.pullRequests.previewActiveFilePath);
  const comments = useAppSelector((state) => state.comments);
  const [searchQuery, setSearchQuery] = useState("");
  const [commentFilter, setCommentFilter] = useState<FileCommentFilter>("all");
  const viewedFiles = viewedState?.viewedFiles;
  const viewedPaths = viewedState?.viewedPaths;
  const queryArg = repoPath && pullRequestNumber > 0 ? { repoPath, pullRequestNumber } : skipToken;
  const { reviewThreads } = useGetPullRequestConversationQuery(queryArg, {
    selectFromResult: ({ data }) => ({
      reviewThreads: data?.reviewThreads ?? EMPTY_REVIEW_THREADS,
    }),
    pollingInterval: 10000,
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });
  const viewedCount = files.filter((file) => viewedPaths?.has(file.path)).length;
  const commentCountByPath: Record<string, number> = {};

  for (const file of files) {
    commentCountByPath[file.path] = viewedState
      ? countCommentsForPathInRepoContext(comments, repoPath, file.path, {
          kind: "review",
          baseRef: compareBaseRef,
          headRef: compareHeadRef,
        }) +
        countPullRequestThreadsForFile({
          path: file.path,
          previousPath: file.previousPath,
          reviewThreads,
        })
      : 0;
  }

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const visibleFiles = files.filter((file) => {
    const commentCount = commentCountByPath[file.path] ?? 0;
    const matchesCommentFilter =
      !viewedState ||
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

  useSimpleFileListKeyboardNav({
    enabled: () => keyboardNavigationEnabled,
    regionId: "pull-request-files",
    getAllFilePaths: () => visibleFiles.map((file) => file.path),
    getActivePath: (state) => state.pullRequests.previewActiveFilePath,
    onSelectPath: (path) => {
      dispatch(setPullRequestPreviewActiveFilePath(path));
    },
    includeSymbolPeek: false,
  });

  const filteredCount =
    normalizedQuery || (viewedState && commentFilter !== "all") ? `${visibleFiles.length}/` : "";
  const viewedSummary = viewedState ? ` · ${viewedCount} viewed` : "";
  const fileLabel = files.length === 1 ? "file" : "files";
  const subtitle =
    isLoading && files.length === 0
      ? "Loading changed files..."
      : `${filteredCount}${files.length} ${fileLabel}${viewedSummary}`;

  return (
    <>
      <PullRequestVisibleSelectionSync visibleFiles={visibleFiles} />
      {viewedState ? (
        <PullRequestViewedFileHotkeys visibleFiles={visibleFiles} viewedState={viewedState} />
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="border-border flex shrink-0 flex-col gap-1 border-b px-2 py-1">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <div
              className="text-muted-foreground min-w-0 truncate text-xs tabular-nums"
              title={viewedFiles?.storage === "device" ? "Viewed on this device" : undefined}
            >
              {subtitle}
            </div>
            <ReviewFileViewControl
              value={fileView}
              onChange={onFileViewChange}
              compact
              commitGrouping={
                onGroupByCommit ? { selected: false, onSelect: onGroupByCommit } : undefined
              }
            />
          </div>
          {viewedFiles?.truncated ? (
            <div className="text-muted-foreground text-[11px]">
              Some provider viewed states could not be loaded.
            </div>
          ) : null}
          <div className="flex items-center gap-2">
            {viewedState ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    size="icon"
                    variant={commentFilter === "all" ? "outline" : "secondary"}
                    className="size-7"
                    aria-label="Filter files"
                    title="Filter files"
                  >
                    <Filter className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  <DropdownMenuRadioGroup
                    value={commentFilter}
                    onValueChange={(value) => {
                      if (
                        value === "all" ||
                        value === "with-comments" ||
                        value === "without-comments"
                      ) {
                        setCommentFilter(value);
                      }
                    }}
                  >
                    <DropdownMenuRadioItem value="all">All files</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="with-comments">
                      With comments
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="without-comments">
                      Without comments
                    </DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            <Input
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value);
              }}
              placeholder="Filter files..."
              aria-label="Filter changed files"
              title={
                viewedState ? "j/k to navigate files · v to mark viewed" : "j/k to navigate files"
              }
              className="h-7 min-w-0 px-2 text-xs"
            />
          </div>
        </div>
        {isLoading && visibleFiles.length === 0 ? (
          <ListLoadingState label="Loading changed files…" />
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
            autoFocus={keyboardNavigationEnabled}
            mode={fileView}
            reviewGroupTitle={commitTitle}
            reviewGroupHover={
              commitId ? (
                <CommitHoverDetails commitId={commitId} summary={commitTitle ?? commitId} />
              ) : undefined
            }
            selectedPath={activePath}
            navRegion="pull-request-files"
            onActivatePath={(path) => {
              dispatch(setPullRequestPreviewActiveFilePath(path));
            }}
            getCommentCount={(file) => commentCountByPath[file.path] ?? 0}
            isViewed={(file) => viewedPaths?.has(file.path) ?? false}
            getFileStatus={(file) => file.status}
          />
        )}
      </div>
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

/** `V` marks the active file viewed and moves on to the next unviewed one; `Shift+V` stays put. */
function PullRequestViewedFileHotkeys({
  visibleFiles,
  viewedState,
}: {
  visibleFiles: PullRequestChangedFile[];
  viewedState: ReturnType<typeof usePullRequestViewedFiles>;
}) {
  const dispatch = useAppDispatch();
  const activePath = useAppSelector((state) => state.pullRequests.previewActiveFilePath);
  const { viewedPaths, toggleViewed } = viewedState;

  function toggleActiveFile(advance: boolean) {
    if (!activePath) return;
    const markingViewed = !viewedPaths.has(activePath);
    void toggleViewed(activePath);
    if (!advance || !markingViewed) return;

    const activeIndex = visibleFiles.findIndex((file) => file.path === activePath);
    const ordered = [...visibleFiles.slice(activeIndex + 1), ...visibleFiles.slice(0, activeIndex)];
    const next = ordered.find((file) => !viewedPaths.has(file.path));
    if (next) dispatch(setPullRequestPreviewActiveFilePath(next.path));
  }

  useHotkey("V", () => toggleActiveFile(true));
  useHotkey("Shift+V", () => toggleActiveFile(false));

  return null;
}
