import { skipToken } from "@reduxjs/toolkit/query";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import {
  GitPullRequest,
  ShieldCheck,
  FileCode2,
  GitBranch,
  LoaderCircle,
  MessagesSquare,
} from "lucide-react";
import { toast } from "sonner";
import { useHotkey } from "@tanstack/react-hotkeys";
import { PatchDiff, Virtualizer } from "@pierre/diffs/react";
import { useTheme } from "next-themes";

import { useAppDispatch, useAppSelector } from "@/app/hooks";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Button } from "@/components/ui/button";
import { ResizableSidebarLayout } from "@/components/layout/ResizableSidebarLayout";
import {
  useGetPullRequestConversationQuery,
  useGetPullRequestFilesQuery,
  useGetPullRequestPatchQuery,
  useResolveHostedRepoQuery,
  hostedReposApi,
} from "@/features/hosted-repos/api";
import { openPullRequestReview } from "@/features/hosted-repos/actions";
import { getDiffTheme, getDiffThemeType } from "@/features/diff-view/diffRenderConfig";
import { PullRequestConversationTab } from "@/features/pull-requests/components/PullRequestConversationTab";
import { PullRequestPreviewHeader } from "@/features/pull-requests/components/PullRequestPreviewHeader";
import { buildPullRequestsInboxPath } from "@/features/pull-requests/utils";
import { errorMessageFrom } from "@/features/source-control/shared-utils/errorMessage";
import { setChangesSidebarMode } from "@/features/source-control/sourceControlSlice";
import { FileListRow } from "@/features/source-control/components/FileListRow";
import { isTypingTarget } from "@/features/source-control/utils";
import type { PullRequestChangedFile, PullRequestOpenMode } from "@/platform/desktop";
import { CommentBody, copyToClipboard } from "@/features/pull-requests/components/pullRequestCommentParts";

type PreviewTab = "overview" | "conversation" | "files" | "checks";

function parsePreviewTab(value: string | null): PreviewTab {
  if (value === "conversation") return "conversation";
  if (value === "files") return "files";
  if (value === "checks") return "checks";
  return "overview";
}

function providerTitle(providerId: string) {
  if (providerId === "github") return "GitHub";
  if (providerId === "gitlab") return "GitLab";
  return "Bitbucket";
}

function statusTone(status: string) {
  if (status === "added") return "text-emerald-300 bg-emerald-500/10 border-emerald-500/20";
  if (status === "deleted") return "text-rose-300 bg-rose-500/10 border-rose-500/20";
  if (status === "renamed") return "text-amber-300 bg-amber-500/10 border-amber-500/20";
  if (status === "copied") return "text-sky-300 bg-sky-500/10 border-sky-500/20";
  return "text-blue-300 bg-blue-500/10 border-blue-500/20";
}

function PreviewPlaceholder({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: typeof GitPullRequest;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-[420px] items-center justify-center px-6 py-8">
      <Empty className="max-w-[460px] border-0 bg-transparent">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Icon className="h-5 w-5" />
          </EmptyMedia>
          <EmptyTitle>{title}</EmptyTitle>
          <EmptyDescription>{description}</EmptyDescription>
        </EmptyHeader>
        {action ? <div>{action}</div> : null}
      </Empty>
    </div>
  );
}

function PreviewModeRailButton({
  active,
  icon: Icon,
  title,
  onClick,
}: {
  active: boolean;
  icon: typeof GitPullRequest;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`inline-flex h-8 w-8 items-center justify-center rounded-md ${
        active
          ? "bg-secondary text-secondary-foreground"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
      }`}
      aria-label={title}
      title={title}
      onClick={onClick}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function PullRequestPreviewModeRail({
  activeTab,
  onTabChange,
}: {
  activeTab: PreviewTab;
  onTabChange: (tab: PreviewTab) => void;
}) {
  return (
    <aside className="border-border/70 bg-surface-toolbar flex w-12 shrink-0 flex-col items-center gap-1 border-r px-2 py-2">
      <PreviewModeRailButton
        active={activeTab === "overview"}
        icon={GitPullRequest}
        title="Overview"
        onClick={() => onTabChange("overview")}
      />
      <PreviewModeRailButton
        active={activeTab === "conversation"}
        icon={MessagesSquare}
        title="Conversation"
        onClick={() => onTabChange("conversation")}
      />
      <PreviewModeRailButton
        active={activeTab === "files"}
        icon={FileCode2}
        title="Files"
        onClick={() => onTabChange("files")}
      />
      <PreviewModeRailButton
        active={activeTab === "checks"}
        icon={ShieldCheck}
        title="Checks"
        onClick={() => onTabChange("checks")}
      />
    </aside>
  );
}

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

function FilesSidebar({
  files,
  selectedPath,
  filesError,
  isLoading,
  onSelectFile,
}: {
  files: PullRequestChangedFile[];
  selectedPath: string;
  filesError: string;
  isLoading: boolean;
  onSelectFile: (path: string) => void;
}) {
  const navigateByOffset = (offset: number) => {
    if (files.length === 0) return;

    const currentIndex = files.findIndex((file) => file.path === selectedPath);
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = Math.max(0, Math.min(files.length - 1, safeIndex + offset));
    const nextFile = files[nextIndex];
    if (nextFile) {
      onSelectFile(nextFile.path);
    }
  };

  useHotkey(
    { key: "j" },
    (event) => {
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      navigateByOffset(1);
    },
    { enabled: files.length > 0 },
  );

  useHotkey(
    { key: "k" },
    (event) => {
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      navigateByOffset(-1);
    },
    { enabled: files.length > 0 },
  );

  return (
    <aside className="bg-surface-toolbar border-border/70 flex h-full min-h-0 flex-col overflow-hidden border-r">
      <div className="border-border border-b px-3 py-2">
        <div className="text-foreground/80 text-[11px] font-semibold tracking-[0.14em]">PR FILES</div>
        <div className="text-muted-foreground mt-1 text-xs">
          {isLoading && files.length === 0
            ? "Loading changed files..."
            : `${files.length} file${files.length === 1 ? "" : "s"} · navigate with j/k`}
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
        ) : (
          <div className="border-border/70 border-b">
            {files.map((file, index) => (
              <FileListRow
                key={`${file.path}:${file.previousPath ?? ""}`}
                path={file.path}
                status={file.status}
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

function FilesDiffViewer({
  files,
  selectedPath,
  patch,
  patchError,
  isLoadingPatch,
}: {
  files: PullRequestChangedFile[];
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
            <EmptyDescription>
              Choose a file from the sidebar to view its diff.
            </EmptyDescription>
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
      <div className="border-border/70 border-b px-4 py-2">
        <div className="flex items-center gap-2">
          <GitBranch className="text-muted-foreground h-4 w-4" />
          <span className="text-sm font-medium">{selectedFile.path}</span>
          <span className={`ml-2 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${statusTone(selectedFile.status)}`}>
            {selectedFile.status}
          </span>
        </div>
        <div className="text-muted-foreground mt-1 flex items-center gap-3 text-xs">
          <span className="text-emerald-400">+{selectedFile.additions}</span>
          <span className="text-rose-400">-{selectedFile.deletions}</span>
          {selectedFile.previousPath ? (
            <span>renamed from {selectedFile.previousPath}</span>
          ) : null}
        </div>
      </div>
      <Virtualizer className="relative h-[calc(100%-60px)] min-h-0 overflow-y-auto overflow-x-hidden">
        <PatchDiff
          key={selectedFile.path}
          className="block min-w-0 max-w-full"
          patch={selectedPatch}
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

export function PullRequestPreviewScreen() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo);
  const { providerId, owner, repo, pullRequestNumber } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = parsePreviewTab(searchParams.get("tab"));
  const selectedFilePath = searchParams.get("file") ?? "";
  const [openingMode, setOpeningMode] = useState<PullRequestOpenMode | null>(null);
  const [openError, setOpenError] = useState("");
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);

  useEffect(() => {
    dispatch(setChangesSidebarMode("pull-requests"));
  }, [dispatch]);

  const parsedPullRequestNumber = Number.parseInt(pullRequestNumber ?? "", 10);
  const hasValidRoute = Boolean(
    providerId && owner && repo && Number.isFinite(parsedPullRequestNumber) && parsedPullRequestNumber > 0,
  );

  const { hostedRepo, resolvingHostedRepo } = useResolveHostedRepoQuery(activeRepo, {
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

  const conversationQueryArg =
    activeRepo && hasValidRoute && routeMatchesActiveRepo
      ? {
          repoPath: activeRepo,
          pullRequestNumber: parsedPullRequestNumber,
        }
      : skipToken;

  const {
    conversation,
    conversationError,
    loadingConversation,
    refetch: refetchConversation,
  } = useGetPullRequestConversationQuery(conversationQueryArg, {
    selectFromResult: ({ data, error, isLoading, isFetching }) => ({
      conversation: data ?? null,
      conversationError: data ? "" : errorMessageFrom(error, ""),
      loadingConversation: isLoading || isFetching,
    }),
    pollingInterval: 10000,
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });

  // Load files and patch for the Files tab
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

  // Auto-select first file when entering Files tab and no file selected
  useEffect(() => {
    if (activeTab === "files" && !selectedFilePath && files.length > 0) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set("file", files[0].path);
      setSearchParams(nextParams, { replace: true });
    }
  }, [activeTab, files, selectedFilePath, searchParams, setSearchParams]);

  const handleSelectFile = useCallback((path: string) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("file", path);
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams]);

  async function handleOpen(mode: PullRequestOpenMode) {
    if (!Number.isFinite(parsedPullRequestNumber)) {
      return;
    }

    setOpenError("");
    setOpeningMode(mode);
    const result = await dispatch(openPullRequestReview(parsedPullRequestNumber, mode));
    setOpeningMode(null);

    if (result.workspace) {
      navigate("/changes");
      return;
    }

    if (result.errorMessage) {
      setOpenError(result.errorMessage);
      toast.error(result.errorMessage);
    }
  }

  async function handleCopyPullRequestLink() {
    const url = conversation?.detail.url;
    if (!url) {
      toast.error("PR link is not available yet.");
      return;
    }

    await copyToClipboard(url, "PR link copied");
  }

  async function handleCopyBranchName() {
    const branchName = conversation?.detail.headRef;
    if (!branchName) {
      toast.error("Branch name is not available yet.");
      return;
    }

    await copyToClipboard(branchName, "Branch name copied");
  }

  const handleRefresh = useCallback(() => {
    if (activeRepo && hasValidRoute && routeMatchesActiveRepo) {
      void refetchConversation();
      dispatch(hostedReposApi.util.invalidateTags([{ type: "HostedRepo", id: activeRepo }]));
    }
  }, [activeRepo, dispatch, hasValidRoute, refetchConversation, routeMatchesActiveRepo]);

  const handleTabChange = useCallback((tab: PreviewTab) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("tab", tab);
    if (tab === "files" && files.length > 0 && !searchParams.get("file")) {
      nextParams.set("file", files[0].path);
    }
    setSearchParams(nextParams, { replace: true });
  }, [files, searchParams, setSearchParams]);

  if (!activeRepo) {
    return (
      <PreviewPlaceholder
        icon={GitPullRequest}
        title="Open a repository first"
        description="Select a repository with a supported hosted remote, then reopen pull requests to preview and choose a local review mode."
      />
    );
  }

  if (!hasValidRoute) {
    return (
      <PreviewPlaceholder
        icon={GitPullRequest}
        title="Pull request not found"
        description="The pull request route is incomplete or invalid. Go back to the pull request list and reopen it from there."
        action={<Button onClick={() => navigate(buildPullRequestsInboxPath())}>Back to pull requests</Button>}
      />
    );
  }

  if (resolvingHostedRepo) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-border/70 bg-surface-toolbar border-b px-6 py-5">
          <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-3">
            <div className="bg-background/80 h-8 w-44 animate-pulse rounded-lg" />
            <div className="bg-background/80 h-10 w-2/3 animate-pulse rounded-xl" />
            <div className="bg-background/80 h-20 animate-pulse rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!routeMatchesActiveRepo) {
    return (
      <PreviewPlaceholder
        icon={GitPullRequest}
        title="This preview belongs to a different repository"
        description="Switch back to the repository that owns this pull request, then reopen the preview from the pull requests list."
        action={<Button onClick={() => navigate(buildPullRequestsInboxPath())}>Back to pull requests</Button>}
      />
    );
  }

  if (loadingConversation && !conversation) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-border/70 bg-surface-toolbar border-b px-6 py-5">
          <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-3">
            <div className="bg-background/80 h-8 w-44 animate-pulse rounded-lg" />
            <div className="bg-background/80 h-10 w-2/3 animate-pulse rounded-xl" />
            <div className="bg-background/80 h-20 animate-pulse rounded-2xl" />
          </div>
        </div>
        <div className="mx-auto w-full max-w-[1240px] flex-1 px-6 py-6">
          <div className="bg-background/70 h-full min-h-[420px] animate-pulse rounded-3xl border border-white/6" />
        </div>
      </div>
    );
  }

  if (conversationError || !conversation) {
    return (
      <PreviewPlaceholder
        icon={GitPullRequest}
        title="Preview unavailable"
        description={
          conversationError ||
          "We couldn't load this pull request preview right now. Try reopening it from the list."
        }
        action={<Button onClick={() => navigate(buildPullRequestsInboxPath())}>Back to pull requests</Button>}
      />
    );
  }

  const { detail } = conversation;
  const issueCommentCount = conversation.issueComments.length;
  const reviewThreadCount = conversation.reviewThreads.length;

  // Calculate totals for header
  const totalAdditions = files.reduce((sum, f) => sum + f.additions, 0);
  const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0);

  const mainContent = (
    <div className="flex h-full min-h-0 flex-col">
      {activeTab === "overview" ? (
        <PullRequestPreviewHeader
          owner={hostedRepo?.owner ?? owner ?? ""}
          repo={hostedRepo?.repo ?? repo ?? ""}
          detail={detail}
          openingMode={openingMode}
          isRefreshing={loadingConversation && !!conversation}
          changedFilesCount={files.length}
          additions={totalAdditions}
          deletions={totalDeletions}
          onBack={() => navigate(buildPullRequestsInboxPath())}
          onOpen={(mode) => {
            void handleOpen(mode);
          }}
          onOpenInBrowser={() => {
            window.open(detail.url, "_blank", "noopener,noreferrer");
          }}
          onCopyLink={() => {
            void handleCopyPullRequestLink();
          }}
          onCopyBranch={() => {
            void handleCopyBranchName();
          }}
          onRefresh={handleRefresh}
          onToggleFilesView={() => handleTabChange("files")}
        />
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto px-6 py-6">
        <div className="mx-auto flex min-h-full w-full max-w-[1400px] flex-col">
          {activeTab === "overview" && openError ? (
            <div className="text-destructive mb-4 rounded-2xl border border-red-500/25 bg-red-500/8 px-4 py-3 text-sm">
              {openError}
            </div>
          ) : null}

          {activeTab === "overview" ? (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
              <section className="rounded-3xl border border-white/8 bg-background/75 p-5 shadow-sm">
                <div className="text-sm font-semibold">Description</div>
                <div className="mt-4 rounded-2xl border border-white/6 bg-surface-alt/55 p-4">
                  {detail.body.trim() ? (
                    <CommentBody body={detail.body} />
                  ) : (
                    <div className="text-muted-foreground text-sm italic">No description provided.</div>
                  )}
                </div>
              </section>

              <div className="grid gap-4">
                <section className="rounded-3xl border border-white/8 bg-background/75 p-5 shadow-sm">
                  <div className="text-sm font-semibold">Review snapshot</div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                    <div className="rounded-2xl border border-white/6 bg-surface-alt/55 px-4 py-3">
                      <div className="text-muted-foreground text-[11px] font-semibold uppercase tracking-[0.12em]">
                        Provider
                      </div>
                      <div className="mt-1 text-sm font-medium">{providerTitle(detail.providerId)}</div>
                    </div>
                    <div className="rounded-2xl border border-white/6 bg-surface-alt/55 px-4 py-3">
                      <div className="text-muted-foreground text-[11px] font-semibold uppercase tracking-[0.12em]">
                        Conversation
                      </div>
                      <div className="mt-1 text-sm font-medium">
                        {issueCommentCount} top-level comments · {reviewThreadCount} review threads
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/6 bg-surface-alt/55 px-4 py-3">
                      <div className="text-muted-foreground text-[11px] font-semibold uppercase tracking-[0.12em]">
                        Changes
                      </div>
                      <div className="mt-1 text-sm font-medium">
                        {files.length} files <span className="text-emerald-400">+{totalAdditions}</span>{" "}
                        <span className="text-rose-400">-{totalDeletions}</span>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="rounded-3xl border border-white/8 bg-background/75 p-5 shadow-sm">
                  <div className="text-sm font-semibold">What happens next</div>
                  <div className="text-muted-foreground mt-2 space-y-2 text-sm leading-6">
                    <p>
                      <span className="font-medium text-foreground">Open on branch</span> switches your current repository to the PR branch after fetching the review refs.
                    </p>
                    <p>
                      <span className="font-medium text-foreground">Open in worktree</span> prepares an isolated review checkout so your main repo stays untouched.
                    </p>
                  </div>
                </section>
              </div>
            </div>
          ) : null}

          {activeTab === "conversation" ? (
            <div className="min-h-0 flex-1 rounded-3xl border border-white/8 bg-background/75">
              <PullRequestConversationTab
                providerId={detail.providerId}
                repoPath={activeRepo}
                pullRequestNumber={detail.number}
                conversation={conversation}
                activeThreadId={activeThreadId}
                onSelectThread={setActiveThreadId}
                onJumpToThread={() => {
                  toast.info("Open this PR on a branch or in a worktree to jump from comments into the diff.");
                }}
              />
            </div>
          ) : null}

          {activeTab === "files" ? (
            <div className="h-full min-h-0 overflow-hidden rounded-3xl border border-white/8 bg-background/75">
              <FilesDiffViewer
                files={files}
                selectedPath={selectedFilePath}
                patch={patch}
                patchError={patchError}
                isLoadingPatch={isLoadingPatch}
              />
            </div>
          ) : null}

          {activeTab === "checks" ? (
            <PreviewPlaceholder
              icon={ShieldCheck}
              title="Checks preview is next"
              description="Checks will live here in the preview shell. For now, open the PR locally to continue review."
            />
          ) : null}
        </div>
      </div>
    </div>
  );

  if (activeTab === "files") {
    return (
      <div className="flex h-full min-h-0">
        <PullRequestPreviewModeRail activeTab={activeTab} onTabChange={handleTabChange} />
        <div className="min-w-0 flex-1">
          <ResizableSidebarLayout
            sidebarDefaultSize={24}
            sidebarMinSize={16}
            sidebarMaxSize={36}
            sidebar={
              <FilesSidebar
                files={files}
                selectedPath={selectedFilePath}
                filesError={filesError}
                isLoading={isLoadingFiles}
                onSelectFile={handleSelectFile}
              />
            }
            content={mainContent}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      <PullRequestPreviewModeRail activeTab={activeTab} onTabChange={handleTabChange} />
      <div className="min-w-0 flex-1">{mainContent}</div>
    </div>
  );
}
