import { AlertCircle, CheckCircle2, CircleDashed, ExternalLink, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { useGetPullRequestChecksQuery } from "@/features/hosted-repos/api";
import type { PullRequestCheck, PullRequestChecksResult } from "@/platform/desktop";

function CheckIcon({ state }: { state: PullRequestCheck["state"] }) {
  if (state === "passed") return <CheckCircle2 className="size-4 text-success" />;
  if (state === "failed") return <AlertCircle className="size-4 text-destructive" />;
  return <CircleDashed className="size-4 text-warning" />;
}

function checksHeadline(result: PullRequestChecksResult) {
  if (!result.complete) return "Some checks could not be listed";
  if (result.checks.length === 0) return "No checks reported";
  const failures = result.checks.filter((check) => check.state === "failed").length;
  const pending = result.checks.filter((check) => check.state === "pending").length;
  if (failures > 0)
    return `${failures} ${failures === 1 ? "check needs" : "checks need"} attention`;
  if (pending > 0) return `${pending} ${pending === 1 ? "check is" : "checks are"} running`;
  return "All reported checks passed";
}

function mergeabilityCopy(result: PullRequestChecksResult) {
  if (result.mergeability === "conflicting") {
    return "The provider reports merge conflicts. Resolve them before merging.";
  }
  if (result.mergeability === "mergeable") {
    return "No merge conflicts reported. Reviews, branch rules, or permissions may still block merging.";
  }
  return "Mergeability is not available yet. The provider makes the final decision when you merge.";
}

export function PullRequestChecksPanel({
  repoPath,
  pullRequestNumber,
}: {
  repoPath: string;
  pullRequestNumber: number;
}) {
  const { data, error, isLoading, isFetching, refetch } = useGetPullRequestChecksQuery(
    { repoPath, pullRequestNumber },
    {
      pollingInterval: 60_000,
      refetchOnFocus: true,
      selectFromResult: ({ data, error, isLoading, isFetching }) => ({
        data,
        error,
        isLoading,
        isFetching,
      }),
    },
  );
  const errorMessage = error && "message" in error ? String(error.message) : null;
  const passed = data?.checks.filter((check) => check.state === "passed").length ?? 0;
  const tone = !data
    ? "neutral"
    : data.checks.some((check) => check.state === "failed")
      ? "danger"
      : !data.complete || data.checks.some((check) => check.state === "pending")
        ? "warning"
        : data.checks.length === 0
          ? "neutral"
          : "success";

  return (
    <div className="mx-auto flex w-full max-w-[920px] flex-col gap-5 px-6 py-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">Checks</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Status for the pull request head commit.
          </p>
        </div>
        <Button variant="outline" size="sm" disabled={isFetching} onClick={() => void refetch()}>
          <RefreshCw className={isFetching ? "size-4 animate-spin" : "size-4"} />
          Refresh
        </Button>
      </div>

      {isLoading ? <p className="text-muted-foreground text-sm">Loading checks…</p> : null}
      {errorMessage ? (
        <div className="border-destructive-border bg-destructive-surface text-destructive rounded-lg border p-4 text-sm">
          Could not load checks: {errorMessage}
        </div>
      ) : null}

      {data ? (
        <>
          <section className="rounded-lg border bg-surface-0 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">{checksHeadline(data)}</h2>
                <p className="text-muted-foreground mt-1 text-sm">
                  {data.checks.length > 0
                    ? `${passed} of ${data.checks.length} reported checks passed`
                    : data.complete
                      ? "No check results for this commit"
                      : "Check results could not be read"}{" "}
                  · {data.headSha.slice(0, 8)}
                </p>
              </div>
              <StatusBadge tone={tone}>
                {data.checks.length === 0
                  ? data.complete
                    ? "No checks"
                    : "Unavailable"
                  : `${passed}/${data.checks.length} passed`}
              </StatusBadge>
            </div>
          </section>

          <section className="rounded-lg border bg-surface-0 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-semibold">Merge readiness</h2>
              <StatusBadge
                tone={
                  data.mergeability === "conflicting"
                    ? "danger"
                    : data.mergeability === "mergeable"
                      ? "success"
                      : "neutral"
                }
              >
                {data.mergeability === "conflicting"
                  ? "Conflicts"
                  : data.mergeability === "mergeable"
                    ? "No conflicts"
                    : "Unknown"}
              </StatusBadge>
            </div>
            <p className="text-muted-foreground mt-2 text-sm">{mergeabilityCopy(data)}</p>
          </section>

          {data.checks.length > 0 ? (
            <section className="overflow-hidden rounded-lg border bg-surface-0">
              <h2 className="border-b px-4 py-3 text-sm font-semibold">Reported checks</h2>
              <ul className="divide-y">
                {data.checks.map((check) => (
                  <li key={check.id} className="flex min-w-0 items-center gap-3 px-4 py-3">
                    <CheckIcon state={check.state} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{check.name}</div>
                      {check.description ? (
                        <div className="text-muted-foreground truncate text-xs">
                          {check.description}
                        </div>
                      ) : null}
                    </div>
                    <span className="text-muted-foreground text-xs capitalize">{check.state}</span>
                    {check.url ? (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Open ${check.name} on provider`}
                        onClick={() => {
                          if (check.url) window.open(check.url, "_blank", "noopener,noreferrer");
                        }}
                      >
                        <ExternalLink className="size-4" />
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
