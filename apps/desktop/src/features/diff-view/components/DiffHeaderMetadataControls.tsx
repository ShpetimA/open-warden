import { Columns2, Copy, Files, FoldVertical, Rows3, UnfoldVertical } from "lucide-react";
import { useHotkey } from "@tanstack/react-hotkeys";
import { toast } from "sonner";

import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { Button } from "@/components/ui/button";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { copyComments, fileComments } from "@/features/comments/actions";
import { compactComments } from "@/features/comments/selectors";
import { OpenInExternalEditor } from "@/features/source-control/components/OpenInExternalEditor";
import { setDiffStyleValue } from "@/features/source-control/actions";
import type { CommentContext, CommentItem } from "@/features/source-control/types";

type Props = {
  activePath: string;
  canComment: boolean;
  commentContext: CommentContext;
  expandUnchanged: boolean;
  onToggleExpandUnchanged: () => void;
  showCopyTip?: boolean;
  onDismissCopyTip?: () => void;
};

function inContext(comment: CommentItem, context: CommentContext): boolean {
  const kind = comment.contextKind ?? "changes";
  if (kind !== context.kind) return false;
  if (context.kind === "review") {
    return comment.baseRef === context.baseRef && comment.headRef === context.headRef;
  }
  return true;
}

export function DiffHeaderMetadataControls({
  activePath,
  canComment,
  commentContext,
  expandUnchanged,
  onToggleExpandUnchanged,
  showCopyTip,
  onDismissCopyTip,
}: Props) {
  const dispatch = useAppDispatch();
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo);
  const diffStyle = useAppSelector((state) => state.sourceControl.diffStyle);
  const comments = useAppSelector((state) => state.comments);
  const expandUnchangedLabel = expandUnchanged
    ? "Collapse unchanged sections"
    : "Expand unchanged sections";

  const allComments = compactComments(comments);
  const currentRepoComments = activeRepo
    ? allComments.filter((comment) => comment.repoPath === activeRepo)
    : [];
  const currentContextComments = currentRepoComments.filter((comment) =>
    inContext(comment, commentContext),
  );
  const currentFileComments = canComment
    ? fileComments(allComments, activeRepo, activePath, commentContext)
    : [];

  const onCopyFileComments = async () => {
    const copied = await dispatch(copyComments("file", { context: commentContext, activePath }));
    if (copied) toast.success("Copied file comments");
  };

  const onCopyAllComments = async () => {
    const copied = await dispatch(copyComments("all", { context: commentContext }));
    if (copied) toast.success("Copied comments");
  };

  useHotkey(
    "Mod+C",
    () => {
      void onCopyFileComments();
    },
    {
      enabled: canComment && !!activePath && currentFileComments.length > 0,
    },
  );

  useHotkey(
    "Mod+Alt+C",
    () => {
      void onCopyAllComments();
    },
    {
      enabled: canComment && currentContextComments.length > 0,
    },
  );

  return (
    <TooltipProvider>
      <div className="flex items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-xs"
              variant={diffStyle === "split" ? "secondary" : "ghost"}
              onClick={() => dispatch(setDiffStyleValue("split"))}
              aria-label="Split diff"
            >
              <Columns2 />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Split diff</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-xs"
              variant={diffStyle === "unified" ? "secondary" : "ghost"}
              onClick={() => dispatch(setDiffStyleValue("unified"))}
              aria-label="Unified diff"
            >
              <Rows3 />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Unified diff</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-xs"
              variant={expandUnchanged ? "secondary" : "ghost"}
              onClick={onToggleExpandUnchanged}
              aria-label={expandUnchangedLabel}
            >
              {expandUnchanged ? <FoldVertical /> : <UnfoldVertical />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{expandUnchangedLabel}</TooltipContent>
        </Tooltip>

        <OpenInExternalEditor
          repoPath={activeRepo}
          filePath={activePath}
          target="file"
          compact
          disabled={!activePath}
        />

        {canComment ? (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  onClick={() => {
                    void onCopyFileComments();
                  }}
                  disabled={!activePath || currentFileComments.length === 0}
                  aria-label="Copy file comments"
                >
                  <Copy />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Copy file comments</TooltipContent>
            </Tooltip>

            <Tooltip
              open={showCopyTip ? true : undefined}
              onOpenChange={(open) => {
                if (showCopyTip && !open) onDismissCopyTip?.();
              }}
            >
              <TooltipTrigger asChild>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  onClick={() => {
                    if (showCopyTip) onDismissCopyTip?.();
                    void onCopyAllComments();
                  }}
                  disabled={currentContextComments.length === 0}
                  aria-label="Copy all comments"
                >
                  <Files />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" onClick={() => onDismissCopyTip?.()}>
                {showCopyTip ? (
                  <span className="flex items-center gap-1.5">
                    Press
                    <KbdGroup>
                      <Kbd>⌘</Kbd>
                      <Kbd>⌥</Kbd>
                      <Kbd>C</Kbd>
                    </KbdGroup>
                    to copy all comments
                  </span>
                ) : (
                  "Copy all comments"
                )}
              </TooltipContent>
            </Tooltip>
          </>
        ) : null}
      </div>
    </TooltipProvider>
  );
}
