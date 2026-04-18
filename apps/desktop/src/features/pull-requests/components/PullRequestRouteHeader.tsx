import type { PullRequestReviewSession } from "@/features/pull-requests/pullRequestsSlice";

export function PullRequestRouteHeader({ review }: { review: PullRequestReviewSession }) {
  return (
    <header className="border-border/70 bg-surface-toolbar border-b px-6 py-3">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="text-muted-foreground text-[10px] font-semibold tracking-[0.14em] uppercase">
          Pull Request
        </div>
        <div className="truncate text-base font-semibold">
          #{review.pullRequestNumber} {review.title}
        </div>
        <div className="text-muted-foreground flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span className="font-medium text-foreground">
            {review.owner}/{review.repo}
          </span>
          <span className="inline-flex min-w-0 max-w-full items-center rounded-md border border-border/70 bg-surface px-1.5 py-0.5 font-mono text-[11px]">
            <span className="min-w-0 truncate">{review.baseRef}</span>
            <span className="px-1 text-muted-foreground">←</span>
            <span className="min-w-0 truncate">{review.headRef}</span>
          </span>
        </div>
      </div>
    </header>
  );
}
