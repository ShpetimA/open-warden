import { GitCommitHorizontal, History } from "lucide-react";

import { useGetPullRequestActivityQuery } from "@/features/hosted-repos/api";

export function PullRequestActivitySection({
  repoPath,
  pullRequestNumber,
}: {
  repoPath: string;
  pullRequestNumber: number;
}) {
  const { activity, loading, error } = useGetPullRequestActivityQuery(
    { repoPath, pullRequestNumber },
    {
      selectFromResult: ({ data, isLoading, error: queryError }) => ({
        activity: data,
        loading: isLoading,
        error: queryError && "message" in queryError ? String(queryError.message) : "",
      }),
    },
  );
  return (
    <section className="rounded-lg border bg-surface-0 p-5">
      <div className="flex items-center gap-2">
        <History className="text-muted-foreground size-4" />
        <h2 className="text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase">
          Commits & activity
        </h2>
        {activity ? (
          <span className="text-muted-foreground text-xs tabular-nums">
            {activity.items.length}
          </span>
        ) : null}
      </div>
      {loading ? <p className="text-muted-foreground mt-4 text-sm">Loading activity…</p> : null}
      {error ? (
        <p role="alert" className="text-destructive mt-4 text-sm">
          {error}
        </p>
      ) : null}
      {activity?.items.length === 0 ? (
        <p className="text-muted-foreground mt-4 text-sm">No activity yet.</p>
      ) : null}
      {activity?.items.length ? (
        <ol className="mt-4 divide-y divide-border/70">
          {activity.items.map((item) => (
            <li key={item.id} className="flex min-w-0 items-start gap-3 py-3 first:pt-0 last:pb-0">
              {item.kind === "commit" ? (
                <GitCommitHorizontal className="text-muted-foreground mt-0.5 size-4 shrink-0" />
              ) : (
                <span className="bg-primary mt-2 size-2 shrink-0 rounded-full" />
              )}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium break-words">
                  {item.url ? (
                    <a href={item.url} target="_blank" rel="noreferrer" className="hover:underline">
                      {item.label}
                    </a>
                  ) : (
                    item.label
                  )}
                </div>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {[
                    item.actor,
                    item.detail,
                    item.occurredAt ? new Date(item.occurredAt).toLocaleString() : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
            </li>
          ))}
        </ol>
      ) : null}
      {activity?.truncated ? (
        <p className="text-muted-foreground mt-4 text-xs">
          Showing the first 100 provider events and commits.
        </p>
      ) : null}
    </section>
  );
}
