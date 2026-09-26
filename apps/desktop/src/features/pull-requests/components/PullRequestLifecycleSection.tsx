import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  useGetPullRequestChecksQuery,
  useMergePullRequestMutation,
  useRunPullRequestLifecycleMutation,
} from "@/features/hosted-repos/api";
import type { PullRequestDetail, PullRequestLifecycleInput } from "@/platform/desktop";

type Action = PullRequestLifecycleInput["action"] | "merge";

const actionLabels: Record<Action, string> = {
  edit: "Edit details",
  close: "Close pull request",
  reopen: "Reopen pull request",
  draft: "Convert to draft",
  ready: "Mark ready for review",
  "update-branch": "Update branch",
  "auto-merge": "Enable auto-merge",
  revert: "Revert pull request",
  merge: "Merge pull request",
};

function availableActions(detail: PullRequestDetail): Action[] {
  if (detail.state === "merged")
    return detail.providerId === "github" ? ["edit", "revert"] : ["edit"];
  if (detail.state === "closed")
    return detail.providerId === "github" ? ["edit", "reopen"] : ["edit"];
  return [
    "edit",
    ...(detail.providerId === "github"
      ? ([detail.isDraft ? "ready" : "draft", "update-branch"] as Action[])
      : []),
    ...(!detail.isDraft
      ? ([
          "merge",
          ...(detail.providerId === "github" ? (["auto-merge"] as Action[]) : []),
        ] as Action[])
      : []),
    "close",
  ];
}

export function PullRequestLifecycleSection({
  repoPath,
  detail,
}: {
  repoPath: string;
  detail: PullRequestDetail;
}) {
  const [action, setAction] = useState<Action | null>(null);
  const [title, setTitle] = useState(detail.title);
  const [body, setBody] = useState(detail.body);
  const [method, setMethod] = useState<"merge" | "squash" | "rebase">("merge");
  const [error, setError] = useState("");
  const [runLifecycle, { isLoading: changing }] = useRunPullRequestLifecycleMutation();
  const [mergePullRequest, { isLoading: merging }] = useMergePullRequestMutation();
  const busy = changing || merging;
  const { checks } = useGetPullRequestChecksQuery(
    { repoPath, pullRequestNumber: detail.number },
    {
      selectFromResult: ({ data }) => ({ checks: data?.headSha === detail.headSha ? data : null }),
    },
  );
  const hasConflicts = checks?.mergeability === "conflicting";

  function choose(next: Action) {
    setTitle(detail.title);
    setBody(detail.body);
    setError("");
    setAction(next);
  }

  async function confirm() {
    if (!action || busy) return;
    setError("");
    try {
      if (action === "merge") {
        const status = await mergePullRequest({
          repoPath,
          pullRequestNumber: detail.number,
          expectedHeadSha: detail.headSha,
          method,
        }).unwrap();
        toast.success(status === "queued" ? "Merge queued" : "Pull request merged");
      } else {
        const common = {
          repoPath,
          pullRequestNumber: detail.number,
          expectedHeadSha: detail.headSha,
        };
        const input: PullRequestLifecycleInput =
          action === "edit"
            ? { ...common, action, title, body }
            : action === "auto-merge"
              ? { ...common, action, method }
              : { ...common, action };
        const result = await runLifecycle(input).unwrap();
        toast.success(
          action === "revert" ? "Revert pull request created" : `${actionLabels[action]} complete`,
        );
        if (result.createdPullRequestUrl)
          window.open(result.createdPullRequestUrl, "_blank", "noopener,noreferrer");
      }
      setAction(null);
    } catch (cause) {
      setError(
        cause && typeof cause === "object" && "message" in cause
          ? String(cause.message)
          : "The pull request could not be changed.",
      );
    }
  }

  return (
    <section className="rounded-lg border bg-surface-0 p-4">
      <h2 className="text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase">
        Pull request actions
      </h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {availableActions(detail).map((item) => (
          <Button
            key={item}
            variant={item === "merge" ? "default" : "outline"}
            size="sm"
            className="text-xs"
            onClick={() => choose(item)}
          >
            {actionLabels[item]}
          </Button>
        ))}
      </div>
      <Dialog
        open={action !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setAction(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{action ? actionLabels[action] : "Pull request action"}</DialogTitle>
            <DialogDescription>
              #{detail.number} · {detail.headRef} → {detail.baseRef} · head{" "}
              {detail.headSha.slice(0, 8)}
            </DialogDescription>
          </DialogHeader>
          {action === "edit" ? (
            <div className="space-y-3">
              <label className="block text-sm font-medium" htmlFor="pr-lifecycle-title">
                Title
              </label>
              <Input
                id="pr-lifecycle-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
              <label className="block text-sm font-medium" htmlFor="pr-lifecycle-body">
                Description
              </label>
              <Textarea
                id="pr-lifecycle-body"
                className="min-h-28"
                value={body}
                onChange={(event) => setBody(event.target.value)}
              />
            </div>
          ) : action === "merge" || action === "auto-merge" ? (
            <div className="space-y-2">
              <p className="text-sm">Choose how the commits will be combined.</p>
              {hasConflicts ? (
                <p role="alert" className="text-destructive text-sm">
                  The provider reports merge conflicts. Resolve them on the source branch, then
                  refresh the pull request.
                </p>
              ) : null}
              {checks?.checks.some((check) => check.state === "failed") ? (
                <p className="text-amber-600 text-sm">
                  Some checks failed. Branch rules may prevent merging until they pass.
                </p>
              ) : null}
              <div className="grid grid-cols-3 gap-2" role="group" aria-label="Merge method">
                {(["merge", "squash", "rebase"] as const).map((value) => (
                  <Button
                    key={value}
                    size="sm"
                    variant={method === value ? "default" : "outline"}
                    onClick={() => setMethod(value)}
                    className="capitalize"
                  >
                    {value}
                  </Button>
                ))}
              </div>
            </div>
          ) : action ? (
            <p className="text-sm">
              {action === "close"
                ? "The pull request will be closed without merging."
                : action === "revert"
                  ? "GitHub will create a new pull request that reverses this merge."
                  : action === "update-branch"
                    ? "The source branch will be updated with changes from the target branch."
                    : `Confirm ${actionLabels[action].toLowerCase()} for this pull request.`}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setAction(null)}>
              Cancel
            </Button>
            <Button
              disabled={
                busy ||
                (action === "edit" && !title.trim()) ||
                ((action === "merge" || action === "auto-merge") && hasConflicts)
              }
              onClick={() => void confirm()}
            >
              {busy
                ? "Working…"
                : action
                  ? `Confirm ${actionLabels[action].toLowerCase()}`
                  : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
