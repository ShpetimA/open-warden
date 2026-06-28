import { useState } from "react";
import { ExternalLink, ListTree, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { desktop } from "@/platform/desktop";
import { errorMessageFrom } from "@/features/source-control/shared-utils/errorMessage";
import { setRepoActionError } from "@/features/source-control/sourceControlSlice";

export function RepoActionErrorDialog() {
  const dispatch = useAppDispatch();
  const repoActionError = useAppSelector((state) => state.sourceControl.repoActionError);
  const [showOutput, setShowOutput] = useState(false);

  if (!repoActionError) return null;

  const closeDialog = () => {
    dispatch(setRepoActionError(null));
    setShowOutput(false);
  };

  const openGitLog = async () => {
    if (!repoActionError.logPath) return;

    try {
      await desktop.openPath(repoActionError.logPath);
    } catch (error) {
      toast.error("Failed to open Git log", {
        description: errorMessageFrom(error, "Unknown error"),
      });
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) closeDialog();
      }}
    >
      <DialogContent
        className="w-[min(760px,calc(100vw-2rem))] max-w-none gap-0 overflow-hidden p-0"
        showCloseButton={false}
      >
        <div className="flex gap-4 p-5 pb-4">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-500 shadow-[inset_0_0_0_1px_rgba(245,158,11,0.22)]">
            <TriangleAlert className="size-6" />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <DialogTitle className="break-words text-base leading-6 text-balance">
              {repoActionError.title}
            </DialogTitle>
            <DialogDescription className="mt-2 break-words text-pretty leading-5">
              {repoActionError.message}
            </DialogDescription>
          </div>
        </div>

        {showOutput ? (
          <div className="border-border/70 min-w-0 border-t bg-black/95 px-5 py-4 text-white">
            <pre className="max-h-[38vh] max-w-full overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-white/90">
              {repoActionError.details}
            </pre>
          </div>
        ) : null}

        <div className="bg-muted/30 flex flex-col-reverse gap-2 border-t p-4 sm:flex-row sm:flex-wrap sm:justify-end">
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setShowOutput(!showOutput);
            }}
          >
            <ListTree className="size-4" />
            {showOutput ? "Hide Command Output" : "Show Command Output"}
          </Button>
          {repoActionError.logPath ? (
            <Button
              type="button"
              onClick={() => {
                void openGitLog();
              }}
            >
              <ExternalLink className="size-4" />
              Open Git Log
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
