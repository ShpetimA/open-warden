import {
  useRetainPullRequestRefresh,
  usePullRequestRefresh,
} from "../refresh/PullRequestRefreshProvider";
import { Copy, ExternalLink, FileCode2, GitBranch, MoreHorizontal, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/markdown/Markdown";
import { desktopFailure } from "@/platform/desktop/failure";
import { ErrorState, ErrorNotice } from "@/components/ui/error-state";
import { DiffStat } from "@/components/ui/diff-stat";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import { RelativeTime } from "@/components/ui/relative-time";
import { UserAvatar } from "@/components/ui/user-avatar";
import {
  useGetPullRequestChecksQuery,
  useGetPullRequestConversationQuery,
  useGetPullRequestFilesQuery,
} from "@/features/hosted-repos/api";
import { copyToClipboard } from "@/features/pull-requests/components/pullRequestCommentParts";
import {
  CommentCountChip,
  PullRequestStateBadge,
  StatusChip,
  summarizeChecks,
} from "@/features/pull-requests/overview/status";
import type { PullRequestSummary } from "@/platform/desktop";

import { pullRequestStateView, summaryChecksStatus, summaryReviewStatus } from "./listStatus";

const PREVIEW_REFRESH_RESOURCES = ["checks", "files"] as const;

function PreviewStatus({
  repoPath,
  pullRequest,
}: {
  repoPath: string;
  pullRequest: PullRequestSummary;
}) {
  const locator = { repoPath, pullRequestNumber: pullRequest.number };
  useRetainPullRequestRefresh(locator, PREVIEW_REFRESH_RESOURCES);
  const refresh = usePullRequestRefresh(locator);
  const { detail } = useGetPullRequestConversationQuery(locator, {
    selectFromResult: ({ currentData }) => ({ detail: currentData?.detail }),
  });
  // The listing leaves checks and sizes out on Bitbucket; the preview asks for them per PR.
  const { checks, checksError, checksFetching } = useGetPullRequestChecksQuery(locator, {
    selectFromResult: ({ currentData, error, isFetching }) => ({
      checks:
        currentData?.complete &&
        currentData.headSha === detail?.headSha &&
        currentData.baseSha === detail?.baseSha
          ? currentData.checks
          : undefined,
      checksError:
        error ??
        (currentData && !currentData.complete
          ? desktopFailure(
              "getPullRequestChecks",
              "unavailable",
              "Only some checks could be loaded. Refresh or open the pull request in your provider to verify all checks.",
            )
          : undefined),
      checksFetching: isFetching,
    }),
  });
  const { files, filesError, filesFetching } = useGetPullRequestFilesQuery(locator, {
    selectFromResult: ({ currentData, error, isFetching }) => ({
      files:
        currentData?.headSha === detail?.headSha && currentData?.baseSha === detail?.baseSha
          ? currentData?.files
          : undefined,
      filesError: error,
      filesFetching: isFetching,
    }),
  });
  const review = summaryReviewStatus(pullRequest);
  const checksSummary = checks
    ? summarizeChecks(checks)
    : detail
      ? null
      : summaryChecksStatus(pullRequest);
  const additions =
    files?.reduce((sum, file) => sum + file.additions, 0) ??
    (detail ? null : pullRequest.additions);
  const deletions =
    files?.reduce((sum, file) => sum + file.deletions, 0) ??
    (detail ? null : pullRequest.deletions);
  const changedFiles = files?.length ?? (detail ? null : pullRequest.changedFiles);

  return (
    <div className="-mx-1.5 mt-3 flex flex-wrap items-center gap-x-1 gap-y-1">
      {detail && checksError ? (
        <ErrorNotice
          title="Couldn’t load checks"
          error={checksError}
          busy={checksFetching}
          recovery={{
            label: "Retry",
            onAction: () => {
              void refresh.refresh();
            },
          }}
        />
      ) : null}
      {detail && filesError ? (
        <ErrorNotice
          title="Couldn’t load file statistics"
          error={filesError}
          busy={filesFetching}
          recovery={{
            label: "Retry",
            onAction: () => {
              void refresh.refresh();
            },
          }}
        />
      ) : null}
      {review ? <StatusChip summary={review} /> : null}
      {checksSummary ? <StatusChip summary={checksSummary} /> : null}
      {pullRequest.commentCount !== null ? (
        <CommentCountChip count={pullRequest.commentCount} unresolved={0} />
      ) : null}
      {changedFiles !== null && additions !== null && deletions !== null ? (
        <span className="text-muted-foreground inline-flex h-6 items-center gap-1.5 px-1.5 text-xs">
          <FileCode2 className="size-3.5" />
          {changedFiles} files
          <DiffStat kind="addition" value={additions} />
          <DiffStat kind="deletion" value={deletions} />
        </span>
      ) : null}
    </div>
  );
}

function PreviewDescription({ repoPath, number }: { repoPath: string; number: number }) {
  const refresh = usePullRequestRefresh({ repoPath, pullRequestNumber: number });
  const { body, loading, error, isFetching } = useGetPullRequestConversationQuery(
    { repoPath, pullRequestNumber: number },
    {
      selectFromResult: ({ currentData, isFetching, error }) => ({
        body: currentData?.detail.body ?? null,
        loading: isFetching && !currentData,
        isFetching,
        error,
      }),
    },
  );
  const recovery = {
    label: "Retry",
    onAction: () => {
      void refresh.refresh();
    },
  };

  if (error && body === null) {
    return (
      <ErrorState
        title="Couldn’t load this description"
        error={error}
        busy={isFetching}
        recovery={recovery}
      />
    );
  }

  if (loading) {
    return (
      <div className="space-y-2">
        <div className="bg-surface-1 h-4 w-2/3 animate-pulse rounded" />
        <div className="bg-surface-1 h-4 w-full animate-pulse rounded" />
        <div className="bg-surface-1 h-4 w-5/6 animate-pulse rounded" />
      </div>
    );
  }
  return (
    <>
      {error ? (
        <ErrorNotice
          title="Couldn’t refresh this description"
          error={error}
          busy={isFetching}
          recovery={recovery}
        />
      ) : null}
      {body?.trim() ? (
        <Markdown className="text-[13px] leading-5 [&_p]:text-[13px] [&_p]:leading-5 [&_li]:text-[13px] [&_li]:leading-5 [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_h4]:text-[13px] [&_a]:text-[13px] [&_blockquote]:text-[13px]">
          {body}
        </Markdown>
      ) : (
        <p className="text-muted-foreground text-sm italic">No description provided.</p>
      )}
    </>
  );
}

export function PullRequestInboxPreview({
  repoPath,
  pullRequest,
  onOpen,
  onActions,
}: {
  repoPath: string;
  pullRequest: PullRequestSummary | null;
  onOpen: (pullRequest: PullRequestSummary) => void;
  onActions: (pullRequest: PullRequestSummary) => void;
}) {
  if (!pullRequest) {
    return (
      <aside
        aria-label="Pull request preview"
        className="bg-surface-0 text-muted-foreground flex h-full min-h-0 min-w-0 items-center justify-center p-6 text-center text-sm"
      >
        Select a pull request to preview it.
      </aside>
    );
  }

  const { author } = pullRequest;
  return (
    <aside
      aria-label="Pull request preview"
      className="bg-surface-0 flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
    >
      <header className="border-border/70 border-b px-5 py-4">
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          <PullRequestStateBadge state={pullRequestStateView(pullRequest)} />
          <span className="font-mono">#{pullRequest.number}</span>
        </div>
        <h2 className="mt-2 text-lg leading-6 font-semibold tracking-[-0.02em] text-balance">
          {pullRequest.title}
        </h2>
        <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
          <UserAvatar
            login={author.login}
            name={author.displayName}
            avatarUrl={author.avatarUrl}
            size="sm"
          />
          <span className="text-foreground font-medium">{author.displayName ?? author.login}</span>
          <span>wants to merge into</span>
          <span className="border-border/70 bg-surface-1 inline-flex max-w-full min-w-0 items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[11px]">
            <span className="min-w-0 truncate">{pullRequest.baseRef}</span>
            <span>←</span>
            <span className="text-foreground min-w-0 truncate">{pullRequest.headRef}</span>
          </span>
          <span aria-hidden="true">·</span>
          <RelativeTime value={pullRequest.createdAt} prefix="opened" />
        </div>
        <PreviewStatus repoPath={repoPath} pullRequest={pullRequest} />
      </header>

      <div
        data-workspace-scroll
        className="min-h-0 flex-1 overflow-auto px-5 py-4 text-sm leading-6"
      >
        <PreviewDescription repoPath={repoPath} number={pullRequest.number} />
      </div>

      <footer className="border-border/70 flex items-center gap-2 border-t px-5 py-3">
        <Button className="flex-1" onClick={() => onOpen(pullRequest)}>
          Open review
          <Kbd className="bg-primary-foreground/15 text-primary-foreground">↵</Kbd>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" aria-label="More pull request actions">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-52">
            <DropdownMenuItem
              onSelect={() => window.open(pullRequest.url, "_blank", "noopener,noreferrer")}
            >
              <ExternalLink /> Open in browser
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => void copyToClipboard(pullRequest.url, "Pull request link copied")}
            >
              <Copy /> Copy link
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => void copyToClipboard(pullRequest.headRef, "Branch name copied")}
            >
              <GitBranch /> Copy branch name
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onActions(pullRequest)}>
              <Zap /> More actions…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </footer>
    </aside>
  );
}
