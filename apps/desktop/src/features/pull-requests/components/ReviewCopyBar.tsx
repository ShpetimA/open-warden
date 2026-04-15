import { useHotkey } from "@tanstack/react-hotkeys";
import { Copy, MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { isTypingTarget } from "@/features/source-control/utils";
import { toast } from "sonner";

function ReviewCommentsCopyToolbar({
  filePayload,
  allPayload,
  filePendingCommentCount = 0,
  totalPendingCommentCount = 0,
  canSubmitComments = false,
  isSubmittingComments = false,
  onSubmitAllComments,
}: {
  filePayload: string;
  allPayload: string;
  filePendingCommentCount?: number;
  totalPendingCommentCount?: number;
  canSubmitComments?: boolean;
  isSubmittingComments?: boolean;
  onSubmitAllComments?: () => void;
}) {
  const hasFileReviewComments = filePayload.length > 0;
  const hasAnyReviewComments = allPayload.length > 0;

  const copyReviewCommentsPayload = async (payload: string, successMessage: string) => {
    if (!payload) {
      return;
    }

    try {
      await navigator.clipboard.writeText(payload);
      toast.success(successMessage);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to copy review comments");
    }
  };

  useHotkey(
    "Mod+Alt+C",
    (event) => {
      if (isTypingTarget(event.target)) {
        return;
      }

      event.preventDefault();
      void copyReviewCommentsPayload(allPayload, "Copied all patch review comments");
    },
    {
      enabled: hasAnyReviewComments,
    },
  );

  useHotkey(
    "Mod+C",
    (event) => {
      if (isTypingTarget(event.target)) {
        return;
      }

      event.preventDefault();
      void copyReviewCommentsPayload(filePayload, "Copied file patch review comments");
    },
    {
      enabled: hasFileReviewComments,
    },
  );

  return (
    <div className="border-border/70 bg-surface-toolbar flex items-center justify-between gap-2 border-b px-2 py-1">
      <div className="text-muted-foreground min-w-0 text-xs">
        {totalPendingCommentCount > 0
          ? `${totalPendingCommentCount} pending comment${totalPendingCommentCount === 1 ? "" : "s"}${filePendingCommentCount > 0 ? ` · ${filePendingCommentCount} in this file` : ""}`
          : "No pending inline comments"}
      </div>
      <div className="flex items-center gap-1">
        <TooltipProvider>
          {onSubmitAllComments ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="xs"
                  disabled={!canSubmitComments || isSubmittingComments}
                  onClick={onSubmitAllComments}
                  aria-label="Submit all pending review comments"
                >
                  <MessageSquarePlus />
                  Submit all comments
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Publish all pending inline comments</TooltipContent>
            </Tooltip>
          ) : null}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="xs"
                variant="ghost"
                disabled={!hasFileReviewComments}
                onClick={() => {
                  void copyReviewCommentsPayload(filePayload, "Copied file patch review comments");
                }}
                aria-label="Copy file review comments"
              >
                <Copy />
                File
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Copy file review comments</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="xs"
                variant="ghost"
                disabled={!hasAnyReviewComments}
                onClick={() => {
                  void copyReviewCommentsPayload(allPayload, "Copied all patch review comments");
                }}
                aria-label="Copy all review comments"
              >
                <Copy />
                All
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Copy all review comments (⌘⌥C)</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
}

export default ReviewCommentsCopyToolbar;
