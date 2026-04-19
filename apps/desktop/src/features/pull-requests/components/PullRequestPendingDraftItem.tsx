import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";

import { useAppDispatch } from "@/app/hooks";
import { Button } from "@/components/ui/button";
import type { MentionConfig } from "@/components/markdown/MarkdownEditor";
import { removeComment, updateComment } from "@/features/comments/actions";
import { CommentBody } from "@/features/pull-requests/components/pullRequestCommentParts";
import { CommentComposer } from "@/features/diff-view/components/CommentComposer";
import type { CommentItem } from "@/features/source-control/types";

type PullRequestPendingDraftItemProps = {
  comment: CommentItem;
  variant: "inline" | "overview";
  mentions?: MentionConfig;
};

export function PullRequestPendingDraftItem({
  comment,
  variant,
  mentions,
}: PullRequestPendingDraftItemProps) {
  const dispatch = useAppDispatch();
  const [isEditing, setIsEditing] = useState(false);

  if (isEditing) {
    return (
      <div className={variant === "inline" ? "max-w-[30rem]" : "w-full"}>
        <CommentComposer
          visible
          defaultValue={comment.text}
          overrideSubmit={(text) => {
            dispatch(updateComment(comment.id, text));
            setIsEditing(false);
          }}
          onClose={() => setIsEditing(false)}
          submitButtonText="Save"
          mentions={mentions}
        />
      </div>
    );
  }

  if (variant === "inline") {
    return (
      <div className="border-border/60 bg-background/70 w-full max-w-[30rem] border px-2.5 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[10px] font-medium tracking-[0.12em] text-amber-500 uppercase">
            Pending
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => setIsEditing(true)}
              title="Edit draft"
            >
              <Pencil className="h-3 w-3" />
            </button>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => dispatch(removeComment(comment.id))}
              title="Delete draft"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </div>
        <div className="mt-1 text-[12px] leading-5">
          <CommentBody body={comment.text} />
        </div>
      </div>
    );
  }

  return (
    <div className="border-border/60 bg-background/60 rounded-md border px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-medium tracking-[0.12em] text-amber-500 uppercase">
            Pending draft
          </div>
          <div className="mt-1 text-[13px] leading-5">
            <CommentBody body={comment.text} />
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setIsEditing(true)}>
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={() => dispatch(removeComment(comment.id))}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}
