import { useState } from "react";
import { toast } from "sonner";
import { UserPlus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  useGetPullRequestReviewOverviewQuery,
  useSetPullRequestReviewerMutation,
} from "@/features/hosted-repos/api";

export function PullRequestReviewersSection({
  repoPath,
  pullRequestNumber,
  open,
}: {
  repoPath: string;
  pullRequestNumber: number;
  open: boolean;
}) {
  const [reviewer, setReviewer] = useState("");
  const [localError, setLocalError] = useState("");
  const [updateReviewer, { isLoading: saving }] = useSetPullRequestReviewerMutation();
  const { overview, loading, queryError } = useGetPullRequestReviewOverviewQuery(
    { repoPath, pullRequestNumber },
    {
      selectFromResult: ({ data, isLoading, error }) => ({
        overview: data,
        loading: isLoading,
        queryError: error && "message" in error ? String(error.message) : "",
      }),
    },
  );

  async function changeReviewer(value: string, requested: boolean) {
    setLocalError("");
    try {
      await updateReviewer({ repoPath, pullRequestNumber, reviewer: value, requested }).unwrap();
      if (requested) setReviewer("");
      toast.success(requested ? "Reviewer requested" : "Reviewer removed");
    } catch (error) {
      setLocalError(
        error && typeof error === "object" && "message" in error
          ? String(error.message)
          : "Could not update reviewers.",
      );
    }
  }

  const canManage = open && overview?.canManageReviewers !== false;
  const approvals = overview?.reviewers.filter((item) => item.state === "approved").length ?? 0;

  return (
    <section className="rounded-lg border bg-surface-0 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase">
          Reviewers
        </h2>
        {overview ? (
          <span className="text-muted-foreground text-xs">{approvals} approved</span>
        ) : null}
      </div>
      {loading ? <p className="text-muted-foreground mt-3 text-xs">Loading reviewers…</p> : null}
      {queryError ? (
        <p role="alert" className="text-destructive mt-3 text-xs">
          {queryError}
        </p>
      ) : null}
      {overview ? (
        <div className="mt-3 space-y-2">
          {overview.reviewers.length === 0 ? (
            <p className="text-muted-foreground text-xs">No reviewers yet.</p>
          ) : (
            overview.reviewers.map((item) => (
              <div key={item.id} className="flex min-w-0 items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm">
                  {item.displayName || item.login}
                </span>
                <StatusBadge
                  size="sm"
                  tone={
                    item.state === "approved"
                      ? "success"
                      : item.state === "changes-requested"
                        ? "warning"
                        : "neutral"
                  }
                >
                  {item.state === "changes-requested" ? "Changes" : item.state}
                </StatusBadge>
                {canManage && item.state === "requested" ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${item.login} as reviewer`}
                    disabled={saving}
                    onClick={() => void changeReviewer(item.id, false)}
                  >
                    <X className="size-3.5" />
                  </Button>
                ) : null}
              </div>
            ))
          )}
        </div>
      ) : null}
      {canManage ? (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (reviewer.trim()) void changeReviewer(reviewer.trim(), true);
          }}
        >
          <Input
            aria-label="Reviewer username"
            placeholder="Reviewer username"
            value={reviewer}
            onChange={(event) => setReviewer(event.target.value)}
            className="h-8 min-w-0 flex-1 text-xs"
          />
          <Button
            size="icon-sm"
            aria-label="Request reviewer"
            disabled={saving || !reviewer.trim()}
          >
            <UserPlus className="size-4" />
          </Button>
        </form>
      ) : null}
      {overview?.canManageReviewers === false ? (
        <p className="text-muted-foreground mt-3 text-xs">
          Your account cannot change reviewers for this repository.
        </p>
      ) : null}
      {localError ? (
        <p role="alert" className="text-destructive mt-2 text-xs">
          {localError}
        </p>
      ) : null}
    </section>
  );
}
