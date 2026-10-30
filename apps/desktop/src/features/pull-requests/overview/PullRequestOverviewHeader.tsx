import { ArrowLeft, Copy, FileCode2 } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { DiffStat } from "@/components/ui/diff-stat";
import { RelativeTime } from "@/components/ui/relative-time";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { UserAvatar } from "@/components/ui/user-avatar";

import {
  CommentCountChip,
  PullRequestStateBadge,
  StatusChip,
  summarizeChecks,
  summarizeMergeability,
  summarizeReviews,
} from "./status";
import type { PullRequestOverviewView } from "./types";

function BranchChip({
  baseRef,
  headRef,
  onCopy,
}: {
  baseRef: string;
  headRef: string;
  onCopy: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onCopy}
          className="group border-border/70 bg-surface-1 hover:border-border inline-flex min-w-0 max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[11px]"
        >
          <span className="min-w-0 truncate">{baseRef}</span>
          <span className="text-muted-foreground">←</span>
          <span className="text-foreground min-w-0 truncate">{headRef}</span>
          <Copy className="text-muted-foreground size-3 opacity-0 transition-opacity group-hover:opacity-100" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">Copy branch name</TooltipContent>
    </Tooltip>
  );
}

/**
 * The one place a pull request introduces itself: state, title, who opened it, and a single
 * row of status icons.
 */
export function PullRequestOverviewHeader({
  pullRequest,
  actions,
  refreshing = false,
  onBack,
  onCopyBranch,
  onOpenFiles,
  onOpenChecks,
}: {
  pullRequest: PullRequestOverviewView;
  actions: ReactNode;
  refreshing?: boolean;
  onBack: () => void;
  onCopyBranch: () => void;
  onOpenFiles: () => void;
  onOpenChecks?: () => void;
}) {
  const reviews = summarizeReviews(pullRequest.reviewers, pullRequest.requiredApprovals);
  const checks = summarizeChecks(pullRequest.checks);
  const merge = summarizeMergeability(pullRequest.mergeability, pullRequest.baseRef);
  const { author } = pullRequest;

  return (
    <header className="border-border/70 bg-surface-toolbar relative border-b px-6 pt-3 pb-3">
      {refreshing ? (
        <div className="bg-border absolute inset-x-0 top-0 h-px overflow-hidden">
          <div className="bg-primary h-full w-1/3 animate-pulse" />
        </div>
      ) : null}
      <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <div className="text-muted-foreground flex min-w-0 items-center gap-1 text-xs">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Back to pull requests"
              onClick={onBack}
            >
              <ArrowLeft />
            </Button>
            <span className="truncate">{pullRequest.repository}</span>
            <span aria-hidden="true">/</span>
            <span className="font-mono">#{pullRequest.number}</span>
          </div>
          {actions}
        </div>

        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-[20px] leading-tight font-semibold tracking-[-0.02em] text-balance">
              {pullRequest.title}
            </h1>
            <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs">
              <PullRequestStateBadge state={pullRequest.state} />
              <span className="inline-flex items-center gap-1.5">
                <UserAvatar
                  login={author.login}
                  name={author.name}
                  avatarUrl={author.avatarUrl}
                  size="sm"
                  showTooltip
                />
                <span className="text-foreground font-medium">{author.name ?? author.login}</span>
              </span>
              <span>wants to merge into</span>
              <BranchChip
                baseRef={pullRequest.baseRef}
                headRef={pullRequest.headRef}
                onCopy={onCopyBranch}
              />
              <span aria-hidden="true">·</span>
              <RelativeTime value={pullRequest.createdAt} prefix="opened" />
            </div>
          </div>
        </div>

        <div
          data-slot="pr-status-row"
          className="-mx-1.5 flex min-h-6 flex-wrap items-center gap-x-1 gap-y-1"
        >
          <StatusChip summary={reviews} />
          {checks ? <StatusChip summary={checks} onClick={onOpenChecks} /> : null}
          <StatusChip summary={merge} />
          <CommentCountChip
            count={pullRequest.commentCount}
            unresolved={pullRequest.unresolvedThreadCount}
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onOpenFiles}
                className="text-muted-foreground hover:text-foreground inline-flex h-6 items-center gap-1.5 rounded-md px-1.5 text-xs"
              >
                <FileCode2 className="size-3.5" />
                {pullRequest.fileStats ? (
                  <>
                    {pullRequest.fileStats.changedFiles} files
                    <DiffStat kind="addition" value={pullRequest.fileStats.additions} />
                    <DiffStat kind="deletion" value={pullRequest.fileStats.deletions} />
                  </>
                ) : (
                  "Files"
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Open changed files</TooltipContent>
          </Tooltip>
          <span className="text-muted-foreground ml-auto text-xs">
            <RelativeTime value={pullRequest.updatedAt} prefix="updated" />
          </span>
        </div>
      </div>
    </header>
  );
}
