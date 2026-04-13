import { skipToken } from "@reduxjs/toolkit/query";
import { type FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { GitBranch, GitPullRequest, Plug, Unplug } from "lucide-react";

import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  useConnectProviderMutation,
  useDisconnectProviderMutation,
  useListProviderConnectionsQuery,
  useListPullRequestsQuery,
  useResolveHostedRepoQuery,
} from "@/features/hosted-repos/api";
import { buildPullRequestPreviewPath } from "@/features/pull-requests/utils";
import { setChangesSidebarMode } from "@/features/source-control/sourceControlSlice";
import { errorMessageFrom } from "@/features/source-control/shared-utils/errorMessage";
import type { GitProviderId, PullRequestSummary } from "@/platform/desktop";

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

function providerTitle(providerId: GitProviderId) {
  if (providerId === "github") return "GitHub";
  if (providerId === "gitlab") return "GitLab";
  return "Bitbucket";
}

function providerImplemented(providerId: GitProviderId) {
  return providerId === "github" || providerId === "bitbucket";
}

type ConnectGitHubDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function ConnectGitHubDialog({ open, onOpenChange }: ConnectGitHubDialogProps) {
  const [token, setToken] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [connectProvider, { isLoading }] = useConnectProviderMutation();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextToken = token.trim();
    if (!nextToken) {
      setSubmitError("GitHub token is required.");
      return;
    }

    try {
      await connectProvider({
        providerId: "github",
        method: "pat",
        token: nextToken,
      }).unwrap();
      setToken("");
      setSubmitError("");
      onOpenChange(false);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect GitHub</DialogTitle>
          <DialogDescription>
            Add a GitHub personal access token so OpenWarden can list pull requests and prepare
            local review workspaces.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <div className="text-sm font-medium">Personal access token</div>
            <Input
              type="password"
              autoFocus
              value={token}
              onChange={(event) => {
                setToken(event.target.value);
                if (submitError) {
                  setSubmitError("");
                }
              }}
              placeholder="github_pat_..."
            />
            <div className="text-muted-foreground text-xs leading-5">
              Use a token with repository read access. Private repositories usually require the
              `repo` scope.
            </div>
            {submitError ? <div className="text-destructive text-xs">{submitError}</div> : null}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Connecting..." : "Connect"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type ConnectBitbucketDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function ConnectBitbucketDialog({ open, onOpenChange }: ConnectBitbucketDialogProps) {
  const [identifier, setIdentifier] = useState("");
  const [token, setToken] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [connectProvider, { isLoading }] = useConnectProviderMutation();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextIdentifier = identifier.trim();
    const nextToken = token.trim();
    if (!nextToken) {
      setSubmitError("Bitbucket token or app password is required.");
      return;
    }

    try {
      await connectProvider({
        providerId: "bitbucket",
        method: "pat",
        token: nextToken,
        identifier: nextIdentifier || null,
        authType: "auto",
      }).unwrap();
      setIdentifier("");
      setToken("");
      setSubmitError("");
      onOpenChange(false);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect Bitbucket</DialogTitle>
          <DialogDescription>
            Add Bitbucket credentials so OpenWarden can list pull requests and prepare local review
            workspaces.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <div className="text-sm font-medium">Username or email (optional)</div>
            <Input
              autoFocus
              value={identifier}
              onChange={(event) => {
                setIdentifier(event.target.value);
                if (submitError) {
                  setSubmitError("");
                }
              }}
              placeholder="your-username"
            />
            <div className="text-muted-foreground text-xs leading-5">
              Needed for app password basic auth. Leave empty to try bearer token auth.
            </div>
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium">Token or app password</div>
            <Input
              type="password"
              value={token}
              onChange={(event) => {
                setToken(event.target.value);
                if (submitError) {
                  setSubmitError("");
                }
              }}
              placeholder="App password or access token"
            />
            {submitError ? <div className="text-destructive text-xs">{submitError}</div> : null}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Connecting..." : "Connect"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PullRequestRow({
  pullRequest,
  onOpen,
}: {
  pullRequest: PullRequestSummary;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      className="hover:bg-surface-1 block w-full rounded-lg px-3 py-2.5 text-left transition-colors"
      onClick={onOpen}
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

export function PullRequestsScreen() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo);
  const [githubDialogOpen, setGithubDialogOpen] = useState(false);
  const [bitbucketDialogOpen, setBitbucketDialogOpen] = useState(false);

  const { connections, loadingConnections } = useListProviderConnectionsQuery(undefined, {
    selectFromResult: ({ data, isLoading, isFetching }) => ({
      connections: data ?? [],
      loadingConnections: isLoading || isFetching,
    }),
  });

  const { hostedRepo, hostedRepoError, resolvingHostedRepo } = useResolveHostedRepoQuery(activeRepo, {
    skip: !activeRepo,
    selectFromResult: ({ data, error, isLoading, isFetching }) => ({
      hostedRepo: data ?? null,
      hostedRepoError: data ? "" : errorMessageFrom(error, ""),
      resolvingHostedRepo: isLoading || isFetching,
    }),
  });

  const activeProviderConnection = hostedRepo
    ? connections.find((connection) => connection.providerId === hostedRepo.providerId) ?? null
    : null;

  const [disconnectProvider, { isLoading: disconnectingProvider }] = useDisconnectProviderMutation();

  const { pullRequests, pullRequestsError, loadingPullRequests } = useListPullRequestsQuery(
    activeRepo && hostedRepo && activeProviderConnection ? activeRepo : skipToken,
    {
      selectFromResult: ({ data, error, isLoading, isFetching }) => ({
        pullRequests: data ?? [],
        pullRequestsError: data ? "" : errorMessageFrom(error, ""),
        loadingPullRequests: isLoading || isFetching,
      }),
    },
  );

  useEffect(() => {
    dispatch(setChangesSidebarMode("pull-requests"));
  }, [dispatch]);

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
              <div className="text-sm font-medium">Connect {providerTitle(hostedRepo.providerId)}</div>
              <div className="mt-1 text-sm text-muted-foreground">
                We detected {hostedRepo.owner}/{hostedRepo.repo} from your git remote. Connect {" "}
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

    if (loadingPullRequests) {
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

    if (pullRequests.length === 0) {
      return (
        <div className="rounded-lg border border-border/70 bg-surface-0 p-4 text-sm text-muted-foreground">
          No open pull requests were found for this repository.
        </div>
      );
    }

    return (
      <div className="rounded-lg border border-border/70 bg-surface-0 p-1">
        {pullRequests.map((pullRequest) => (
          <PullRequestRow
            key={pullRequest.id}
            pullRequest={pullRequest}
            onOpen={() => {
              onOpenPullRequest(pullRequest);
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <>
      <ConnectGitHubDialog open={githubDialogOpen} onOpenChange={setGithubDialogOpen} />
      <ConnectBitbucketDialog open={bitbucketDialogOpen} onOpenChange={setBitbucketDialogOpen} />

      <div className="h-full overflow-auto px-6 py-6">
        <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-4">
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

          {renderPullRequestsContent()}
        </div>
      </div>
    </>
  );
}
