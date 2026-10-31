import { PullRequestRefreshControl } from "../refresh/PullRequestRefreshControl";
import { ResizableSidebarLayout } from "@/components/layout/ResizableSidebarLayout";
import { ErrorState, ErrorNotice } from "@/components/ui/error-state";
import { readDesktopFailure } from "@/platform/desktop/failure";
import { skipToken } from "@reduxjs/toolkit/query";
import { useHotkey } from "@tanstack/react-hotkeys";
import { MoreHorizontal, Plug, Unplug } from "lucide-react";
import { useEffect, useState } from "react";

import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { Button } from "@/components/ui/button";
import { ListLoadingState } from "@/components/ui/list-loading-state";
import { Spinner } from "@/components/ui/spinner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useCommandComposerLauncher } from "@/features/command-palette/CommandComposerLauncher";
import {
  useDisconnectProviderMutation,
  useListProviderConnectionsQuery,
  useListPullRequestsQuery,
  useResolveHostedRepoQuery,
} from "@/features/hosted-repos/api";
import {
  ConnectBitbucketDialog,
  ConnectGitHubDialog,
} from "@/features/pull-requests/components/ConnectToProviders";
import { PullRequestInboxFilters } from "@/features/pull-requests/inbox/PullRequestInboxFilters";
import { PullRequestInboxPreview } from "@/features/pull-requests/inbox/PullRequestInboxPreview";
import { PullRequestInboxRow } from "@/features/pull-requests/inbox/PullRequestInboxRow";
import { usePullRequestInboxFilters } from "@/features/pull-requests/inbox/usePullRequestInboxFilters";
import { isTypingTarget } from "@/features/source-control/utils";
import { openPullRequestWorkspace } from "@/features/workspaces/actions";
import type { GitProviderId, PullRequestPerson, PullRequestSummary } from "@/platform/desktop";

const PULL_REQUESTS_PAGE_SIZE = 25;

function providerTitle(providerId: GitProviderId) {
  if (providerId === "github") return "GitHub";
  if (providerId === "gitlab") return "GitLab";
  return "Bitbucket";
}

function providerImplemented(providerId: GitProviderId) {
  return providerId === "github" || providerId === "bitbucket";
}

function RowSkeletons() {
  return (
    <div className="flex flex-col" role="status">
      <div className="text-muted-foreground flex items-center gap-2 px-4 py-3 text-xs">
        <Spinner aria-hidden="true" className="motion-reduce:animate-none" />
        Loading pull requests…
      </div>
      <div aria-hidden="true">
        {[0, 1, 2, 3].map((row) => (
          <div key={row} className="border-border/50 flex items-center gap-3 border-b px-4 py-3">
            <div className="bg-border size-4 motion-safe:animate-pulse rounded-full" />
            <div className="flex-1 space-y-2">
              <div className="bg-border h-3.5 w-2/3 motion-safe:animate-pulse rounded" />
              <div className="bg-border h-3 w-1/2 motion-safe:animate-pulse rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-muted-foreground flex h-full min-h-40 items-center justify-center p-6 text-center text-sm">
      {children}
    </div>
  );
}

/** Authors seen in the current results, so the author filter can suggest real people. */
function uniqueAuthors(pullRequests: PullRequestSummary[]) {
  const byLogin = new Map<string, PullRequestPerson>();
  for (const pullRequest of pullRequests) byLogin.set(pullRequest.author.login, pullRequest.author);
  return Array.from(byLogin.values());
}

export function PullRequestsScreen() {
  const dispatch = useAppDispatch();
  const openComposer = useCommandComposerLauncher();
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo);
  const [githubDialogOpen, setGithubDialogOpen] = useState(false);
  const [bitbucketDialogOpen, setBitbucketDialogOpen] = useState(false);
  const [pullRequestsPage, setPullRequestsPage] = useState(1);
  const [selectedPullRequestNumber, setSelectedPullRequestNumber] = useState<number | null>(null);
  const [filters] = usePullRequestInboxFilters();

  const {
    connections,
    loadingConnections,
    fetchingConnections,
    connectionsError,
    refetch: retryConnections,
  } = useListProviderConnectionsQuery(undefined, {
    selectFromResult: ({ data, isFetching, error }) => ({
      connections: data ?? [],
      loadingConnections: isFetching && !data,
      connectionsError: error,
      fetchingConnections: isFetching,
    }),
  });

  const {
    hostedRepo,
    hostedRepoError,
    resolvingHostedRepo,
    fetchingHostedRepo,
    refetch: retryHostedRepo,
  } = useResolveHostedRepoQuery(activeRepo, {
    skip: !activeRepo,
    selectFromResult: ({ currentData, error, isFetching }) => ({
      hostedRepo: currentData ?? null,
      hostedRepoError: error,
      fetchingHostedRepo: isFetching,
      resolvingHostedRepo: isFetching && !currentData,
    }),
  });

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
    hasCachedPullRequests,
    lastUpdated,
    refetch: refetchPullRequests,
  } = useListPullRequestsQuery(
    activeRepo && hostedRepo && activeProviderConnection
      ? {
          repoPath: activeRepo,
          page: pullRequestsPage,
          perPage: PULL_REQUESTS_PAGE_SIZE,
          state: filters.state,
          query: filters.q,
          author: filters.author,
          involvement: filters.involvement,
        }
      : skipToken,
    {
      selectFromResult: ({ currentData, error, isLoading, isFetching, fulfilledTimeStamp }) => ({
        pullRequests: currentData?.pullRequests ?? [],
        hasNextPullRequestsPage: currentData?.hasNextPage ?? false,
        pullRequestsError: error,
        hasCachedPullRequests: currentData !== undefined,
        lastUpdated: fulfilledTimeStamp,
        loadingPullRequests: isLoading || (isFetching && !currentData),
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
    setPullRequestsPage(1);
    setSelectedPullRequestNumber(null);
  }, [filters.state, filters.q, filters.author, filters.involvement]);

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

  function onOpenPullRequest(pullRequest: PullRequestSummary) {
    if (!hostedRepo) return;
    void dispatch(
      openPullRequestWorkspace({
        repoPath: activeRepo,
        providerId: pullRequest.providerId,
        owner: hostedRepo.owner,
        repo: hostedRepo.repo,
        pullRequestNumber: pullRequest.number,
        title: pullRequest.title,
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

  function ignoresListKeys(event: KeyboardEvent) {
    return (
      isTypingTarget(event.target) ||
      (event.target instanceof Element &&
        Boolean(event.target.closest('[data-slot^="select-"], [role="menu"], [role="dialog"]')))
    );
  }

  function handleListNavigation(event: KeyboardEvent, direction: 1 | -1) {
    if (ignoresListKeys(event)) return;
    event.preventDefault();
    moveSelection(direction);
  }

  const listHotkeyOptions = {
    ignoreInputs: false,
    preventDefault: false,
    stopPropagation: false,
  } as const;
  useHotkey("ArrowDown", (event) => handleListNavigation(event, 1), listHotkeyOptions);
  useHotkey("J", (event) => handleListNavigation(event, 1), listHotkeyOptions);
  useHotkey("ArrowUp", (event) => handleListNavigation(event, -1), listHotkeyOptions);
  useHotkey("K", (event) => handleListNavigation(event, -1), listHotkeyOptions);
  useHotkey(
    "Enter",
    (event) => {
      if (ignoresListKeys(event) || !selectedPullRequest) return;
      event.preventDefault();
      onOpenPullRequest(selectedPullRequest);
    },
    listHotkeyOptions,
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

  function renderPagination() {
    if (pullRequestsPage <= 1 && !hasNextPullRequestsPage) {
      return null;
    }

    return (
      <div className="border-border/70 flex items-center justify-between border-t px-3 py-2">
        <div className="text-muted-foreground text-xs">Page {String(pullRequestsPage)}</div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            disabled={pullRequestsPage <= 1 || fetchingPullRequests}
            onClick={() => setPullRequestsPage((current) => Math.max(1, current - 1))}
          >
            Previous
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={!hasNextPullRequestsPage || fetchingPullRequests}
            onClick={() => setPullRequestsPage((current) => current + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    );
  }

  function pullRequestsRecovery() {
    const failure = readDesktopFailure(pullRequestsError);
    if ((failure?.code === "authentication" || failure?.code === "permission") && hostedRepo) {
      return {
        label: `Reconnect ${providerTitle(hostedRepo.providerId)}`,
        onAction: () => onConnectProvider(hostedRepo.providerId),
      };
    }
    return {
      label: "Retry",
      onAction: () => {
        void refetchPullRequests();
      },
    };
  }

  function renderList() {
    if (pullRequestsError && !hasCachedPullRequests) {
      return (
        <ErrorState
          title="Couldn’t load pull requests"
          error={pullRequestsError}
          busy={fetchingPullRequests}
          recovery={pullRequestsRecovery()}
        />
      );
    }
    if (loadingPullRequests) return <RowSkeletons />;
    if (pullRequests.length === 0) {
      return (
        <EmptyState>
          {filters.involvement === "review-requested"
            ? "Nothing is waiting on your review."
            : "No pull requests match these filters."}
        </EmptyState>
      );
    }
    return pullRequests.map((pullRequest, index) => (
      <PullRequestInboxRow
        key={pullRequest.id}
        pullRequest={pullRequest}
        selected={selectedPullRequest?.number === pullRequest.number}
        index={index}
        onSelect={() => setSelectedPullRequestNumber(pullRequest.number)}
        onOpen={() => onOpenPullRequest(pullRequest)}
      />
    ));
  }

  function renderContent() {
    if (connectionsError && connections.length === 0)
      return (
        <ErrorState
          title="Couldn’t load provider connections"
          error={connectionsError}
          busy={fetchingConnections}
          recovery={{
            label: "Retry",
            onAction: () => {
              void retryConnections();
            },
          }}
        />
      );
    if (hostedRepoError && !hostedRepo)
      return (
        <ErrorState
          title="Couldn’t detect this repository’s provider"
          error={hostedRepoError}
          busy={fetchingHostedRepo}
          recovery={{
            label: "Retry",
            onAction: () => {
              void retryHostedRepo();
            },
          }}
        />
      );
    if (resolvingHostedRepo || loadingConnections) return <RowSkeletons />;
    if (!hostedRepo) {
      return <EmptyState>No supported hosted remote was detected for this repository.</EmptyState>;
    }
    if (!providerImplemented(hostedRepo.providerId)) {
      return <EmptyState>{providerTitle(hostedRepo.providerId)} support is planned.</EmptyState>;
    }
    if (!activeProviderConnection) {
      return (
        <section className="bg-surface-0 m-6 max-w-xl rounded-lg border p-4">
          <div className="text-sm font-medium">Connect {providerTitle(hostedRepo.providerId)}</div>
          <p className="text-muted-foreground mt-1 text-sm">
            We detected {hostedRepo.owner}/{hostedRepo.repo} from your git remote. Connect{" "}
            {providerTitle(hostedRepo.providerId)} to load pull requests.
          </p>
          <Button
            size="sm"
            className="mt-4"
            disabled={loadingConnections}
            onClick={() => onConnectProvider(hostedRepo.providerId)}
          >
            <Plug />
            Connect {providerTitle(hostedRepo.providerId)}
          </Button>
        </section>
      );
    }

    return (
      <ResizableSidebarLayout
        panelId="primary"
        contentPanelId="pr-files"
        sidebarDefaultSize={55}
        sidebarMinSize="360px"
        sidebarMaxSize={100}
        contentMinSize="280px"
        sidebar={
          <section
            aria-label="Pull request list"
            className="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
          >
            {pullRequestsError && hasCachedPullRequests ? (
              <ErrorNotice
                lastUpdated={lastUpdated}
                title="Couldn’t refresh pull requests"
                error={pullRequestsError}
                busy={fetchingPullRequests}
                recovery={pullRequestsRecovery()}
              />
            ) : null}
            {fetchingPullRequests && !loadingPullRequests && !pullRequestsError ? (
              <div
                role="status"
                className="text-muted-foreground flex items-center gap-2 border-b px-4 py-2 text-xs"
              >
                <Spinner aria-hidden="true" className="motion-reduce:animate-none" />
                Refreshing pull requests…
              </div>
            ) : null}
            <div className="min-h-0 flex-1 overflow-y-auto">{renderList()}</div>
            {renderPagination()}
            <div className="border-border/70 text-muted-foreground border-t px-4 py-1.5 text-[11px]">
              ↑↓ or J/K to move · Enter to open · / to search
            </div>
          </section>
        }
        content={
          loadingPullRequests ? (
            <aside className="bg-surface h-full min-h-0">
              <ListLoadingState label="Loading pull request preview…" />
            </aside>
          ) : (
            <PullRequestInboxPreview
              repoPath={activeRepo}
              pullRequest={selectedPullRequest}
              onOpen={onOpenPullRequest}
              onActions={(pullRequest) => openComposer(undefined, pullRequest)}
            />
          )
        }
      />
    );
  }

  return (
    <TooltipProvider>
      <ConnectGitHubDialog open={githubDialogOpen} onOpenChange={setGithubDialogOpen} />
      <ConnectBitbucketDialog open={bitbucketDialogOpen} onOpenChange={setBitbucketDialogOpen} />

      <div className="flex h-full min-h-0 flex-col overflow-hidden px-6 pt-5">
        <header className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-[-0.02em]">Pull Requests</h1>
            <div className="text-muted-foreground mt-0.5 text-xs">{headerSubtitle()}</div>
          </div>
          {activeProviderConnection ? (
            <div className="flex items-center gap-1.5">
              <PullRequestRefreshControl
                locator={
                  selectedPullRequestNumber
                    ? { repoPath: activeRepo, pullRequestNumber: selectedPullRequestNumber }
                    : null
                }
                onRefreshList={() => {
                  void refetchPullRequests();
                }}
                listBusy={fetchingPullRequests}
                listRetryAt={readDesktopFailure(pullRequestsError)?.retryAt}
              />
              <UserAvatar
                login={activeProviderConnection.login}
                name={activeProviderConnection.displayName}
                avatarUrl={activeProviderConnection.avatarUrl}
                size="sm"
              />
              <span className="text-muted-foreground hidden text-xs sm:inline">
                {activeProviderConnection.displayName ?? activeProviderConnection.login}
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label="Provider connection">
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={disconnectingProvider}
                    onSelect={() => void onDisconnectProvider(activeProviderConnection.providerId)}
                  >
                    <Unplug /> Disconnect {providerTitle(activeProviderConnection.providerId)}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : null}
        </header>

        {activeProviderConnection ? (
          <PullRequestInboxFilters authors={uniqueAuthors(pullRequests)} />
        ) : null}
        <div className="border-border/70 -mx-6 min-h-0 flex-1 border-t">{renderContent()}</div>
      </div>
    </TooltipProvider>
  );
}
