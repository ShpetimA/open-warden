import { ActionError } from "@/components/ui/error-state";
import { useState, type ReactNode } from "react";
import { useAppSelector } from "@/app/hooks";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogHeader,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { HistoryCommit } from "../types";
import { useRunGitCommandMutation } from "../gitOperationsApi";

type Action = "revert" | "cherry-pick" | "create";
export function HistoryCommitMenu({
  commit,
  children,
}: {
  commit: HistoryCommit;
  children: ReactNode;
}) {
  const [action, setAction] = useState<Action | null>(null);
  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={() => setAction("revert")}>Revert commit…</ContextMenuItem>
          <ContextMenuItem onSelect={() => setAction("cherry-pick")}>
            Cherry-pick commit…
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => setAction("create")}>
            Create branch from commit…
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      {action ? (
        <HistoryActionDialog commit={commit} action={action} onClose={() => setAction(null)} />
      ) : null}
    </>
  );
}
function HistoryActionDialog({
  commit,
  action,
  onClose,
}: {
  commit: HistoryCommit;
  action: Action;
  onClose: () => void;
}) {
  const repoPath = useAppSelector((state) => state.sourceControl.activeRepo);
  const [execute, mutation] = useRunGitCommandMutation();
  const [branch, setBranch] = useState("");
  const label =
    action === "create"
      ? "Create & switch branch"
      : action === "revert"
        ? "Revert commit"
        : "Cherry-pick commit";
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>
            {commit.shortId} · {commit.summary}
          </DialogDescription>
        </DialogHeader>
        <p className="text-muted-foreground text-sm">
          {action === "revert"
            ? "Create a new commit that reverses this commit on the current branch."
            : action === "cherry-pick"
              ? "Apply this commit to the current branch. Conflicts can be resolved in Changes."
              : "Start a new branch at this commit and switch to it."}
        </p>
        {action === "create" ? (
          <label className="space-y-1 text-xs">
            Branch name
            <Input value={branch} onChange={(e) => setBranch(e.target.value)} autoFocus />
          </label>
        ) : null}
        <Button
          disabled={mutation.isLoading || (action === "create" && !branch.trim())}
          onClick={() => {
            void execute({
              repoPath,
              command:
                action === "create"
                  ? { kind: "create", branch, startPoint: commit.commitId }
                  : { kind: action, commit: commit.commitId },
            }).then((result) => {
              if ("data" in result) onClose();
            });
          }}
        >
          {mutation.isLoading ? "Working…" : label}
        </Button>
        {mutation.error ? (
          <ActionError
            title="Git operation failed"
            error={mutation.error}
            busy={mutation.isLoading}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
