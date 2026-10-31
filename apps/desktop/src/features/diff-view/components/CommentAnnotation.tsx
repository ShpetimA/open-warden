import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ReviewNote } from "@/components/ui/review-note";

import { useAppDispatch } from "@/app/hooks";
import { removeComment, updateComment } from "@/features/comments/actions";
import type { CommentItem } from "@/features/source-control/types";
import { CommentComposer } from "@/features/diff-view/components/CommentComposer";

type Props = {
  comment: CommentItem;
  onBeforeMutate?: () => void;
};

export function CommentAnnotation({ comment, onBeforeMutate }: Props) {
  const dispatch = useAppDispatch();
  const [isEditing, setIsEditing] = useState(false);

  const onStartEdit = () => {
    setIsEditing(true);
  };

  const onCancelEdit = () => {
    setIsEditing(false);
  };

  const onSaveEdit = (text: string) => {
    if (!text.trim()) return;
    onBeforeMutate?.();
    dispatch(updateComment(comment.id, text));
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <CommentComposer
        submitButtonText="Save"
        visible
        defaultValue={comment.text}
        overrideSubmit={onSaveEdit}
        onClose={onCancelEdit}
      />
    );
  }

  return (
    <ReviewNote
      title="Review note"
      label="Review note"
      body={comment.text}
      actions={
        <>
          <Button variant="ghost" size="icon-xs" aria-label="Edit note" onClick={onStartEdit}>
            <Pencil />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Remove note"
            onClick={() => {
              onBeforeMutate?.();
              dispatch(removeComment(comment.id));
            }}
          >
            <Trash2 />
          </Button>
        </>
      }
    />
  );
}
