import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ActionError } from "@/components/ui/error-state";
import { failureFromUnknown, type DesktopFailure } from "@/platform/desktop/failure";
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

export type MergeMethod = "merge" | "squash" | "rebase";
export type LifecycleAction = PullRequestLifecycleInput["action"] | "merge";
export type LifecycleRequest = { action: LifecycleAction; method?: MergeMethod };

export const lifecycleLabels: Record<LifecycleAction, string> = {
  edit: "Edit title and description",
  close: "Close pull request",
  reopen: "Reopen pull request",
  draft: "Convert to draft",
  ready: "Mark ready for review",
  "update-branch": "Update branch",
  "auto-merge": "Enable auto-merge",
  revert: "Revert pull request",
  merge: "Merge pull request",
};

export const mergeMethodLabels: Record<MergeMethod, string> = {
  merge: "Create a merge commit",
  squash: "Squash and merge",
  rebase: "Rebase and merge",
};

/** Actions the provider allows from this state; merge itself lives in the merge box. */
export function headerLifecycleActions(detail: PullRequestDetail): LifecycleAction[] {
  const github = detail.providerId === "github";
  if (detail.state === "merged") return github ? ["edit", "revert"] : ["edit"];
  if (detail.state === "closed") return github ? ["edit", "reopen"] : ["edit"];
  return [
    "edit",
    ...(github ? ([detail.isDraft ? "ready" : "draft", "update-branch"] as const) : []),
    "close",
  ];
}

function confirmationText(action: LifecycleAction) {
  if (action === "close") return "The pull request will be closed without merging.";
  if (action === "revert") return "GitHub will create a new pull request that reverses this merge.";
  if (action === "update-branch") {
    return "The source branch will be updated with changes from the target branch.";
  }
  return `Confirm ${lifecycleLabels[action].toLowerCase()} for this pull request.`;
}

function LifecycleForm({
  repoPath,
  detail,
  request,
  onDone,
}: {
  repoPath: string;
  detail: PullRequestDetail;
  request: LifecycleRequest;
  onDone: () => void;
}) {
  const { action } = request;
  const [title, setTitle] = useState(detail.title);
  const [body, setBody] = useState(detail.body);
  const [method, setMethod] = useState<MergeMethod>(request.method ?? "squash");
  const [error, setError] = useState<DesktopFailure | null>(null);
  const [runLifecycle, { isLoading: changing }] = useRunPullRequestLifecycleMutation();
  const [mergePullRequest, { isLoading: merging }] = useMergePullRequestMutation();
  const busy = changing || merging;
  const { hasConflicts, hasFailedChecks } = useGetPullRequestChecksQuery(
    { repoPath, pullRequestNumber: detail.number },
    {
      selectFromResult: ({ data }) => {
        const current = data?.headSha === detail.headSha ? data : null;
        return {
          hasConflicts: current?.mergeability === "conflicting",
          hasFailedChecks: Boolean(current?.checks.some((check) => check.state === "failed")),
        };
      },
    },
  );
  const merges = action === "merge" || action === "auto-merge";

  async function confirm() {
    if (busy) return;
    setError(null);
    const common = { repoPath, pullRequestNumber: detail.number, expectedHeadSha: detail.headSha };
    try {
      if (action === "merge") {
        const status = await mergePullRequest({ ...common, method }).unwrap();
        toast.success(status === "queued" ? "Merge queued" : "Pull request merged");
      } else {
        const input: PullRequestLifecycleInput =
          action === "edit"
            ? {
                ...common,
                action,
                title,
                body,
                expectedTitle: detail.title,
                expectedBody: detail.body,
              }
            : action === "auto-merge"
              ? { ...common, action, method }
              : { ...common, action };
        const result = await runLifecycle(input).unwrap();
        toast.success(
          action === "revert"
            ? "Revert pull request created"
            : `${lifecycleLabels[action]} complete`,
        );
        if (result.createdPullRequestUrl) {
          window.open(result.createdPullRequestUrl, "_blank", "noopener,noreferrer");
        }
      }
      onDone();
    } catch (cause) {
      setError(failureFromUnknown(cause, "pullRequestLifecycle"));
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {action === "merge" ? mergeMethodLabels[method] : lifecycleLabels[action]}
        </DialogTitle>
        <DialogDescription>
          #{detail.number} · {detail.headRef} → {detail.baseRef} · head {detail.headSha.slice(0, 8)}
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
            className="max-h-[50vh] min-h-40"
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
        </div>
      ) : merges ? (
        <div className="space-y-2">
          {hasConflicts ? (
            <p role="alert" className="text-destructive text-sm">
              The provider reports merge conflicts. Resolve them on the source branch, then refresh
              the pull request.
            </p>
          ) : null}
          {hasFailedChecks ? (
            <p className="text-warning text-sm">
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
      ) : (
        <p className="text-sm">{confirmationText(action)}</p>
      )}
      {error ? <ActionError title="Couldn’t update this pull request" error={error} /> : null}
      <DialogFooter>
        <Button variant="outline" disabled={busy} onClick={onDone}>
          Cancel
        </Button>
        <Button
          variant={action === "close" || action === "revert" ? "destructive" : "default"}
          disabled={busy || (action === "edit" && !title.trim()) || (merges && hasConflicts)}
          onClick={() => void confirm()}
        >
          {busy
            ? "Working…"
            : action === "merge"
              ? `Confirm ${mergeMethodLabels[method].toLowerCase()}`
              : action === "edit"
                ? "Save"
                : `Confirm ${lifecycleLabels[action].toLowerCase()}`}
        </Button>
      </DialogFooter>
    </>
  );
}

export function PullRequestLifecycleDialog({
  repoPath,
  detail,
  request,
  onClose,
}: {
  repoPath: string;
  detail: PullRequestDetail;
  request: LifecycleRequest | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={request !== null} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className={request?.action === "edit" ? "sm:max-w-2xl" : "sm:max-w-md"}>
        {request ? (
          <LifecycleForm
            key={`${request.action}-${request.method ?? ""}`}
            repoPath={repoPath}
            detail={detail}
            request={request}
            onDone={onClose}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
