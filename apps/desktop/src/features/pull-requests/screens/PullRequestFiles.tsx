import { skipToken } from "@reduxjs/toolkit/query";
import { useHotkey } from "@tanstack/react-hotkeys";
import { PatchDiff, Virtualizer } from "@pierre/diffs/react";
import { FileCode2, Filter, LoaderCircle } from "lucide-react";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router";
import { useAppSelector } from "@/app/hooks";
import { ResizableSidebarLayout } from "@/components/layout/ResizableSidebarLayout";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { getDiffTheme, getDiffThemeType } from "@/features/diff-view/diffRenderConfig";
import {
  useGetPullRequestConversationQuery,
  useGetPullRequestFilesQuery,
  useGetPullRequestPatchQuery,
  useResolveHostedRepoQuery,
} from "@/features/hosted-repos/api";
import { PullRequestInlineReviewThread } from "@/features/pull-requests/components/PullRequestInlineReviewThread";
import { buildPullRequestReviewCommentsPayload } from "@/features/pull-requests/utils/reviewCommentsPayload";
import {
  buildPullRequestThreadAnnotations,
  countPullRequestThreadsForFile,
} from "@/features/pull-requests/utils/reviewThreadAnnotations";
import { FileListRow } from "@/features/source-control/components/FileListRow";
import { errorMessageFrom } from "@/features/source-control/shared-utils/errorMessage";
import { isTypingTarget } from "@/features/source-control/utils";
import { scrollKeyboardNavItemIntoView } from "@/lib/keyboard-navigation";
import type {
  GitProviderId,
  PullRequestChangedFile,
  PullRequestReviewThread,
} from "@/platform/desktop";
import ReviewCommentsCopyToolbar from "@/features/pull-requests/components/ReviewCopyBar";

const PREVIEW_PATCH_CSS = `
:host {
  min-width: 0;
  max-width: 100%;
}

[data-diffs-header] {
  position: sticky;
  top: 0;
  z-index: 10;
  background-color: var(--diffs-bg);
  border-bottom: 1px solid color-mix(in lab, var(--diffs-bg) 90%, var(--diffs-fg));
  min-width: 0;
  overflow: hidden;
}

pre[data-diff-type='single'] {
  overflow: hidden;
  min-width: 0;
}
`;

function toGitProviderId(value: string | undefined): GitProviderId | undefined {
  if (value === "github" || value === "gitlab" || value === "bitbucket") {
    return value;
  }

  return undefined;
}

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

export const PullRequestFiles = () => {
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo);
  const { providerId, owner, repo, pullRequestNumber } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedFilePath = searchParams.get("file") ?? "";

  const parsedPullRequestNumber = Number.parseInt(pullRequestNumber ?? "", 10);
  const hasValidRoute = Boolean(
    providerId &&
    owner &&
    repo &&
    Number.isFinite(parsedPullRequestNumber) &&
    parsedPullRequestNumber > 0,
  );

  const { hostedRepo } = useResolveHostedRepoQuery(activeRepo, {
    skip: !activeRepo,
    selectFromResult: ({ data, isLoading, isFetching }) => ({
      hostedRepo: data ?? null,
      resolvingHostedRepo: isLoading || isFetching,
    }),
  });

  const routeMatchesActiveRepo = Boolean(
    hostedRepo &&
    providerId &&
    owner &&
    repo &&
    hostedRepo.providerId === providerId &&
    hostedRepo.owner === owner &&
    hostedRepo.repo === repo,
  );
  const filesQueryArg =
    activeRepo && hasValidRoute && routeMatchesActiveRepo
      ? { repoPath: activeRepo, pullRequestNumber: parsedPullRequestNumber }
      : skipToken;

  const { files, filesError, isLoadingFiles } = useGetPullRequestFilesQuery(filesQueryArg, {
    selectFromResult: ({ data, error, isLoading, isFetching }) => ({
      files: data ?? [],
      filesError: data ? "" : errorMessageFrom(error, ""),
      isLoadingFiles: isLoading || isFetching,
    }),
  });

  const { patch, patchError, isLoadingPatch } = useGetPullRequestPatchQuery(filesQueryArg, {
    selectFromResult: ({ data, error, isLoading, isFetching }) => ({
      patch: data ?? "",
      patchError: data ? "" : errorMessageFrom(error, ""),
      isLoadingPatch: isLoading || isFetching,
    }),
  });

  const { reviewThreads } = useGetPullRequestConversationQuery(filesQueryArg, {
    selectFromResult: ({ data }) => ({
      reviewThreads: data?.reviewThreads ?? [],
    }),
    pollingInterval: 10000,
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });

  useEffect(() => {
    if (!selectedFilePath && files.length > 0) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set("file", files[0].path);
      setSearchParams(nextParams, { replace: true });
    }
  }, [files, selectedFilePath, searchParams, setSearchParams]);

  const commentCountByPath = useMemo(() => {
    const counts: Record<string, number> = {};

    for (const file of files) {
      counts[file.path] = countPullRequestThreadsForFile({
        path: file.path,
        previousPath: file.previousPath,
        reviewThreads,
      });
    }

    return counts;
  }, [files, reviewThreads]);

  const handleSelectFile = useCallback(
    (path: string) => {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set("file", path);
      setSearchParams(nextParams, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  return (
    <>
      <ResizableSidebarLayout
        sidebarDefaultSize={24}
        sidebarMinSize={16}
        sidebarMaxSize={36}
        sidebar={
          <FilesSidebar
            files={files}
            commentCountByPath={commentCountByPath}
            selectedPath={selectedFilePath}
            filesError={filesError}
            isLoading={isLoadingFiles}
            onSelectFile={handleSelectFile}
          />
        }
        content={
          <div className="flex h-full min-h-0 flex-col">
            <FilesDiffViewer
              providerId={toGitProviderId(providerId)}
              repoPath={activeRepo ?? ""}
              pullRequestNumber={parsedPullRequestNumber}
              files={files}
              reviewThreads={reviewThreads}
              selectedPath={selectedFilePath}
              patch={patch}
              patchError={patchError}
              isLoadingPatch={isLoadingPatch}
            />
          </div>
        }
      />
    </>
  );
};

type DiffSectionRef = {
  start: number;
  end: number;
};

function buildDiffSectionIndex(diffText: string) {
  if (!diffText) {
    return {} as Record<string, DiffSectionRef>;
  }

  const headerRegex = /^diff --git a\/(.+?) b\/(.+)$/gm;
  const headers: Array<{ start: number; oldPath: string; newPath: string }> = [];
  for (let match = headerRegex.exec(diffText); match !== null; match = headerRegex.exec(diffText)) {
    headers.push({
      start: match.index,
      oldPath: match[1] ?? "",
      newPath: match[2] ?? "",
    });
  }

  const index: Record<string, DiffSectionRef> = {};
  for (let indexPosition = 0; indexPosition < headers.length; indexPosition += 1) {
    const current = headers[indexPosition];
    const next = headers[indexPosition + 1];
    const section = {
      start: current.start,
      end: next ? next.start : diffText.length,
    };

    if (current.newPath && !index[current.newPath]) {
      index[current.newPath] = section;
    }
    if (current.oldPath && !index[current.oldPath]) {
      index[current.oldPath] = section;
    }
  }

  return index;
}

function extractFilePatch(
  diffText: string,
  path: string,
  previousPath: string | null,
  index: Record<string, DiffSectionRef>,
) {
  const section = index[path] ?? (previousPath ? index[previousPath] : undefined);
  if (!section) {
    return "";
  }

  return diffText.slice(section.start, section.end).trim();
}


function FilesDiffViewer({
  providerId,
  repoPath,
  pullRequestNumber,
  files,
  reviewThreads,
  selectedPath,
  patch,
  patchError,
  isLoadingPatch,
}: {
  providerId?: GitProviderId;
  repoPath: string;
  pullRequestNumber: number;
  files: PullRequestChangedFile[];
  reviewThreads: PullRequestReviewThread[];
  selectedPath: string;
  patch: string;
  patchError: string;
  isLoadingPatch: boolean;
}) {
  const { resolvedTheme } = useTheme();

  const diffSectionIndex = useMemo(() => buildDiffSectionIndex(patch), [patch]);
  const selectedFile = files.find((file) => file.path === selectedPath) ?? null;
  const selectedPatch = selectedFile
    ? extractFilePatch(patch, selectedFile.path, selectedFile.previousPath, diffSectionIndex)
    : "";
  const threadAnnotations = selectedFile
    ? buildPullRequestThreadAnnotations({
        repoPath,
        pullRequestNumber,
        path: selectedFile.path,
        previousPath: selectedFile.previousPath,
        reviewThreads,
      })
    : [];
  const fileReviewCommentsPayload = selectedFile
    ? buildPullRequestReviewCommentsPayload({
        reviewThreads,
        path: selectedFile.path,
        previousPath: selectedFile.previousPath,
      })
    : "";
  const allReviewCommentsPayload = buildPullRequestReviewCommentsPayload({ reviewThreads });

  if (isLoadingPatch && !patch) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoaderCircle className="text-muted-foreground h-5 w-5 animate-spin" />
        <span className="text-muted-foreground ml-2 text-sm">Loading diff...</span>
      </div>
    );
  }

  if (patchError) {
    return (
      <div className="text-destructive rounded-2xl border border-red-500/20 bg-red-500/8 px-4 py-3 text-sm">
        {patchError}
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <Empty className="border-0 bg-transparent">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileCode2 className="h-5 w-5" />
            </EmptyMedia>
            <EmptyTitle>No changed files</EmptyTitle>
            <EmptyDescription>
              This pull request does not expose changed files yet.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  if (!selectedFile) {
    return (
      <div className="flex h-full items-center justify-center">
        <Empty className="border-0 bg-transparent">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileCode2 className="h-5 w-5" />
            </EmptyMedia>
            <EmptyTitle>Select a file</EmptyTitle>
            <EmptyDescription>Choose a file from the sidebar to view its diff.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  if (!selectedPatch) {
    return (
      <div className="flex h-full items-center justify-center">
        <Empty className="border-0 bg-transparent">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileCode2 className="h-5 w-5" />
            </EmptyMedia>
            <EmptyTitle>Diff unavailable</EmptyTitle>
            <EmptyDescription>
              This file may be binary or the provider did not return a patch body.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 overflow-hidden">
      <ReviewCommentsCopyToolbar
        filePayload={fileReviewCommentsPayload}
        allPayload={allReviewCommentsPayload}
      />
      <Virtualizer className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <PatchDiff
          key={selectedFile.path}
          className="block min-w-0 max-w-full"
          patch={selectedPatch}
          lineAnnotations={threadAnnotations}
          renderAnnotation={(annotation) => {
            const metadata = annotation.metadata;
            if (!metadata || metadata.type !== "pull-request-thread") {
              return null;
            }

            return (
              <PullRequestInlineReviewThread
                providerId={providerId}
                repoPath={metadata.repoPath}
                pullRequestNumber={metadata.pullRequestNumber}
                thread={metadata.thread}
              />
            );
          }}
          options={{
            theme: getDiffTheme(),
            themeType: getDiffThemeType(resolvedTheme),
            unsafeCSS: PREVIEW_PATCH_CSS,
            disableLineNumbers: false,
            hunkSeparators: "line-info-basic",
          }}
        />
      </Virtualizer>
    </div>
  );
}
