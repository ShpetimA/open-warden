import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileCode2,
  FolderGit2,
  GitBranch,
  GitPullRequest,
  LoaderCircle,
  RefreshCw,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  authorLabel,
  Avatar,
  toDisplayDate,
} from "@/features/pull-requests/components/pullRequestCommentParts";
import type { PullRequestDetail, PullRequestOpenMode } from "@/platform/desktop";

type PullRequestPreviewHeaderProps = {
  owner: string;
  repo: string;
  detail: PullRequestDetail;
  openingMode: PullRequestOpenMode | null;
  isRefreshing?: boolean;
  changedFilesCount?: number;
  additions?: number;
  deletions?: number;
  checksSummary?: string;
  checksCount?: { passed: number; total: number };
  onBack: () => void;
  onOpen: (mode: PullRequestOpenMode) => void;
  onOpenInBrowser: () => void;
  onCopyLink: () => void;
  onCopyBranch: () => void;
  onRefresh?: () => void;
  onToggleFilesView?: () => void;
};

function ChecksIcon({ passed, total }: { passed: number; total: number }) {
  if (total === 0) return null;
  if (passed === total) return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
  if (passed === 0) return <XCircle className="h-3.5 w-3.5 text-red-500" />;
  return <Check className="h-3.5 w-3.5 text-amber-500" />;
}

export function PullRequestPreviewHeader({
  owner,
  repo,
  detail,
  openingMode,
  isRefreshing,
  changedFilesCount,
  additions,
  deletions,
  checksSummary,
  checksCount,
  onBack,
  onOpen,
  onOpenInBrowser,
  onCopyLink,
  onCopyBranch,
  onRefresh,
  onToggleFilesView,
}: PullRequestPreviewHeaderProps) {
  const compactButtonClass = "h-7 gap-1.5 px-2.5 text-xs";
  const iconButtonClass = "h-7 w-7";
  const author = detail.author;
  const hasChangesStats =
    typeof changedFilesCount === "number" &&
    typeof additions === "number" &&
    typeof deletions === "number";

  return (
    <div className="border-border/70 bg-surface-toolbar relative border-b px-6 py-4">
      {isRefreshing && (
        <div className="absolute top-0 right-0 left-0 h-px overflow-hidden bg-border">
          <div className="h-full w-1/3 animate-pulse bg-primary" />
        </div>
      )}

      <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs" onClick={onBack}>
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </Button>

          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {onRefresh && (
              <Button
                variant="ghost"
                size="icon"
                className={iconButtonClass}
                disabled={isRefreshing}
                onClick={onRefresh}
                title="Refresh PR data"
              >
                <RefreshCw className={isRefreshing ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
              </Button>
            )}
            <Button
              size="sm"
              className="h-8 min-w-[124px]"
              disabled={openingMode !== null}
              onClick={() => onOpen("branch")}
            >
              {openingMode === "branch" ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <GitBranch className="h-3.5 w-3.5" />
              )}
              Open branch
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 min-w-[132px]"
              disabled={openingMode !== null}
              onClick={() => onOpen("worktree")}
            >
              {openingMode === "worktree" ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FolderGit2 className="h-3.5 w-3.5" />
              )}
              Open worktree
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-2 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0 flex-1">
            <div className="text-muted-foreground text-[10px] font-semibold tracking-[0.14em] uppercase">
              Pull Request Preview
            </div>
            <h1 className="mt-1 text-[20px] leading-tight font-semibold tracking-[-0.02em]">
              {detail.title}
            </h1>
            <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <span className="font-medium text-foreground">
                {owner}/{repo}
              </span>
              <span>#{detail.number}</span>
              <span className="text-muted-foreground/60">·</span>
              <span className="inline-flex min-w-0 max-w-full items-center rounded-md border border-border/70 bg-surface-0 px-1.5 py-0.5 font-mono text-[11px]">
                <span className="min-w-0 truncate">{detail.baseRef}</span>
                <span className="px-1">←</span>
                <span className="min-w-0 truncate">{detail.headRef}</span>
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 xl:justify-end">
            <Button
              variant="ghost"
              size="sm"
              className={compactButtonClass}
              onClick={onOpenInBrowser}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Browser
            </Button>
            <Button variant="ghost" size="sm" className={compactButtonClass} onClick={onCopyLink}>
              <Copy className="h-3.5 w-3.5" />
              PR link
            </Button>
            <Button variant="ghost" size="sm" className={compactButtonClass} onClick={onCopyBranch}>
              <GitPullRequest className="h-3.5 w-3.5" />
              Branch
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/70 pt-2">
          <div className="flex min-w-0 items-center gap-2">
            <Avatar login={author?.login ?? null} avatarUrl={author?.avatarUrl ?? null} />
            <div className="min-w-0 truncate text-xs">
              <span className="font-medium text-foreground">
                {authorLabel(author?.login ?? null, author?.displayName ?? null)}
              </span>
              <span className="text-muted-foreground">
                {" "}
                opened {toDisplayDate(detail.createdAt)}
              </span>
            </div>
          </div>

          {hasChangesStats && onToggleFilesView && (
            <Button
              type="button"
              onClick={onToggleFilesView}
              variant="ghost"
              size="sm"
              className="h-7 min-w-0 rounded-md px-2 text-xs"
            >
              <FileCode2 className="h-3.5 w-3.5 text-muted-foreground" />
              <span>{changedFilesCount} files</span>
              <span className="text-emerald-500">+{additions}</span>
              <span className="text-red-500">-{deletions}</span>
            </Button>
          )}

          {checksSummary && (
            <div className="flex items-center gap-1.5 text-xs">
              {checksCount && <ChecksIcon passed={checksCount.passed} total={checksCount.total} />}
              <span className="text-muted-foreground">{checksSummary}</span>
            </div>
          )}

          <div className="text-muted-foreground text-xs">
            Updated {toDisplayDate(detail.updatedAt)}
          </div>
        </div>
      </div>
    </div>
  );
}
