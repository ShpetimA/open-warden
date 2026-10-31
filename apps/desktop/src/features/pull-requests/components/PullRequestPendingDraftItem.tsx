import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";

import { useAppDispatch } from "@/app/hooks";
import { Button } from "@/components/ui/button";
import type { MentionConfig } from "@/components/markdown/MarkdownEditor";
import { removeComment, updateComment } from "@/features/comments/actions";
import { ReviewNote } from "@/components/ui/review-note";
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
      <div className="w-full min-w-0 max-w-3xl font-sans">
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

  return (
    <ReviewNote
      title={variant === "inline" ? "Your comment" : "Draft comment"}
      label="Pending comment"
      body={comment.text}
      metadata={<span className="text-warning">Pending</span>}
      actions={
        <>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Edit draft"
            title="Edit draft"
            onClick={() => setIsEditing(true)}
          >
            <Pencil />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Delete draft"
            title="Delete draft"
            onClick={() => dispatch(removeComment(comment.id))}
          >
            <Trash2 />
          </Button>
        </>
      }
    />
  );
}
