import { skipToken } from "@reduxjs/toolkit/query";
import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router";
import { GitBranch, GitPullRequest, Link2, Plug, Unplug } from "lucide-react";

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
import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { setChangesSidebarMode } from "@/features/source-control/sourceControlSlice";
import type { GitProviderId } from "@/platform/desktop";

function providerTitle(providerId: GitProviderId) {
  if (providerId === "github") return "GitHub";
  if (providerId === "gitlab") return "GitLab";
  return "Bitbucket";
}

function providerImplemented(providerId: GitProviderId) {
  return providerId === "github" || providerId === "bitbucket";
}

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
            Add a GitHub personal access token so OpenWarden can list pull requests and prepare local review workspaces.
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
              Use a token with repository read access. Private repositories usually require the `repo` scope.
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
            Add Bitbucket credentials so OpenWarden can list pull requests and prepare local review workspaces.
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

export function PullRequestsSidebarTab() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo);
  const [githubDialogOpen, setGithubDialogOpen] = useState(false);
  const [bitbucketDialogOpen, setBitbucketDialogOpen] = useState(false);

  const { data: connections = [] } = useListProviderConnectionsQuery();
  const { hostedRepo } = useResolveHostedRepoQuery(activeRepo || "", {
    skip: !activeRepo,
    selectFromResult: ({ data }) => ({ hostedRepo: data ?? null }),
  });
  const activeProviderConnection = hostedRepo
    ? connections.find((connection) => connection.providerId === hostedRepo.providerId) ?? null
    : null;
  const [disconnectProvider, { isLoading: disconnectingProvider }] = useDisconnectProviderMutation();
  const pullRequestsQuery = useListPullRequestsQuery(
    activeRepo && hostedRepo && activeProviderConnection ? activeRepo : skipToken,
  );

  function onConnectProvider(providerId: GitProviderId) {
    if (providerId === "github") {
      setGithubDialogOpen(true);
      return;
    }

    if (providerId === "bitbucket") {
      setBitbucketDialogOpen(true);
    }
  }

  function openPreview(pullRequest: { providerId: GitProviderId; number: number }) {
    if (!hostedRepo) return;

    dispatch(setChangesSidebarMode("pull-requests"));
    navigate(
      buildPullRequestPreviewPath({
        providerId: pullRequest.providerId,
        owner: hostedRepo.owner,
        repo: hostedRepo.repo,
        pullRequestNumber: pullRequest.number,
      }),
    );
  }

  return (
    <>
      <ConnectGitHubDialog open={githubDialogOpen} onOpenChange={setGithubDialogOpen} />
      <ConnectBitbucketDialog open={bitbucketDialogOpen} onOpenChange={setBitbucketDialogOpen} />

      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <div className="border-border/70 border-b px-3 py-2">
          <div className="flex items-center gap-2">
            <GitPullRequest className="text-muted-foreground h-4 w-4" />
            <div className="text-sm font-semibold">Pull requests</div>
            {activeProviderConnection ? (
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground ml-auto inline-flex h-6 items-center rounded-md px-2 text-[11px]"
                disabled={disconnectingProvider}
                onClick={() => {
                  void disconnectProvider(activeProviderConnection.providerId).unwrap().catch(() => {});
                }}
              >
                <Unplug className="mr-1 h-3 w-3" />
                Disconnect
              </button>
            ) : null}
          </div>
          <div className="text-muted-foreground mt-1 text-xs leading-5">
            Browse PRs here, then open the preview in the main pane.
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-2">
          {!activeRepo ? (
            <div className="text-muted-foreground px-2 py-3 text-sm">Open a repository first.</div>
          ) : !hostedRepo ? (
            <div className="text-muted-foreground px-2 py-3 text-sm leading-6">
              No supported hosted remote was detected for this repository.
            </div>
          ) : !providerImplemented(hostedRepo.providerId) ? (
            <div className="text-muted-foreground px-2 py-3 text-sm leading-6">
              {providerTitle(hostedRepo.providerId)} support is planned.
            </div>
          ) : !activeProviderConnection ? (
            <div className="space-y-3 px-2 py-3">
              <div className="text-muted-foreground text-sm leading-6">
                Connect {providerTitle(hostedRepo.providerId)} to load pull requests for {hostedRepo.owner}/{hostedRepo.repo}.
              </div>
              <Button size="sm" onClick={() => onConnectProvider(hostedRepo.providerId)}>
                <Plug className="mr-1.5 h-3.5 w-3.5" />
                Connect {providerTitle(hostedRepo.providerId)}
              </Button>
            </div>
          ) : pullRequestsQuery.isLoading || pullRequestsQuery.isFetching ? (
            <div className="space-y-2 px-1 py-2">
              <div className="bg-background/80 h-16 animate-pulse rounded-xl border border-white/6" />
              <div className="bg-background/80 h-16 animate-pulse rounded-xl border border-white/6" />
              <div className="bg-background/80 h-16 animate-pulse rounded-xl border border-white/6" />
            </div>
          ) : pullRequestsQuery.error ? (
            <div className="text-destructive px-2 py-3 text-sm">
              {"message" in pullRequestsQuery.error
                ? String(pullRequestsQuery.error.message)
                : "Failed to load pull requests."}
            </div>
          ) : pullRequestsQuery.data && pullRequestsQuery.data.length > 0 ? (
            <div className="space-y-2">
              {pullRequestsQuery.data.map((pullRequest) => (
                <button
                  key={pullRequest.id}
                  type="button"
                  className="border-border/70 bg-background/75 hover:bg-accent/45 block w-full rounded-2xl border px-3 py-3 text-left transition-colors"
                  onClick={() => {
                    openPreview(pullRequest);
                  }}
                >
                  <div className="flex items-start gap-2.5">
                    <div className="bg-surface-alt mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/8">
                      <GitPullRequest className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="truncate text-sm font-medium">#{pullRequest.number} {pullRequest.title}</div>
                      </div>
                      <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] leading-5">
                        <span>{pullRequest.authorLogin}</span>
                        <span className="inline-flex items-center gap-1">
                          <GitBranch className="h-3 w-3" />
                          {pullRequest.baseRef} ← {pullRequest.headRef}
                        </span>
                      </div>
                      <div className="text-muted-foreground mt-1 flex items-center gap-2 text-[11px]">
                        <span>{formatPullRequestUpdatedAt(pullRequest.updatedAt)}</span>
                        <Link2 className="h-3 w-3" />
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-muted-foreground px-2 py-3 text-sm leading-6">
              No open pull requests were found for this repository.
            </div>
          )}
        </div>
      </div>
    </>
  );
}
