import { useHotkey } from "@tanstack/react-hotkeys";
import { Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { copyComments } from "@/features/comments/actions";
import { countCommentsForRepoContext } from "@/features/comments/selectors";
import type { CommentContext } from "@/features/source-control/types";
import { isTypingTarget } from "@/features/source-control/utils";

type Props = {
  repoPath: string;
  context: Extract<CommentContext, { kind: "review" }>;
};

export function BranchReviewCommentsToolbar({ repoPath, context }: Props) {
  const dispatch = useAppDispatch();
  const count = useAppSelector((state) =>
    countCommentsForRepoContext(state.comments, repoPath, context),
  );
  const [copying, setCopying] = useState(false);

  async function copyAllComments() {
    if (copying || count === 0) {
      return;
    }

    setCopying(true);

    try {
      const result = await dispatch(copyComments("all", { context }));

      if (result.ok) {
        toast.success(
          `Copied ${result.copiedCount} comment${result.copiedCount === 1 ? "" : "s"} and cleared them`,
        );
      } else {
        toast.error("Couldn’t copy review comments. Your comments are unchanged.");
      }
    } finally {
      setCopying(false);
    }
  }

  useHotkey(
    "Mod+Alt+C",
    (event) => {
      if (isTypingTarget(event.target) || event.repeat) {
        return;
      }

      event.preventDefault();
      void copyAllComments();
    },
    { enabled: count > 0 && !copying },
  );

  return (
    <div className="border-border/70 bg-surface-toolbar flex items-center justify-between gap-2 border-b px-3 py-1">
      <span className="text-muted-foreground text-xs tabular-nums">
        {count} review comment{count === 1 ? "" : "s"}
      </span>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="xs"
              variant="ghost"
              disabled={count === 0 || copying}
              aria-label="Copy all branch review comments"
              aria-busy={copying}
              onClick={() => void copyAllComments()}
            >
              <Copy />
              {copying ? "Copying…" : "Copy all"}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Copy and clear all comments in this comparison (⌘⌥C)</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
