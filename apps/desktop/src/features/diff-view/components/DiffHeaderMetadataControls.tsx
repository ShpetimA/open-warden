import { BookOpenText, Columns2, Copy, FoldVertical, Rows3, UnfoldVertical } from "lucide-react";
import { useHotkey } from "@tanstack/react-hotkeys";
import { toast } from "sonner";

import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { copyComments, fileComments } from "@/features/comments/actions";
import { compactComments } from "@/features/comments/selectors";
import { OpenInExternalEditor } from "@/features/source-control/components/OpenInExternalEditor";
import { setDiffStyleValue } from "@/features/source-control/actions";
import { openFileViewer } from "@/features/source-control/sourceControlSlice";
import type { CommentContext } from "@/features/source-control/types";

type Props = {
  activePath: string;
  canComment: boolean;
  commentContext: CommentContext;
  expandUnchanged: boolean;
  fileViewerRevision?: string | null;
  onToggleExpandUnchanged: () => void;
};

function copyAndClearMessage(count: number): string {
  return `Copied ${count} comment${count === 1 ? "" : "s"} and cleared them`;
}

export function DiffHeaderMetadataControls({
  activePath,
  canComment,
  commentContext,
  expandUnchanged,
  fileViewerRevision,
  onToggleExpandUnchanged,
}: Props) {
  const dispatch = useAppDispatch();
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo);
  const diffStyle = useAppSelector((state) => state.sourceControl.diffStyle);
  const comments = useAppSelector((state) => state.comments);
  const expandUnchangedLabel = expandUnchanged
    ? "Collapse unchanged sections"
    : "Expand unchanged sections";

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
      enabled: canComment && !!activePath && currentFileComments.length > 0,
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

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={() => {
                if (!activeRepo || !activePath) {
                  return;
                }

                dispatch(
                  openFileViewer({
                    repoPath: activeRepo,
                    relPath: activePath,
                    revision: fileViewerRevision,
                  }),
                );
              }}
              disabled={!activeRepo || !activePath}
              aria-label="Open file viewer"
            >
              <BookOpenText />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Open file viewer</TooltipContent>
        </Tooltip>

        {canComment ? (
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
        ) : null}
      </div>
    </TooltipProvider>
  );
}
