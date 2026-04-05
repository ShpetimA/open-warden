import { skipToken } from "@reduxjs/toolkit/query";
import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router";
import {
  FolderGit2,
  GitBranch,
  GitPullRequest,
  Link2,
  LoaderCircle,
  Plug,
  Unplug,
} from "lucide-react";

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
import { openPullRequestReview } from "@/features/hosted-repos/actions";
import { repoLabel, repoParentPath } from "@/features/source-control/utils";
import { cn } from "@/lib/utils";
import type { GitProviderId, ProviderConnection } from "@/platform/desktop";

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

type ProviderConnectionCardProps = {
  providerId: GitProviderId;
  connection: ProviderConnection | null;
  loading: boolean;
  disconnecting: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
};

function ProviderConnectionCard({
  providerId,
  connection,
  loading,
  disconnecting,
  onConnect,
  onDisconnect,
}: ProviderConnectionCardProps) {
  const isImplemented = providerImplemented(providerId);

  return (
    <section className="border-border/70 bg-surface-alt rounded-2xl border p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">{providerTitle(providerId)}</div>
          <div className="text-muted-foreground mt-1 text-xs leading-5">
            {isImplemented
              ? "Connect once to list pull requests and create local review worktrees."
              : "Planned provider. The interface is ready, but the backend is not wired yet."}
          </div>
        </div>
        <div
          className={cn(
            "rounded-full border px-2 py-1 text-[11px] font-medium",
            connection
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
              : "border-border/80 bg-background text-muted-foreground",
          )}
        >
          {connection ? "Connected" : isImplemented ? "Not connected" : "Planned"}
        </div>
      </div>

      {loading ? (
        <div className="bg-background/80 mt-4 h-10 animate-pulse rounded-xl border border-white/6" />
      ) : connection ? (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-white/6 bg-background/70 px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{connection.login}</div>
            <div className="text-muted-foreground truncate text-xs">
              {connection.displayName || "Connected account"}
            </div>
          </div>
          <Button variant="outline" size="sm" disabled={disconnecting} onClick={onDisconnect}>
            <Unplug className="mr-1.5 h-3.5 w-3.5" />
            Disconnect
          </Button>
        </div>
      ) : (
        <div className="mt-4">
          <Button size="sm" onClick={onConnect} disabled={!isImplemented}>
            <Plug className="mr-1.5 h-3.5 w-3.5" />
            {isImplemented ? "Connect" : "Coming soon"}
          </Button>
        </div>
      )}
    </section>
  );
}

type PullRequestStateCardProps = {
  activeRepo: string;
};

function PullRequestStateCard({ activeRepo }: PullRequestStateCardProps) {
  const { hostedRepo, hostedRepoError, resolvingHostedRepo } = useResolveHostedRepoQuery(activeRepo, {
    skip: !activeRepo,
    selectFromResult: ({ data, error, isLoading, isFetching }) => ({
      hostedRepo: data ?? null,
      hostedRepoError: error && "message" in error ? String(error.message) : "",
      resolvingHostedRepo: isLoading || isFetching,
    }),
  });

  return (
    <section className="border-border/70 bg-surface-alt rounded-2xl border p-4">
      <div className="flex items-start gap-3">
        <div className="bg-background flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/8">
          <FolderGit2 className="text-muted-foreground h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold">Active repository</div>
          <div className="mt-1 text-sm">{repoLabel(activeRepo)}</div>
          <div className="text-muted-foreground truncate text-xs">{repoParentPath(activeRepo)}</div>
        </div>
      </div>

      {resolvingHostedRepo ? (
        <div className="mt-4 space-y-2">
          <div className="bg-background/80 h-10 animate-pulse rounded-xl border border-white/6" />
          <div className="bg-background/80 h-10 animate-pulse rounded-xl border border-white/6" />
        </div>
      ) : hostedRepoError ? (
        <div className="text-destructive mt-4 text-sm">{hostedRepoError}</div>
      ) : !hostedRepo ? (
        <div className="text-muted-foreground mt-4 text-sm leading-6">
          No supported hosted remote was detected for the current repository.
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-white/6 bg-background/70 p-3">
          <div className="flex items-center gap-2">
            <div className="text-sm font-medium">
              {hostedRepo.owner}/{hostedRepo.repo}
            </div>
            <div className="border-border/80 bg-background text-muted-foreground rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase">
              {hostedRepo.providerId}
            </div>
          </div>
          <div className="text-muted-foreground mt-2 text-xs leading-5">
            Remote: {hostedRepo.remoteName}
          </div>
          <div className="text-muted-foreground truncate text-xs">{hostedRepo.remoteUrl}</div>
        </div>
      )}
    </section>
  );
}

export function PullRequestsScreen() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo);
  const [githubDialogOpen, setGithubDialogOpen] = useState(false);
  const [bitbucketDialogOpen, setBitbucketDialogOpen] = useState(false);
  const [openingPullRequestNumber, setOpeningPullRequestNumber] = useState<number | null>(null);

  const { data: connections = [], isLoading: loadingConnections, isFetching: fetchingConnections } =
    useListProviderConnectionsQuery();
  const githubConnection = connections.find((connection) => connection.providerId === "github") ?? null;
  const bitbucketConnection =
    connections.find((connection) => connection.providerId === "bitbucket") ?? null;
  const { hostedRepo } = useResolveHostedRepoQuery(activeRepo, {
    skip: !activeRepo,
    selectFromResult: ({ data }) => ({
      hostedRepo: data ?? null,
    }),
  });
  const activeProviderConnection = hostedRepo
    ? connections.find((connection) => connection.providerId === hostedRepo.providerId) ?? null
    : null;
  const [disconnectProvider, { isLoading: disconnectingProvider }] = useDisconnectProviderMutation();
  const pullRequestsQuery = useListPullRequestsQuery(
    activeRepo && hostedRepo && activeProviderConnection ? activeRepo : skipToken,
  );

  async function onDisconnectProvider(providerId: GitProviderId) {
    try {
      await disconnectProvider(providerId).unwrap();
    } catch {
      return;
    }
  }

  async function onOpenPullRequest(pullRequestNumber: number) {
    setOpeningPullRequestNumber(pullRequestNumber);
    const preparedWorkspace = await dispatch(openPullRequestReview(pullRequestNumber));
    setOpeningPullRequestNumber(null);

    if (preparedWorkspace) {
      navigate("/changes");
    }
  }

  function onConnectProvider(providerId: GitProviderId) {
    if (providerId === "github") {
      setGithubDialogOpen(true);
      return;
    }

    if (providerId === "bitbucket") {
      setBitbucketDialogOpen(true);
    }
  }

  if (!activeRepo) {
    return null;
  }

  const showPullRequestList = Boolean(hostedRepo && activeProviderConnection);
  const loadingProviderConnections = loadingConnections || fetchingConnections;

  return (
    <>
      <ConnectGitHubDialog open={githubDialogOpen} onOpenChange={setGithubDialogOpen} />
      <ConnectBitbucketDialog open={bitbucketDialogOpen} onOpenChange={setBitbucketDialogOpen} />

      <div className="h-full overflow-auto px-6 py-6">
        <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6">
          <section className="flex flex-col gap-2">
            <div className="text-[26px] font-semibold tracking-[-0.03em]">Pull Requests</div>
            <p className="text-muted-foreground max-w-[760px] text-sm leading-6">
              Connect a hosted git provider, inspect pull requests for the active repository, and
              open a dedicated local review workspace with full diff and LSP support.
            </p>
          </section>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-1">
              <ProviderConnectionCard
                providerId="github"
                connection={githubConnection}
                loading={loadingProviderConnections}
                disconnecting={disconnectingProvider}
                onConnect={() => {
                  onConnectProvider("github");
                }}
                onDisconnect={() => {
                  void onDisconnectProvider("github");
                }}
              />
              <ProviderConnectionCard
                providerId="gitlab"
                connection={null}
                loading={false}
                disconnecting={false}
                onConnect={() => {}}
                onDisconnect={() => {}}
              />
              <ProviderConnectionCard
                providerId="bitbucket"
                connection={bitbucketConnection}
                loading={loadingProviderConnections}
                disconnecting={disconnectingProvider}
                onConnect={() => {
                  onConnectProvider("bitbucket");
                }}
                onDisconnect={() => {
                  void onDisconnectProvider("bitbucket");
                }}
              />
            </section>

            <div className="grid gap-4">
              <PullRequestStateCard activeRepo={activeRepo} />

              <section className="border-border/70 bg-surface-alt rounded-2xl border p-4">
                <div className="flex items-center gap-2">
                  <GitPullRequest className="text-muted-foreground h-4 w-4" />
                  <div className="text-sm font-semibold">Repository pull requests</div>
                </div>

                {!hostedRepo ? (
                  <div className="text-muted-foreground mt-4 text-sm leading-6">
                    Open a repository with a supported hosted remote to load pull requests here.
                  </div>
                ) : !providerImplemented(hostedRepo.providerId) ? (
                  <div className="text-muted-foreground mt-4 text-sm leading-6">
                    {providerTitle(hostedRepo.providerId)} support is planned.
                  </div>
                ) : !activeProviderConnection ? (
                  <div className="mt-4 space-y-3">
                    <div className="text-muted-foreground text-sm leading-6">
                      Connect {providerTitle(hostedRepo.providerId)} to load pull requests for{" "}
                      {hostedRepo.owner}/{hostedRepo.repo}.
                    </div>
                    <Button size="sm" onClick={() => onConnectProvider(hostedRepo.providerId)}>
                      <Plug className="mr-1.5 h-3.5 w-3.5" />
                      Connect {providerTitle(hostedRepo.providerId)}
                    </Button>
                  </div>
                ) : pullRequestsQuery.isLoading || pullRequestsQuery.isFetching ? (
                  <div className="mt-4 space-y-2">
                    <div className="bg-background/80 h-16 animate-pulse rounded-xl border border-white/6" />
                    <div className="bg-background/80 h-16 animate-pulse rounded-xl border border-white/6" />
                    <div className="bg-background/80 h-16 animate-pulse rounded-xl border border-white/6" />
                  </div>
                ) : pullRequestsQuery.error ? (
                  <div className="text-destructive mt-4 text-sm">
                    {"message" in pullRequestsQuery.error
                      ? String(pullRequestsQuery.error.message)
                      : "Failed to load pull requests."}
                  </div>
                ) : showPullRequestList && pullRequestsQuery.data && pullRequestsQuery.data.length > 0 ? (
                  <div className="mt-4 space-y-2">
                    {pullRequestsQuery.data.map((pullRequest) => {
                      const opening = openingPullRequestNumber === pullRequest.number;

                      return (
                        <button
                          key={pullRequest.id}
                          type="button"
                          className={cn(
                            "border-border/70 bg-background/75 hover:bg-accent/45 block w-full rounded-2xl border px-4 py-3 text-left transition-colors",
                            opening && "border-primary/40",
                          )}
                          disabled={openingPullRequestNumber !== null}
                          onClick={() => {
                            void onOpenPullRequest(pullRequest.number);
                          }}
                        >
                          <div className="flex items-start gap-3">
                            <div className="bg-surface-alt mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/8">
                              {opening ? (
                                <LoaderCircle className="h-4 w-4 animate-spin" />
                              ) : (
                                <GitPullRequest className="h-4 w-4" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <div className="truncate text-sm font-medium">
                                  #{pullRequest.number} {pullRequest.title}
                                </div>
                                {pullRequest.isDraft ? (
                                  <div className="border-border/80 bg-surface-alt text-muted-foreground shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase">
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
                            <Link2 className="text-muted-foreground mt-1 h-3.5 w-3.5 shrink-0" />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-muted-foreground mt-4 text-sm leading-6">
                    No open pull requests were found for this repository.
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
