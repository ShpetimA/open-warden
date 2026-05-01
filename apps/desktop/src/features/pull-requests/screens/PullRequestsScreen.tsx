import { skipToken } from "@reduxjs/toolkit/query";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import {
  CalendarClock,
  ExternalLink,
  GitBranch,
  GitPullRequest,
  MessageSquare,
  Plug,
  Unplug,
} from "lucide-react";

import { useAppSelector } from "@/app/hooks";
import { Button } from "@/components/ui/button";
import {
  useDisconnectProviderMutation,
  useGetPullRequestConversationQuery,
  useGetPullRequestFilesQuery,
  useListProviderConnectionsQuery,
  useListPullRequestsQuery,
  useResolveHostedRepoQuery,
} from "@/features/hosted-repos/api";
import { CommentBody } from "@/features/pull-requests/components/pullRequestCommentParts";
import { buildPullRequestPreviewPath } from "@/features/pull-requests/utils";
import { errorMessageFrom } from "@/features/source-control/shared-utils/errorMessage";
import { isTypingTarget } from "@/features/source-control/utils";
import type { GitProviderId, PullRequestSummary } from "@/platform/desktop";
import {
  ConnectBitbucketDialog,
  ConnectGitHubDialog,
} from "@/features/pull-requests/components/ConnectToProviders";

function formatPullRequestUpdatedAt(updatedAt: string) {
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) {
    return "Unknown update time";
  }

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatPullRequestLongDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function providerTitle(providerId: GitProviderId) {
  if (providerId === "github") return "GitHub";
  if (providerId === "gitlab") return "GitLab";
  return "Bitbucket";
}

function providerImplemented(providerId: GitProviderId) {
  return providerId === "github" || providerId === "bitbucket";
}

function PreviewDetail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="min-w-0 text-right text-sm font-medium">{value}</dd>
    </div>
  );
}

const PULL_REQUESTS_PAGE_SIZE = 25;

function PullRequestRow({
  pullRequest,
  selected,
  index,
  onSelect,
  onOpen,
}: {
  pullRequest: PullRequestSummary;
  selected: boolean;
  index: number;
  onSelect: () => void;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      data-pull-request-row="true"
      data-pull-request-number={String(pullRequest.number)}
      data-nav-index={String(index)}
      aria-current={selected ? "true" : undefined}
      className={`block w-full px-3 py-2.5 text-left transition-colors ${
        selected
          ? "bg-primary/10 text-foreground shadow-[0_0_0_1px_hsl(var(--primary)/0.24)_inset]"
          : "hover:bg-surface-1"
      }`}
      onClick={onSelect}
      onDoubleClick={onOpen}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0 text-muted-foreground">
          <GitPullRequest className="h-4 w-4" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="truncate text-sm font-medium">
              #{pullRequest.number} {pullRequest.title}
            </div>
            {pullRequest.isDraft ? (
              <div className="shrink-0 rounded-full border border-border/80 px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                Draft
              </div>
            ) : null}
          </div>

          <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-5">
            <span>{pullRequest.authorLogin}</span>
            <span className="inline-flex items-center gap-1">
              <GitBranch className="h-3 w-3" />
              {pullRequest.baseRef} ← {pullRequest.headRef}
            </span>
            <span>{formatPullRequestUpdatedAt(pullRequest.updatedAt)}</span>
          </div>
        </div>
      </div>
    </button>
  );
}

function PullRequestPreviewPane({
  activeRepo,
  pullRequest,
  onOpen,
}: {
  activeRepo: string;
  pullRequest: PullRequestSummary | null;
  onOpen: (pullRequest: PullRequestSummary) => void;
}) {
  const queryArg = pullRequest
    ? { repoPath: activeRepo, pullRequestNumber: pullRequest.number }
    : skipToken;
  const { conversation, loadingConversation } = useGetPullRequestConversationQuery(queryArg, {
    selectFromResult: ({ data, isLoading, isFetching }) => ({
      conversation: data ?? null,
      loadingConversation: isLoading || isFetching,
    }),
  });
  const { files } = useGetPullRequestFilesQuery(queryArg, {
    selectFromResult: ({ data }) => ({
      files: data ?? [],
    }),
  });

  if (!pullRequest) {
    return (
      <aside className="flex h-full min-h-0 items-center justify-center bg-surface-0 p-6 text-center text-sm text-muted-foreground">
        Select a pull request to preview it.
      </aside>
    );
  }

  const detail = conversation?.detail;
  const totalAdditions = files.reduce((sum, file) => sum + file.additions, 0);
  const totalDeletions = files.reduce((sum, file) => sum + file.deletions, 0);

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden bg-surface-0 shadow-[0_1px_2px_hsl(var(--foreground)/0.04)]">
      <div className="border-b border-border/70 px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-muted-foreground flex items-center gap-2 text-xs">
              <GitPullRequest className="h-3.5 w-3.5" />#{pullRequest.number} by{" "}
              {pullRequest.authorLogin}
            </div>
            <h2 className="mt-2 text-lg font-semibold leading-6 tracking-[-0.02em] text-balance">
              {pullRequest.title}
            </h2>
          </div>
          {pullRequest.isDraft ? (
            <div className="shrink-0 rounded-full border border-border/80 px-2 py-1 text-[10px] font-medium uppercase text-muted-foreground">
              Draft
            </div>
          ) : null}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1 rounded-full bg-surface-1 px-2 py-1">
            <GitBranch className="h-3 w-3" />
            {pullRequest.baseRef} ← {pullRequest.headRef}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-surface-1 px-2 py-1">
            <CalendarClock className="h-3 w-3" />
            Updated {formatPullRequestUpdatedAt(pullRequest.updatedAt)}
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-5">
        {loadingConversation && !conversation ? (
          <div className="space-y-3">
            <div className="h-24 animate-pulse rounded-lg bg-background/80" />
            <div className="h-36 animate-pulse rounded-lg bg-background/80" />
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <section>
              <div className="text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase">
                Summary
              </div>
              <div className="mt-3 text-sm leading-6 text-pretty">
                {detail?.body?.trim() ? (
                  <CommentBody body={detail.body} />
                ) : (
                  <div className="text-muted-foreground italic">No description provided.</div>
                )}
              </div>
            </section>

            <section className="rounded-lg bg-background/60 px-4 py-2">
              <dl className="divide-y divide-border/70">
                <PreviewDetail label="Provider" value={providerTitle(pullRequest.providerId)} />
                <PreviewDetail
                  label="Created"
                  value={detail ? formatPullRequestLongDate(detail.createdAt) : "—"}
                />
                <PreviewDetail label="State" value={pullRequest.state} />
                <PreviewDetail
                  label="Conversation"
                  value={
                    conversation
                      ? `${conversation.issueComments.length} comments · ${conversation.reviewThreads.length} threads`
                      : "—"
                  }
                />
                <PreviewDetail
                  label="Changes"
                  value={
                    files.length > 0 ? (
                      <span className="tabular-nums">
                        {files.length} files{" "}
                        <span className="text-emerald-500">+{totalAdditions}</span>{" "}
                        <span className="text-red-500">-{totalDeletions}</span>
                      </span>
                    ) : (
                      "—"
                    )
                  }
                />
              </dl>
            </section>

            {conversation && conversation.issueComments.length > 0 ? (
              <section>
                <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  <MessageSquare className="h-3.5 w-3.5" /> Recent comments
                </div>
                <div className="space-y-3">
                  {conversation.issueComments.slice(0, 2).map((comment) => (
                    <div
                      key={comment.id}
                      className="rounded-lg border border-border/70 bg-background/50 p-3"
                    >
                      <div className="text-muted-foreground mb-2 text-xs">
                        {comment.author?.login ?? "Unknown"} ·{" "}
                        {formatPullRequestUpdatedAt(comment.updatedAt)}
                      </div>
                      <div className="line-clamp-4 text-sm leading-6">
                        <CommentBody body={comment.body} />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        )}
      </div>

      <div className="border-t border-border/70 px-5 py-3">
        <Button className="h-8 w-full gap-1.5 text-xs" onClick={() => onOpen(pullRequest)}>
          Open full review
          <ExternalLink className="h-3.5 w-3.5" />
        </Button>
      </div>
    </aside>
  );
}

export function PullRequestsScreen() {
  const navigate = useNavigate();
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo);
  const [githubDialogOpen, setGithubDialogOpen] = useState(false);
  const [bitbucketDialogOpen, setBitbucketDialogOpen] = useState(false);
  const [pullRequestsPage, setPullRequestsPage] = useState(1);
  const [selectedPullRequestNumber, setSelectedPullRequestNumber] = useState<number | null>(null);

  const { connections, loadingConnections } = useListProviderConnectionsQuery(undefined, {
    selectFromResult: ({ data, isLoading, isFetching }) => ({
      connections: data ?? [],
      loadingConnections: isLoading || isFetching,
    }),
  });

  const { hostedRepo, hostedRepoError, resolvingHostedRepo } = useResolveHostedRepoQuery(
    activeRepo,
    {
      skip: !activeRepo,
      selectFromResult: ({ data, error, isLoading, isFetching }) => ({
        hostedRepo: data ?? null,
        hostedRepoError: data ? "" : errorMessageFrom(error, ""),
        resolvingHostedRepo: isLoading || isFetching,
      }),
    },
  );

  const activeProviderConnection = hostedRepo
    ? (connections.find((connection) => connection.providerId === hostedRepo.providerId) ?? null)
    : null;

  const [disconnectProvider, { isLoading: disconnectingProvider }] =
    useDisconnectProviderMutation();

  const {
    pullRequests,
    hasNextPullRequestsPage,
    pullRequestsError,
    loadingPullRequests,
    fetchingPullRequests,
  } = useListPullRequestsQuery(
    activeRepo && hostedRepo && activeProviderConnection
      ? {
          repoPath: activeRepo,
          page: pullRequestsPage,
          perPage: PULL_REQUESTS_PAGE_SIZE,
        }
      : skipToken,
    {
      selectFromResult: ({ data, error, isLoading, isFetching }) => ({
        pullRequests: data?.pullRequests ?? [],
        hasNextPullRequestsPage: data?.hasNextPage ?? false,
        pullRequestsError: data ? "" : errorMessageFrom(error, ""),
        loadingPullRequests: isLoading,
        fetchingPullRequests: isFetching,
      }),
    },
  );

  const selectedPullRequest =
    pullRequests.find((pullRequest) => pullRequest.number === selectedPullRequestNumber) ??
    pullRequests[0] ??
    null;

  useEffect(() => {
    setPullRequestsPage(1);
    setSelectedPullRequestNumber(null);
  }, [activeRepo, hostedRepo?.providerId, hostedRepo?.owner, hostedRepo?.repo]);

  useEffect(() => {
    if (pullRequests.length === 0) {
      setSelectedPullRequestNumber(null);
      return;
    }

    if (!pullRequests.some((pullRequest) => pullRequest.number === selectedPullRequestNumber)) {
      setSelectedPullRequestNumber(pullRequests[0].number);
    }
  }, [pullRequests, selectedPullRequestNumber]);

  useEffect(() => {
    if (selectedPullRequestNumber === null) {
      return;
    }

    const row = document.querySelector<HTMLElement>(
      `[data-pull-request-number="${selectedPullRequestNumber}"]`,
    );
    row?.scrollIntoView({ block: "nearest" });
  }, [selectedPullRequestNumber]);

  useEffect(() => {
    if (
      !loadingPullRequests &&
      pullRequests.length === 0 &&
      pullRequestsPage > 1 &&
      !hasNextPullRequestsPage
    ) {
      setPullRequestsPage((current) => Math.max(1, current - 1));
    }
  }, [hasNextPullRequestsPage, loadingPullRequests, pullRequests.length, pullRequestsPage]);

  function onConnectProvider(providerId: GitProviderId) {
    if (providerId === "github") {
      setGithubDialogOpen(true);
      return;
    }

    if (providerId === "bitbucket") {
      setBitbucketDialogOpen(true);
    }
  }

  async function onDisconnectProvider(providerId: GitProviderId) {
    try {
      await disconnectProvider(providerId).unwrap();
    } catch {
      return;
    }
  }

  function onOpenPullRequest(pullRequest: { providerId: GitProviderId; number: number }) {
    if (!hostedRepo) {
      return;
    }

    navigate(
      buildPullRequestPreviewPath({
        providerId: pullRequest.providerId,
        owner: hostedRepo.owner,
        repo: hostedRepo.repo,
        pullRequestNumber: pullRequest.number,
      }),
    );
  }

  function moveSelection(direction: 1 | -1) {
    if (pullRequests.length === 0) {
      return;
    }

    const currentIndex = Math.max(
      0,
      pullRequests.findIndex((pullRequest) => pullRequest.number === selectedPullRequest?.number),
    );
    const nextIndex = Math.min(pullRequests.length - 1, Math.max(0, currentIndex + direction));
    setSelectedPullRequestNumber(pullRequests[nextIndex].number);
  }

  function handleListNavigation(event: KeyboardEvent, direction: 1 | -1) {
    if (isTypingTarget(event.target)) {
      return;
    }

    event.preventDefault();
    moveSelection(direction);
  }

  useHotkey("ArrowDown", (event) => handleListNavigation(event, 1), {
    ignoreInputs: false,
    preventDefault: false,
    stopPropagation: false,
  });
  useHotkey("J", (event) => handleListNavigation(event, 1), {
    ignoreInputs: false,
    preventDefault: false,
    stopPropagation: false,
  });
  useHotkey("ArrowUp", (event) => handleListNavigation(event, -1), {
    ignoreInputs: false,
    preventDefault: false,
    stopPropagation: false,
  });
  useHotkey("K", (event) => handleListNavigation(event, -1), {
    ignoreInputs: false,
    preventDefault: false,
    stopPropagation: false,
  });
  useHotkey(
    "Enter",
    (event) => {
      if (isTypingTarget(event.target) || !selectedPullRequest) {
        return;
      }

      event.preventDefault();
      onOpenPullRequest(selectedPullRequest);
    },
    {
      ignoreInputs: false,
      preventDefault: false,
      stopPropagation: false,
    },
  );

  if (!activeRepo) {
    return null;
  }

  function headerSubtitle() {
    if (resolvingHostedRepo) {
      return "Inspecting repository remote…";
    }

    if (!hostedRepo) {
      return "No supported hosted remote detected";
    }

    return `${hostedRepo.owner}/${hostedRepo.repo} · ${providerTitle(hostedRepo.providerId)}`;
  }

  function renderPagination(pageStart: number, pageEnd: number) {
    if (pullRequestsPage <= 1 && !hasNextPullRequestsPage) {
      return null;
    }

    return (
      <div className="border-border/70 flex items-center justify-between border-t px-2 py-2">
        <div className="text-muted-foreground text-xs">
          Showing {String(pageStart + 1)}-{String(pageEnd)}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={pullRequestsPage <= 1 || fetchingPullRequests}
            onClick={() => {
              setPullRequestsPage((current) => Math.max(1, current - 1));
            }}
          >
            Previous
          </Button>
          <div className="text-muted-foreground px-1 text-xs">Page {String(pullRequestsPage)}</div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={!hasNextPullRequestsPage || fetchingPullRequests}
            onClick={() => {
              if (!hasNextPullRequestsPage) {
                return;
              }

              setPullRequestsPage((current) => current + 1);
            }}
          >
            Next
          </Button>
        </div>
      </div>
    );
  }

  function renderPullRequestsContent() {
    if (resolvingHostedRepo) {
      return (
        <div className="space-y-2">
          <div className="bg-background/80 h-16 animate-pulse rounded-lg border border-border/70" />
          <div className="bg-background/80 h-16 animate-pulse rounded-lg border border-border/70" />
          <div className="bg-background/80 h-16 animate-pulse rounded-lg border border-border/70" />
        </div>
      );
    }

    if (hostedRepoError) {
      return <div className="text-destructive text-sm">{hostedRepoError}</div>;
    }

    if (!hostedRepo) {
      return (
        <div className="rounded-lg border border-border/70 bg-surface-0 p-4 text-sm text-muted-foreground">
          No supported hosted remote was detected for this repository.
        </div>
      );
    }

    if (!providerImplemented(hostedRepo.providerId)) {
      return (
        <div className="rounded-lg border border-border/70 bg-surface-0 p-4 text-sm text-muted-foreground">
          {providerTitle(hostedRepo.providerId)} support is planned.
        </div>
      );
    }

    if (!activeProviderConnection) {
      return (
        <section className="rounded-lg border border-border/70 bg-surface-0 p-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 text-muted-foreground">
              <Plug className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium">
                Connect {providerTitle(hostedRepo.providerId)}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                We detected {hostedRepo.owner}/{hostedRepo.repo} from your git remote. Connect{" "}
                {providerTitle(hostedRepo.providerId)} to load pull requests.
              </div>
            </div>
          </div>

          <div className="mt-4">
            <Button
              size="sm"
              disabled={loadingConnections}
              onClick={() => onConnectProvider(hostedRepo.providerId)}
            >
              <Plug className="mr-1.5 h-3.5 w-3.5" />
              Connect {providerTitle(hostedRepo.providerId)}
            </Button>
          </div>
        </section>
      );
    }

    if (loadingPullRequests && pullRequestsPage === 1) {
      return (
        <div className="space-y-1">
          <div className="bg-background/80 h-16 animate-pulse rounded-lg border border-border/70" />
          <div className="bg-background/80 h-16 animate-pulse rounded-lg border border-border/70" />
          <div className="bg-background/80 h-16 animate-pulse rounded-lg border border-border/70" />
        </div>
      );
    }

    if (pullRequestsError) {
      return <div className="text-destructive text-sm">{pullRequestsError}</div>;
    }

    if (pullRequests.length === 0 && pullRequestsPage > 1) {
      const pageStart = (pullRequestsPage - 1) * PULL_REQUESTS_PAGE_SIZE;
      const pageEnd = pageStart + PULL_REQUESTS_PAGE_SIZE;

      return (
        <div className="flex h-full min-h-0 flex-col rounded-lg border border-border/70 bg-surface-0">
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-1">
            <div className="bg-background/80 h-16 animate-pulse rounded-lg border border-border/70" />
            <div className="bg-background/80 h-16 animate-pulse rounded-lg border border-border/70" />
            <div className="bg-background/80 h-16 animate-pulse rounded-lg border border-border/70" />
          </div>
          {renderPagination(pageStart, pageEnd)}
        </div>
      );
    }

    if (pullRequests.length === 0) {
      return (
        <div className="rounded-lg border border-border/70 bg-surface-0 p-4 text-sm text-muted-foreground">
          No open pull requests were found for this repository.
        </div>
      );
    }

    const pageStart = (pullRequestsPage - 1) * PULL_REQUESTS_PAGE_SIZE;
    const pageEnd = pageStart + pullRequests.length;

    return (
      <div className="grid h-full min-h-0 lg:grid-cols-[minmax(360px,0.95fr)_minmax(420px,1.05fr)]">
        <section className="flex min-h-0 flex-col overflow-hidden border-r border-border/70 bg-surface-0 shadow-[0_1px_2px_hsl(var(--foreground)/0.04)]">
          <div className="border-b border-border/70 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium">Open pull requests</div>
                <div className="text-muted-foreground mt-0.5 text-xs">
                  Use ↑/↓ or J/K to preview. Enter opens the review.
                </div>
              </div>
              <div className="text-muted-foreground rounded-full bg-surface-1 px-2 py-1 text-xs tabular-nums">
                {pullRequests.length}
              </div>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {pullRequests.map((pullRequest, index) => (
              <PullRequestRow
                key={pullRequest.id}
                pullRequest={pullRequest}
                selected={selectedPullRequest?.number === pullRequest.number}
                index={index}
                onSelect={() => {
                  setSelectedPullRequestNumber(pullRequest.number);
                }}
                onOpen={() => {
                  onOpenPullRequest(pullRequest);
                }}
              />
            ))}
          </div>
          {renderPagination(pageStart, pageEnd)}
        </section>

        <PullRequestPreviewPane
          activeRepo={activeRepo}
          pullRequest={selectedPullRequest}
          onOpen={onOpenPullRequest}
        />
      </div>
    );
  }

  return (
    <>
      <ConnectGitHubDialog open={githubDialogOpen} onOpenChange={setGithubDialogOpen} />
      <ConnectBitbucketDialog open={bitbucketDialogOpen} onOpenChange={setBitbucketDialogOpen} />

      <div className="h-full overflow-hidden pt-6">
        <div className="mx-auto flex h-full min-h-0 w-full px-6 flex-col">
          <header className="border-border/70 flex flex-wrap items-start justify-between gap-3 border-b pb-3">
            <div>
              <h1 className="text-xl font-semibold tracking-[-0.02em]">Pull Requests</h1>
              <div className="text-muted-foreground mt-1 text-xs">{headerSubtitle()}</div>
            </div>

            {activeProviderConnection ? (
              <div className="flex items-center gap-2">
                <div className="text-muted-foreground hidden text-xs sm:block">
                  Connected as {activeProviderConnection.login}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 px-2 text-xs"
                  disabled={disconnectingProvider}
                  onClick={() => {
                    void onDisconnectProvider(activeProviderConnection.providerId);
                  }}
                >
                  <Unplug className="h-3.5 w-3.5" />
                  Disconnect
                </Button>
              </div>
            ) : null}
          </header>

          <div className="min-h-0 flex-1">{renderPullRequestsContent()}</div>
        </div>
      </div>
    </>
  );
}
