import { skipToken } from "@reduxjs/toolkit/query";
import { useHotkey } from "@tanstack/react-hotkeys";
import { FileCode2, Filter, LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router";
import { toast } from "sonner";
import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { ResizableSidebarLayout } from "@/components/layout/ResizableSidebarLayout";
import { DiffWorkspace } from "@/features/diff-view/DiffWorkspace";
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
import {
  useGetPullRequestConversationQuery,
  useGetPullRequestFilesQuery,
  usePreparePullRequestCompareRefsQuery,
  useResolveHostedRepoQuery,
  useSubmitPullRequestReviewCommentsMutation,
} from "@/features/hosted-repos/api";
import { removeCommentsByIds } from "@/features/comments/commentsSlice";
import ReviewCommentsCopyToolbar from "@/features/pull-requests/components/ReviewCopyBar";
import {
  buildSubmitPullRequestReviewCommentsInput,
  getPendingReviewCommentsForContext,
} from "@/features/pull-requests/utils/pendingReviewComments";
import { buildPullRequestReviewCommentsPayload } from "@/features/pull-requests/utils/reviewCommentsPayload";
import { usePullRequestMentionCandidates } from "@/features/pull-requests/hooks/usePullRequestMentionCandidates";
import {
  buildPullRequestThreadAnnotations,
  countPullRequestThreadsForFile,
} from "@/features/pull-requests/utils/reviewThreadAnnotations";
import { useGetBranchFileVersionsQuery } from "@/features/source-control/api";
import { FileListRow } from "@/features/source-control/components/FileListRow";
import { useThrottledDiffSelection } from "@/features/source-control/hooks/useThrottledDiffSelection";
import { errorMessageFrom } from "@/features/source-control/shared-utils/errorMessage";
import type { CommentItem } from "@/features/source-control/types";
import { isTypingTarget } from "@/features/source-control/utils";
import { scrollKeyboardNavItemIntoView } from "@/lib/keyboard-navigation";
import type {
  PullRequestChangedFile,
  PullRequestConversation,
  PullRequestReviewThread,
} from "@/platform/desktop";

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

  const { compareRefs, compareRefsError, isLoadingCompareRefs } =
    usePreparePullRequestCompareRefsQuery(filesQueryArg, {
      selectFromResult: ({ data, error, isLoading, isFetching }) => ({
        compareRefs: data ?? null,
        compareRefsError: data ? "" : errorMessageFrom(error, ""),
        isLoadingCompareRefs: isLoading || isFetching,
      }),
    });

  const { files, filesError, isLoadingFiles } = useGetPullRequestFilesQuery(filesQueryArg, {
    selectFromResult: ({ data, error, isLoading, isFetching }) => ({
      files: data ?? [],
      filesError: data ? "" : errorMessageFrom(error, ""),
      isLoadingFiles: isLoading || isFetching,
    }),
  });

  const { conversation, reviewThreads } = useGetPullRequestConversationQuery(filesQueryArg, {
    selectFromResult: ({ data }) => ({
      conversation: data ?? null,
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

  const pendingReviewComments = useAppSelector((state) => {
    if (!activeRepo || !compareRefs?.compareBaseRef || !compareRefs.compareHeadRef) {
      return [] as CommentItem[];
    }

    return getPendingReviewCommentsForContext(state.comments, activeRepo, {
      kind: "review",
      baseRef: compareRefs.compareBaseRef,
      headRef: compareRefs.compareHeadRef,
    });
  });

  const commentCountByPath = useMemo(() => {
    const counts: Record<string, number> = {};

    for (const file of files) {
      counts[file.path] = countPullRequestThreadsForFile({
        path: file.path,
        previousPath: file.previousPath,
        reviewThreads,
      });
    }

    for (const comment of pendingReviewComments) {
      counts[comment.filePath] = (counts[comment.filePath] ?? 0) + 1;
    }

    return counts;
  }, [files, pendingReviewComments, reviewThreads]);

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
          <div className="h-full min-h-0">
            <FilesDiffViewer
              repoPath={activeRepo ?? ""}
              pullRequestNumber={parsedPullRequestNumber}
              compareBaseRef={compareRefs?.compareBaseRef ?? ""}
              compareHeadRef={compareRefs?.compareHeadRef ?? ""}
              compareRefsError={compareRefsError}
              isLoadingCompareRefs={isLoadingCompareRefs}
              files={files}
              conversation={conversation}
              reviewThreads={reviewThreads}
              pendingReviewComments={pendingReviewComments}
              selectedPath={selectedFilePath}
            />
          </div>
        }
      />
    </>
  );
};

function FilesDiffViewer({
  repoPath,
  pullRequestNumber,
  compareBaseRef,
  compareHeadRef,
  compareRefsError,
  isLoadingCompareRefs,
  files,
  conversation,
  reviewThreads,
  pendingReviewComments,
  selectedPath,
}: {
  repoPath: string;
  pullRequestNumber: number;
  compareBaseRef: string;
  compareHeadRef: string;
  compareRefsError: string;
  isLoadingCompareRefs: boolean;
  files: PullRequestChangedFile[];
  conversation: PullRequestConversation | null;
  reviewThreads: PullRequestReviewThread[];
  pendingReviewComments: CommentItem[];
  selectedPath: string;
}) {
  const dispatch = useAppDispatch();
  const [submitPullRequestReviewComments, { isLoading: isSubmittingReviewComments }] =
    useSubmitPullRequestReviewCommentsMutation();
  const commentMentions = usePullRequestMentionCandidates(conversation);
  const selectedFile = files.find((file) => file.path === selectedPath) ?? null;
  const previewSelection = useThrottledDiffSelection(
    selectedFile
      ? {
          path: selectedFile.path,
          previousPath: selectedFile.previousPath ?? undefined,
        }
      : null,
  );
  const previewFile = files.find((file) => file.path === previewSelection?.path) ?? selectedFile;
  const allReviewCommentsPayload = buildPullRequestReviewCommentsPayload({ reviewThreads });
  const hasCompareRefs = Boolean(compareBaseRef && compareHeadRef);
  const reviewCommentContext =
    hasCompareRefs && compareBaseRef && compareHeadRef
      ? { kind: "review" as const, baseRef: compareBaseRef, headRef: compareHeadRef }
      : null;
  const filePendingReviewComments = previewFile
    ? pendingReviewComments.filter((comment) => comment.filePath === previewFile.path)
    : [];
  const pendingReviewCommentCount = pendingReviewComments.length;

  const branchFileVersionsQuery = useGetBranchFileVersionsQuery(
    previewSelection && hasCompareRefs
      ? {
          repoPath,
          baseRef: compareBaseRef,
          headRef: compareHeadRef,
          relPath: previewSelection.path,
          previousPath: previewSelection.previousPath,
        }
      : skipToken,
  );

  const branchFileVersions =
    branchFileVersionsQuery.currentData ?? branchFileVersionsQuery.data ?? null;
  const selectedOldFile = branchFileVersions?.oldFile ?? null;
  const selectedNewFile = branchFileVersions?.newFile ?? null;
  const branchFileVersionsError = branchFileVersions
    ? ""
    : errorMessageFrom(branchFileVersionsQuery.error, "");
  const isLoadingBranchFileVersions =
    Boolean(previewSelection && hasCompareRefs && !branchFileVersions) &&
    (branchFileVersionsQuery.isUninitialized ||
      branchFileVersionsQuery.isLoading ||
      branchFileVersionsQuery.isFetching);

  const threadAnnotations = previewFile
    ? buildPullRequestThreadAnnotations({
        repoPath,
        pullRequestNumber,
        path: previewFile.path,
        previousPath: previewFile.previousPath,
        reviewThreads,
      })
    : [];
  const fileReviewCommentsPayload = previewFile
    ? buildPullRequestReviewCommentsPayload({
        reviewThreads,
        path: previewFile.path,
        previousPath: previewFile.previousPath,
      })
    : "";

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

  if (!hasCompareRefs && isLoadingCompareRefs) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoaderCircle className="text-muted-foreground h-5 w-5 animate-spin" />
        <span className="text-muted-foreground ml-2 text-sm">Preparing compare refs...</span>
      </div>
    );
  }

  if (!hasCompareRefs && compareRefsError) {
    return (
      <div className="text-destructive rounded-2xl border border-red-500/20 bg-red-500/8 px-4 py-3 text-sm">
        {compareRefsError}
      </div>
    );
  }

  if (isLoadingBranchFileVersions) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoaderCircle className="text-muted-foreground h-5 w-5 animate-spin" />
        <span className="text-muted-foreground ml-2 text-sm">Loading diff...</span>
      </div>
    );
  }

  if (branchFileVersionsError) {
    return (
      <div className="text-destructive rounded-2xl border border-red-500/20 bg-red-500/8 px-4 py-3 text-sm">
        {branchFileVersionsError}
      </div>
    );
  }

  if (!selectedOldFile && !selectedNewFile) {
    return (
      <div className="flex h-full items-center justify-center">
        <Empty className="border-0 bg-transparent">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileCode2 className="h-5 w-5" />
            </EmptyMedia>
            <EmptyTitle>Diff unavailable</EmptyTitle>
            <EmptyDescription>
              This file may be binary or the prepared refs did not return file contents.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  const submitAllComments = async () => {
    if (!repoPath || pullRequestNumber <= 0 || pendingReviewComments.length === 0) {
      return;
    }

    try {
      const result = await submitPullRequestReviewComments(
        buildSubmitPullRequestReviewCommentsInput({
          repoPath,
          pullRequestNumber,
          comments: pendingReviewComments,
        }),
      ).unwrap();

      if (result.submittedDraftIds.length > 0) {
        dispatch(removeCommentsByIds(result.submittedDraftIds));
      }

      if (result.failedMessage) {
        if (result.submittedDraftIds.length > 0) {
          toast.error(
            `Submitted ${result.submittedDraftIds.length} comment${result.submittedDraftIds.length === 1 ? "" : "s"}, then stopped: ${result.failedMessage}`,
          );
        } else {
          toast.error(result.failedMessage);
        }
        return;
      }

      toast.success(
        `Submitted ${result.submittedDraftIds.length} pending comment${result.submittedDraftIds.length === 1 ? "" : "s"}`,
      );
    } catch (error) {
      toast.error(errorMessageFrom(error, "Failed to submit review comments"));
    }
  };

  return (
    <div className="grid h-full min-h-0 min-w-0">
      <div className="flex h-full min-h-0 min-w-0 flex-col">
        <ReviewCommentsCopyToolbar
          filePayload={fileReviewCommentsPayload}
          allPayload={allReviewCommentsPayload}
          filePendingCommentCount={filePendingReviewComments.length}
          totalPendingCommentCount={pendingReviewCommentCount}
          canSubmitComments={Boolean(reviewCommentContext) && pendingReviewCommentCount > 0}
          isSubmittingComments={isSubmittingReviewComments}
          onSubmitAllComments={
            pendingReviewCommentCount > 0
              ? () => {
                  void submitAllComments();
                }
              : undefined
          }
        />
        <DiffWorkspace
          oldFile={selectedOldFile}
          newFile={selectedNewFile}
          activePath={previewFile?.path ?? selectedFile.path}
          commentContext={
            reviewCommentContext ?? {
              kind: "review",
              baseRef: compareBaseRef,
              headRef: compareHeadRef,
            }
          }
          canComment={Boolean(reviewCommentContext)}
          fileViewerRevision={compareHeadRef}
          lspJumpContextKind="pull-request"
          annotationItems={threadAnnotations}
          commentMentions={commentMentions}
        />
      </div>
    </div>
  );
}
