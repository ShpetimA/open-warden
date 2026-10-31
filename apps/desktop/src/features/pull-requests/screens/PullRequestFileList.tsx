import { ErrorState, ErrorNotice } from "@/components/ui/error-state";
import { skipToken } from "@reduxjs/toolkit/query";
import { useHotkey } from "@tanstack/react-hotkeys";
import { Filter } from "lucide-react";
import { useState } from "react";

import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { FilePaneEmpty, FilePaneHeader } from "@/features/source-control/components/FilePaneHeader";
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
import {
  getNextUnviewedPierreFile,
  scrollPierreFileTreeRealPathIntoView,
} from "@/features/source-control/pierreFileTreeNavigation";
import { selectPullRequestFilePath } from "@/features/source-control/fileSelection";
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
  failure?: unknown;
  onRetry?: () => void;
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
  failure,
  onRetry,
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
      {viewedState ? (
        <PullRequestViewedFileHotkeys
          enabled={keyboardNavigationEnabled}
          viewedState={viewedState}
        />
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <FilePaneHeader
          title={commitId ? "Commit files" : "PR files"}
          summary={
            <span title={viewedFiles?.storage === "device" ? "Viewed on this device" : undefined}>
              {subtitle}
            </span>
          }
          filter={searchQuery}
          onFilterChange={setSearchQuery}
          filterLabel="Filter changed files"
          filterHint={
            viewedState ? "j/k to navigate files · v to mark viewed" : "j/k to navigate files"
          }
          actions={
            <ReviewFileViewControl
              value={fileView}
              onChange={onFileViewChange}
              compact
              commitGrouping={
                onGroupByCommit ? { selected: false, onSelect: onGroupByCommit } : undefined
              }
            />
          }
          notice={
            viewedFiles?.truncated ? "Some provider viewed states could not be loaded." : undefined
          }
          filterLeading={
            viewedState ? (
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
            ) : null
          }
        />
        {filesError && files.length > 0 ? (
          <ErrorNotice
            title="Couldn’t refresh changed files"
            error={failure}
            message={filesError}
            busy={isLoading}
            recovery={onRetry ? { label: "Retry", onAction: onRetry } : undefined}
          />
        ) : null}
        {isLoading && !filesError && visibleFiles.length === 0 ? (
          <ListLoadingState label="Loading changed files…" />
        ) : filesError && files.length === 0 ? (
          <ErrorState
            title="Couldn’t load changed files"
            error={failure}
            message={filesError}
            busy={isLoading}
            recovery={onRetry ? { label: "Retry", onAction: onRetry } : undefined}
          />
        ) : visibleFiles.length === 0 ? (
          <FilePaneEmpty
            filtered={Boolean(normalizedQuery || commentFilter !== "all")}
            description="No changed files were reported for this pull request."
            onClear={() => {
              setSearchQuery("");
              setCommentFilter("all");
            }}
          />
        ) : (
          <FileList
            selectFirstFile
            files={visibleFiles}
            autoFocus={keyboardNavigationEnabled}
            mode={fileView}
            reviewGroupTitle={commitTitle}
            reviewGroupHover={
              commitId ? (
                <CommitHoverDetails commitId={commitId} summary={commitTitle ?? commitId} />
              ) : undefined
            }
            selection={selectPullRequestFilePath}
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

/** `V` marks the active file viewed and moves on to the next unviewed one; `Shift+V` stays put. */
function PullRequestViewedFileHotkeys({
  enabled,
  viewedState,
}: {
  enabled: boolean;
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

    const next = getNextUnviewedPierreFile("pull-request-files", activePath, viewedPaths);
    if (next) {
      const path = next.realPath ?? next.path;
      dispatch(setPullRequestPreviewActiveFilePath(path));
      scrollPierreFileTreeRealPathIntoView("pull-request-files", path);
    }
  }

  useHotkey("V", () => toggleActiveFile(true), { enabled });
  useHotkey("Shift+V", () => toggleActiveFile(false), { enabled });

  return null;
}
