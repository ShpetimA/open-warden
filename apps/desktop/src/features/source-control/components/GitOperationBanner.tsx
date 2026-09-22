import { useNavigate } from "react-router";
import { useAppSelector } from "@/app/hooks";
import { Button } from "@/components/ui/button";
import { desktop } from "@/platform/desktop";
import { useGetGitRepositoryStateQuery, useRunGitCommandMutation } from "../gitOperationsApi";
import type { GitOperation } from "@/platform/desktop/gitOperations";

export function GitOperationBanner() {
  const repoPath = useAppSelector((state) => state.sourceControl.activeRepo);
  const { operation, conflictCount } = useGetGitRepositoryStateQuery(repoPath, {
    skip: !repoPath,
    pollingInterval: 15000,
    selectFromResult: ({ currentData }) => ({
      operation: currentData?.operation ?? null,
      conflictCount: currentData?.conflicts.length ?? 0,
    }),
  });
  const navigate = useNavigate();
  const [execute, mutation] = useRunGitCommandMutation({ fixedCacheKey: repoPath });
  if (!repoPath || (!operation && !conflictCount)) return null;
  return (
    <GitOperationStatus
      operation={operation}
      conflictCount={conflictCount}
      busy={mutation.isLoading}
      onResolve={() => navigate("/changes")}
      onContinue={() => {
        if (operation) void execute({ repoPath, command: { kind: "continue", operation } });
      }}
      onSkip={() => {
        if (operation && operation !== "merge")
          void desktop
            .confirm("Skip this commit and discard the changes from this step?", {
              title: "Skip commit",
              kind: "warning",
              okLabel: "Skip",
            })
            .then((confirmed) => {
              if (confirmed) return execute({ repoPath, command: { kind: "skip", operation } });
            });
      }}
      onAbort={() => {
        if (operation)
          void desktop
            .confirm(`Abort the current ${operation} and return to its starting state?`, {
              title: "Abort Git operation",
              kind: "warning",
              okLabel: "Abort",
            })
            .then((confirmed) => {
              if (confirmed) return execute({ repoPath, command: { kind: "abort", operation } });
            });
      }}
      error={mutation.error && "message" in mutation.error ? String(mutation.error.message) : ""}
    />
  );
}

export function GitOperationStatus({
  operation,
  conflictCount,
  busy,
  onResolve,
  onContinue,
  onAbort,
  onSkip,
  error,
}: {
  operation: GitOperation | null;
  conflictCount: number;
  busy: boolean;
  onResolve: () => void;
  onContinue: () => void;
  onAbort: () => void;
  onSkip?: () => void;
  error: string;
}) {
  return (
    <section
      aria-label="Git operation"
      className="border-border bg-surface-toolbar shrink-0 border-b px-3 py-2"
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-medium capitalize">
          {operation ? `${operation} in progress` : "Conflicts need attention"}
        </span>
        <span className="text-muted-foreground flex-1 tabular-nums">
          {conflictCount
            ? `${conflictCount} unresolved file(s). Resolve and stage each file.`
            : "Conflicts resolved. Ready to continue."}
        </span>
        <Button size="xs" variant="outline" onClick={onResolve}>
          Review changes
        </Button>
        {operation ? (
          <>
            <Button size="xs" disabled={busy || conflictCount > 0} onClick={onContinue}>
              {busy ? "Working…" : "Continue"}
            </Button>
            {operation !== "merge" && onSkip ? (
              <Button size="xs" variant="ghost" disabled={busy} onClick={onSkip}>
                Skip commit
              </Button>
            ) : null}
            <Button size="xs" variant="ghost" disabled={busy} onClick={onAbort}>
              Abort
            </Button>
          </>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-destructive mt-2 whitespace-pre-wrap text-xs">
          {error}
        </p>
      ) : null}
    </section>
  );
}
