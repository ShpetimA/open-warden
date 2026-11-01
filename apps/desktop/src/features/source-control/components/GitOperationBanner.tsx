import { commandFailureDismissed, gitCommandFailureTitle } from "../gitCommandFeedbackSlice";
import { refreshRepositoryStatus } from "../actions";
import { hasRepositoryEventBridge } from "@/features/source-control/repositoryFreshness";
import { ActionError } from "@/components/ui/error-state";
import { toast } from "sonner";
import { useNavigate } from "react-router";
import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { Button } from "@/components/ui/button";
import { desktop } from "@/platform/desktop";
import { useGetGitRepositoryStateQuery, useRunGitCommandMutation } from "../gitOperationsApi";
import type { GitOperation } from "@/platform/desktop/gitOperations";

export function GitOperationBanner() {
  const dispatch = useAppDispatch();
  const repoPath = useAppSelector((state) => state.sourceControl.activeRepo);
  const feedback = useAppSelector((state) => state.gitCommandFeedback.byRepository[repoPath]);
  const { operation, conflictCount, refreshing, refreshError } = useGetGitRepositoryStateQuery(
    repoPath,
    {
      skip: !repoPath,
      pollingInterval: hasRepositoryEventBridge() ? 0 : 15000,
      selectFromResult: ({ currentData, isFetching, error }) => ({
        refreshing: isFetching,
        refreshError: error,
        operation: currentData?.operation ?? null,
        conflictCount: currentData?.conflicts.length ?? 0,
      }),
    },
  );
  const navigate = useNavigate();
  const [execute, mutation] = useRunGitCommandMutation({ fixedCacheKey: repoPath });

  if (!repoPath) return null;

  return (
    <>
      {operation || conflictCount ? (
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
                  if (!confirmed.ok) {
                    toast.error(confirmed.error.message);
                    return;
                  }
                  if (confirmed.value)
                    return execute({ repoPath, command: { kind: "skip", operation } });
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
                  if (!confirmed.ok) {
                    toast.error(confirmed.error.message);
                    return;
                  }
                  if (confirmed.value)
                    return execute({ repoPath, command: { kind: "abort", operation } });
                });
          }}
        />
      ) : null}
      {feedback?.error ? (
        <div className="shrink-0 space-y-2 border-b p-2">
          <ActionError
            title={gitCommandFailureTitle(feedback.kind)}
            error={feedback.error}
            busy={refreshing}
            recovery={{
              label: "Refresh status",
              onAction: () => void dispatch(refreshRepositoryStatus(repoPath)),
            }}
            onDismiss={() =>
              dispatch(commandFailureDismissed({ repoPath, requestId: feedback.requestId }))
            }
          />
          {refreshError ? (
            <ActionError title="Couldn’t refresh repository status" error={refreshError} />
          ) : null}
        </div>
      ) : null}
    </>
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
}: {
  operation: GitOperation | null;
  conflictCount: number;
  busy: boolean;
  onResolve: () => void;
  onContinue: () => void;
  onAbort: () => void;
  onSkip?: () => void;
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
    </section>
  );
}
