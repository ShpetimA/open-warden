import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  GitMerge,
  GitPullRequestClosed,
  GitPullRequestDraft,
} from "lucide-react";
import { useState, type ReactNode, type Ref } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import { mergeMethodLabels, type MergeMethod } from "./PullRequestLifecycleDialog";
import {
  summarizeChecks,
  summarizeMergeability,
  summarizeReviews,
  toneText,
  type StatusSummary,
} from "./status";
import type { CheckView, PullRequestOverviewView } from "./types";

function StatusRow({
  summary,
  title,
  open,
  onOpenChange,
  children,
}: {
  summary: StatusSummary;
  title: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: ReactNode;
}) {
  const Icon = summary.icon;
  const expandable = Boolean(children && onOpenChange);
  return (
    <div className="border-border/70 border-t first:border-t-0">
      <button
        type="button"
        disabled={!expandable}
        aria-expanded={expandable ? open : undefined}
        onClick={() => onOpenChange?.(!open)}
        className="hover:bg-surface-1 flex w-full items-center gap-2.5 px-3 py-2.5 text-left disabled:hover:bg-transparent"
      >
        <Icon className={cn("size-4 shrink-0", toneText[summary.tone])} />
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-medium">{title}</span>
          <span className="text-muted-foreground block truncate text-xs">{summary.detail}</span>
        </span>
        {expandable ? (
          open ? (
            <ChevronDown className="text-muted-foreground size-4" />
          ) : (
            <ChevronRight className="text-muted-foreground size-4" />
          )
        ) : null}
      </button>
      {expandable && open ? <div className="px-3 pb-3 pl-9">{children}</div> : null}
    </div>
  );
}

const checkOrder = ["failed", "pending", "passed"] as const;

export function PullRequestCheckList({ checks }: { checks: CheckView[] }) {
  const ordered = checks.toSorted(
    (left, right) => checkOrder.indexOf(left.state) - checkOrder.indexOf(right.state),
  );
  return (
    <ul className="flex flex-col">
      {ordered.map((check) => {
        const summary = summarizeChecks([check]);
        const Icon = summary?.icon;
        return (
          <li key={check.id} className="group flex min-h-7 items-center gap-2 text-xs">
            {Icon ? <Icon className={cn("size-3.5 shrink-0", toneText[summary.tone])} /> : null}
            <span className="min-w-0 flex-1 truncate" title={check.description ?? undefined}>
              <span className="font-medium">{check.name}</span>
              {check.description ? (
                <span className="text-muted-foreground"> — {check.description}</span>
              ) : null}
            </span>
            {check.url ? (
              <a
                href={check.url}
                target="_blank"
                rel="noreferrer"
                aria-label={`Open ${check.name} details`}
                className="text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              >
                <ExternalLink className="size-3.5" />
              </a>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function PullRequestMergeButton({
  disabled,
  canAutoMerge,
  onMerge,
  onAutoMerge,
}: {
  disabled: boolean;
  canAutoMerge: boolean;
  onMerge: (method: MergeMethod) => void;
  onAutoMerge: () => void;
}) {
  const [method, setMethod] = useState<MergeMethod>("squash");
  const buttonClass = "bg-success text-success-foreground hover:bg-success/90";
  return (
    <div className="flex items-center">
      <Button
        disabled={disabled}
        className={cn(buttonClass, "flex-1 rounded-r-none")}
        onClick={() => onMerge(method)}
      >
        <GitMerge />
        {mergeMethodLabels[method]}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon"
            disabled={disabled && !canAutoMerge}
            aria-label="Choose merge method"
            className={cn(buttonClass, "border-success-foreground/25 rounded-l-none border-l")}
          >
            <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          {(Object.keys(mergeMethodLabels) as MergeMethod[]).map((value) => (
            <DropdownMenuItem key={value} disabled={disabled} onSelect={() => setMethod(value)}>
              {mergeMethodLabels[value]}
            </DropdownMenuItem>
          ))}
          {canAutoMerge ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onAutoMerge}>Enable auto-merge…</DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function ClosedFooter({ pullRequest }: { pullRequest: PullRequestOverviewView }) {
  if (pullRequest.state === "merged") {
    return (
      <p className="flex items-center gap-2 text-[13px]">
        <GitMerge className="size-4 text-[oklch(0.55_0.18_300)]" />
        Merged into <span className="font-mono text-xs">{pullRequest.baseRef}</span>
      </p>
    );
  }
  return (
    <p className="flex items-center gap-2 text-[13px]">
      <GitPullRequestClosed className="text-destructive size-4" />
      Closed without merging
    </p>
  );
}

/** Reviews, checks, and conflicts in one card, ending in the merge action. */
export function PullRequestMergeBox({
  pullRequest,
  reviewers,
  checksOpen,
  onChecksOpenChange,
  canAutoMerge,
  onMerge,
  onAutoMerge,
  onMarkReady,
  ref,
}: {
  pullRequest: PullRequestOverviewView;
  reviewers: ReactNode;
  checksOpen: boolean;
  onChecksOpenChange: (open: boolean) => void;
  canAutoMerge: boolean;
  onMerge: (method: MergeMethod) => void;
  onAutoMerge: () => void;
  onMarkReady?: () => void;
  ref?: Ref<HTMLElement>;
}) {
  const [reviewsOpen, setReviewsOpen] = useState(true);
  const reviews = summarizeReviews(pullRequest.reviewers, pullRequest.requiredApprovals);
  const checks = summarizeChecks(pullRequest.checks);
  const merge = summarizeMergeability(pullRequest.mergeability, pullRequest.baseRef);
  const finished = pullRequest.state === "merged" || pullRequest.state === "closed";

  return (
    <section
      ref={ref}
      aria-label="Merge status"
      className="bg-surface-0 scroll-mt-4 overflow-hidden rounded-lg border"
    >
      <StatusRow summary={reviews} title="Reviews" open={reviewsOpen} onOpenChange={setReviewsOpen}>
        {reviewers}
      </StatusRow>
      {checks && pullRequest.checks ? (
        <StatusRow
          summary={checks}
          title="Checks"
          open={checksOpen}
          onOpenChange={onChecksOpenChange}
        >
          <PullRequestCheckList checks={pullRequest.checks} />
        </StatusRow>
      ) : null}
      {finished ? null : <StatusRow summary={merge} title="Merge" />}
      <div className="border-border/70 bg-surface-1/50 border-t p-3">
        {finished ? (
          <ClosedFooter pullRequest={pullRequest} />
        ) : pullRequest.state === "draft" ? (
          <div className="flex items-center gap-2">
            <GitPullRequestDraft className="text-muted-foreground size-4" />
            <span className="text-muted-foreground flex-1 text-[13px]">Draft pull request</span>
            {onMarkReady ? (
              <Button size="sm" variant="outline" onClick={onMarkReady}>
                Ready for review
              </Button>
            ) : null}
          </div>
        ) : (
          <PullRequestMergeButton
            disabled={pullRequest.mergeability === "conflicting"}
            canAutoMerge={canAutoMerge}
            onMerge={onMerge}
            onAutoMerge={onAutoMerge}
          />
        )}
      </div>
    </section>
  );
}
