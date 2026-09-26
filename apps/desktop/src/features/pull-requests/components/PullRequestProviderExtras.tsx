import { useState } from "react";
import { toast } from "sonner";
import { Check, RotateCcw, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAppDispatch } from "@/app/hooks";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useGetPullRequestExtrasQuery,
  useRerunPullRequestWorkflowMutation,
  useCancelPullRequestWorkflowMutation,
  useResolveHostedRepoQuery,
  useSetPullRequestLabelsMutation,
  useRunPullRequestLifecycleMutation,
} from "@/features/hosted-repos/api";
import { openPullRequestWorkspace } from "@/features/workspaces/actions";
import type { PullRequestDetail } from "@/platform/desktop";

export function PullRequestProviderExtras({
  repoPath,
  detail,
}: {
  repoPath: string;
  detail: PullRequestDetail;
}) {
  const dispatch = useAppDispatch();
  const input = { repoPath, pullRequestNumber: detail.number };
  const { data, error, isLoading, refetch } = useGetPullRequestExtrasQuery(input, {
    refetchOnFocus: true,
    selectFromResult: ({ currentData, error, isLoading }) => ({
      data: currentData,
      error,
      isLoading,
    }),
  });
  const { hostedRepo } = useResolveHostedRepoQuery(repoPath, {
    selectFromResult: ({ data }) => ({ hostedRepo: data ?? null }),
  });
  const [setLabels, labelMutation] = useSetPullRequestLabelsMutation();
  const [editPullRequest, editMutation] = useRunPullRequestLifecycleMutation();
  const [rerun, rerunMutation] = useRerunPullRequestWorkflowMutation();
  const [cancel, cancelMutation] = useCancelPullRequestWorkflowMutation();
  const [editing, setEditing] = useState(false);
  const [editingParent, setEditingParent] = useState(false);
  const [chosenParent, setChosenParent] = useState<number | null>(null);
  const [chosenLabels, setChosenLabels] = useState<string[]>([]);
  const [confirmRunId, setConfirmRunId] = useState<number | null>(null);
  const [confirmAction, setConfirmAction] = useState<"rerun" | "cancel">("rerun");
  const availableLabels = data?.availableLabels ?? [];
  const selectedRun = data?.workflowRuns.find((run) => run.id === confirmRunId);

  if (detail.providerId !== "github") return null;

  async function saveLabels() {
    try {
      await setLabels({
        ...input,
        labels: chosenLabels,
        expectedLabels: detail.labels.map((label) => label.name),
        expectedHeadSha: detail.headSha,
      }).unwrap();
      setEditing(false);
      toast.success("Labels updated");
    } catch (cause) {
      toast.error(
        cause && typeof cause === "object" && "message" in cause
          ? String(cause.message)
          : "Could not update labels.",
      );
    }
  }

  async function updateWorkflow() {
    if (!selectedRun) return;
    try {
      await (confirmAction === "rerun" ? rerun : cancel)({
        ...input,
        runId: selectedRun.id,
        expectedHeadSha: detail.headSha,
      }).unwrap();
      setConfirmRunId(null);
      toast.success(
        confirmAction === "rerun" ? "Workflow rerun requested" : "Workflow cancellation requested",
      );
    } catch (cause) {
      toast.error(
        cause && typeof cause === "object" && "message" in cause
          ? String(cause.message)
          : "Could not update workflow.",
      );
    }
  }

  async function saveParent() {
    const body = detail.body
      .split("\n")
      .filter((line) => !/^Depends on #\d+\s*$/i.test(line.trim()))
      .join("\n")
      .trim();
    const nextBody = chosenParent
      ? `${body}${body ? "\n\n" : ""}Depends on #${chosenParent}`
      : body;
    try {
      await editPullRequest({
        ...input,
        action: "edit",
        title: detail.title,
        body: nextBody,
        expectedTitle: detail.title,
        expectedBody: detail.body,
        expectedHeadSha: detail.headSha,
      }).unwrap();
      setEditingParent(false);
      toast.success("Stack parent updated");
    } catch (cause) {
      toast.error(
        cause && typeof cause === "object" && "message" in cause
          ? String(cause.message)
          : "Could not update stack parent.",
      );
    }
  }

  return (
    <section className="rounded-lg border bg-surface-0 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase">
          GitHub extras
        </h2>
        <Button variant="ghost" size="sm" disabled={isLoading} onClick={() => void refetch()}>
          Refresh
        </Button>
      </div>
      {isLoading ? (
        <p className="text-muted-foreground mt-3 text-xs">Loading provider details…</p>
      ) : null}
      {error ? (
        <p role="alert" className="text-destructive mt-3 text-xs">
          Provider details could not be loaded.
        </p>
      ) : null}
      {data ? (
        <div className="mt-3 space-y-4 text-sm">
          <div>
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-medium">Labels</h3>
              <Button
                variant="ghost"
                size="sm"
                disabled={!data.labelsAvailable}
                onClick={() => {
                  setChosenLabels(detail.labels.map((label) => label.name));
                  setEditing(true);
                }}
              >
                Edit
              </Button>
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {detail.labels.length ? (
                detail.labels.map((label) => (
                  <span
                    key={label.name}
                    className="bg-surface-toolbar rounded border px-1.5 py-0.5 text-xs"
                  >
                    {label.name}
                  </span>
                ))
              ) : (
                <span className="text-muted-foreground text-xs">None</span>
              )}
            </div>
            {!data.labelsAvailable ? (
              <p className="text-muted-foreground mt-1 text-xs">
                Label editing is unavailable with the current provider response.
              </p>
            ) : null}
          </div>
          <div>
            <h3 className="text-xs font-medium">Workflows</h3>
            {!data.workflowsAvailable ? (
              <p className="text-muted-foreground mt-1 text-xs">
                Workflow runs are unavailable with the current connection.
              </p>
            ) : data.workflowRuns.length ? (
              <ul className="mt-1 space-y-1">
                {data.workflowRuns.map((run) => (
                  <li key={run.id} className="flex min-w-0 items-center gap-2">
                    <a
                      className="min-w-0 flex-1 truncate hover:underline"
                      href={run.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {run.name}
                    </a>
                    <span className="text-muted-foreground shrink-0 text-xs">
                      {run.conclusion ?? run.status}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`${run.status === "completed" ? "Rerun" : "Cancel"} ${run.name}`}
                      title={`${run.status === "completed" ? "Rerun" : "Cancel"} ${run.name}`}
                      disabled={rerunMutation.isLoading || cancelMutation.isLoading}
                      onClick={() => {
                        setConfirmAction(run.status === "completed" ? "rerun" : "cancel");
                        setConfirmRunId(run.id);
                      }}
                    >
                      {run.status === "completed" ? <RotateCcw /> : <XCircle />}
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground mt-1 text-xs">No runs for this commit.</p>
            )}
          </div>
          <div>
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-medium">Stack</h3>
              <Button
                variant="ghost"
                size="sm"
                disabled={!data.stackAvailable || detail.state !== "open"}
                onClick={() => {
                  const match = /^Depends on #(\d+)\s*$/im.exec(detail.body);
                  setChosenParent(match ? Number(match[1]) : null);
                  setEditingParent(true);
                }}
              >
                Set parent
              </Button>
            </div>
            {!data.stackAvailable ? (
              <p className="text-muted-foreground mt-1 text-xs">
                Stack relationships could not be read.
              </p>
            ) : data.stack.length ? (
              <ul className="mt-1 space-y-1">
                {data.stack.map((link) => (
                  <li key={link.number}>
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto max-w-full justify-start overflow-hidden p-0 text-left"
                      onClick={() => {
                        if (!hostedRepo) return;
                        void dispatch(
                          openPullRequestWorkspace({
                            providerId: hostedRepo.providerId,
                            owner: hostedRepo.owner,
                            repo: hostedRepo.repo,
                            pullRequestNumber: link.number,
                            repoPath,
                            title: link.title,
                          }),
                        );
                      }}
                    >
                      {link.relationship === "parent" ? "Parent" : "Child"} #{link.number} ·{" "}
                      {link.title}
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground mt-1 text-xs">No related open PRs found.</p>
            )}
          </div>
          {data.truncated ? (
            <p className="text-muted-foreground text-xs">
              Showing the first page of provider results.
            </p>
          ) : null}
        </div>
      ) : null}
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit labels</DialogTitle>
            <DialogDescription>Choose labels for this pull request.</DialogDescription>
          </DialogHeader>
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {availableLabels.map((label) => (
              <label
                key={label.name}
                className="flex min-h-10 items-center gap-3 rounded px-2 hover:bg-surface-toolbar"
              >
                <Checkbox
                  checked={chosenLabels.includes(label.name)}
                  onCheckedChange={(checked) =>
                    setChosenLabels((current) =>
                      checked
                        ? [...current, label.name]
                        : current.filter((item) => item !== label.name),
                    )
                  }
                />
                <span className="min-w-0">
                  <span className="block text-sm">{label.name}</span>
                  {label.description ? (
                    <span className="text-muted-foreground block truncate text-xs">
                      {label.description}
                    </span>
                  ) : null}
                </span>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button disabled={labelMutation.isLoading} onClick={() => void saveLabels()}>
              <Check className="size-4" /> Save labels
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={editingParent} onOpenChange={setEditingParent}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set stack parent</DialogTitle>
            <DialogDescription>
              Link an open pull request in this project. The link is stored in the description.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-64 space-y-1 overflow-y-auto">
            <Button
              variant={chosenParent === null ? "secondary" : "ghost"}
              className="w-full justify-start"
              onClick={() => setChosenParent(null)}
            >
              No parent
            </Button>
            {(data?.stackCandidates ?? []).map((candidate) => (
              <Button
                key={candidate.number}
                variant={chosenParent === candidate.number ? "secondary" : "ghost"}
                className="w-full justify-start overflow-hidden"
                onClick={() => setChosenParent(candidate.number)}
              >
                #{candidate.number} · <span className="truncate">{candidate.title}</span>
              </Button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingParent(false)}>
              Cancel
            </Button>
            <Button disabled={editMutation.isLoading} onClick={() => void saveParent()}>
              Save parent
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={confirmRunId !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmRunId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmAction === "rerun" ? "Rerun workflow?" : "Cancel workflow?"}
            </DialogTitle>
            <DialogDescription>
              {selectedRun?.name ?? "This run"}{" "}
              {confirmAction === "rerun"
                ? "will run again for the current PR commit."
                : "will be asked to stop."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRunId(null)}>
              Back
            </Button>
            <Button
              disabled={rerunMutation.isLoading || cancelMutation.isLoading || !selectedRun}
              onClick={() => void updateWorkflow()}
            >
              {confirmAction === "rerun" ? "Rerun" : "Cancel run"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
