import { Pencil, Trash2, X } from "lucide-react";
import { useState } from "react";

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
    if (!comment.text.trim()) return;
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
    <div className="bg-accent text-accent-foreground group flex max-w-[28rem] items-center gap-1 p-1 text-[10px]">
      <span className="min-w-0 flex-1 truncate">{comment.text}</span>
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground"
        onMouseDown={(event) => event.stopPropagation()}
        onClick={onStartEdit}
        title="Edit"
      >
        <Pencil className="h-3 w-3" />
      </button>
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground"
        onMouseDown={(event) => event.stopPropagation()}
        onClick={() => {
          onBeforeMutate?.();
          dispatch(removeComment(comment.id));
        }}
        title="Remove"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}
