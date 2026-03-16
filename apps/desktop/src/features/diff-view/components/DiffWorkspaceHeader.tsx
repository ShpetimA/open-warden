import { Check, GitPullRequestArrow } from "lucide-react";
import { useHotkey } from "@tanstack/react-hotkeys";
import { toast } from "sonner";

import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { Button } from "@/components/ui/button";
import { copyComments, fileComments } from "@/features/comments/actions";
import { compactComments } from "@/features/comments/selectors";
import type { CommentContext } from "@/features/source-control/types";
import { setDiffStyleValue } from "@/features/source-control/actions";

type Props = {
  activePath: string;
  commentContext: CommentContext;
  canComment: boolean;
  showDiffActions: boolean;
};

function copyAndClearMessage(count: number): string {
  return `Copied ${count} comment${count === 1 ? "" : "s"} and cleared them`;
}

export function DiffWorkspaceHeader({
  activePath,
  commentContext,
  canComment,
  showDiffActions,
}: Props) {
  const dispatch = useAppDispatch();
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo);
  const diffStyle = useAppSelector((state) => state.sourceControl.diffStyle);
  const comments = useAppSelector((state) => state.comments);

  const allComments = compactComments(comments);
  const currentFileComments = canComment
    ? fileComments(allComments, activeRepo, activePath, commentContext)
    : [];

  const onCopyFileComments = async () => {
    const result = await dispatch(copyComments("file", { context: commentContext, activePath }));
    if (result.ok) toast.success(copyAndClearMessage(result.clearedCount));
  };

  useHotkey(
    "Mod+C",
    () => {
      void onCopyFileComments();
    },
    {
      enabled: showDiffActions && canComment && !!activePath && currentFileComments.length > 0,
    },
  );

  return (
    <div className="border-border flex items-center gap-1 border-b px-2 py-1">
      {showDiffActions ? (
        <>
          <Button
            size="sm"
            variant={diffStyle === "split" ? "secondary" : "ghost"}
            onClick={() => dispatch(setDiffStyleValue("split"))}
          >
            <GitPullRequestArrow className="mr-1 h-3.5 w-3.5" /> Split
          </Button>
          <Button
            size="sm"
            variant={diffStyle === "unified" ? "secondary" : "ghost"}
            onClick={() => dispatch(setDiffStyleValue("unified"))}
          >
            <Check className="mr-1 h-3.5 w-3.5" /> Unified
          </Button>

          {canComment ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void onCopyFileComments();
              }}
              disabled={!activePath || currentFileComments.length === 0}
            >
              Copy Comments (File)
            </Button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
