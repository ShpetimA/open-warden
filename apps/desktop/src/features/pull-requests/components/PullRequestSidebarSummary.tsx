import type { PullRequestReviewSession } from "@/features/pull-requests/pullRequestsSlice";

export function PullRequestSidebarSummary({ review }: { review: PullRequestReviewSession }) {
  return (
    <section className="border-border border-b px-3 py-2.5">
      <div className="text-foreground/80 text-[11px] font-semibold tracking-[0.14em]">
        PULL REQUEST
      </div>
      <div className="mt-1.5 text-sm leading-snug font-semibold">
        #{review.pullRequestNumber} {review.title}
      </div>
      <div className="text-muted-foreground mt-1 text-xs">
        {review.owner}/{review.repo}
      </div>
      <div className="mt-2 inline-flex min-w-0 max-w-full items-center rounded-md border border-border/70 bg-surface px-1.5 py-1 font-mono text-[11px]">
        <span className="min-w-0 truncate">{review.baseRef}</span>
        <span className="px-1 text-muted-foreground">←</span>
        <span className="min-w-0 truncate">{review.headRef}</span>
      </div>
    </section>
  );
}
