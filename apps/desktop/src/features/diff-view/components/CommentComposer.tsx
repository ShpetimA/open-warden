import { useEffect, useRef, useState } from "react";
import { useHotkey } from "@tanstack/react-hotkeys";

import { useAppDispatch } from "@/app/hooks";
import { MarkdownEditor, type MentionConfig } from "@/components/markdown/MarkdownEditor";
import { Button } from "@/components/ui/button";
import { addComment } from "@/features/comments/actions";
import type { CommentContext, SelectionRange } from "@/features/source-control/types";

type Props = {
  visible: boolean;
  defaultValue?: string;
  activePath?: string;
  selectedRange?: SelectionRange | null;
  commentContext?: CommentContext;
  submitButtonText?: string;
  onClose: () => void;
  onBeforeSubmit?: () => void;
  overrideSubmit?: (text: string) => void;
  mentions?: MentionConfig;
};

export function CommentComposer({
  visible,
  activePath,
  selectedRange,
  commentContext,
  submitButtonText = "Add",
  onClose,
  onBeforeSubmit,
  overrideSubmit,
  defaultValue = "",
  mentions,
}: Props) {
  const dispatch = useAppDispatch();
  const [draftComment, setDraftComment] = useState(defaultValue);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const onCancel = () => {
    setDraftComment("");
    onClose();
  };

  const onSubmit = () => {
    if (overrideSubmit) {
      overrideSubmit(draftComment);
      return;
    }
    if (!selectedRange || !draftComment.trim() || !activePath) return;
    onBeforeSubmit?.();
    dispatch(addComment(selectedRange, draftComment, commentContext, activePath));
    setDraftComment("");
    onClose();
  };

  useEffect(() => {
    if (defaultValue) {
      const end = defaultValue.length;
      inputRef.current?.setSelectionRange(end, end);
    }
    if (visible) {
      inputRef.current?.focus({ preventScroll: true });
    }
  }, [visible, defaultValue]);

  useHotkey(
    "Mod+Enter",
    (event) => {
      event.preventDefault();
      onSubmit();
    },
    { target: inputRef, enabled: visible, ignoreInputs: false },
  );

  useHotkey(
    "Escape",
    (event) => {
      event.preventDefault();
      onCancel();
    },
    { target: inputRef, enabled: visible, ignoreInputs: false },
  );

  if (!visible) return null;

  return (
    <div className="border-border bg-surface-elevated flex w-full min-w-0 max-w-3xl flex-col rounded-md border p-2 font-sans whitespace-normal">
      <MarkdownEditor
        value={draftComment}
        onChange={setDraftComment}
        placeholder="Leave a comment..."
        compact
        textareaRef={inputRef}
        mentions={mentions}
      />
      <div className="mt-2 ml-auto flex items-center gap-1">
        <Button
          size="xs"
          variant="outline"
          className="px-3"
          onClick={onSubmit}
          disabled={!draftComment.trim()}
        >
          {submitButtonText}
        </Button>
        <Button size="xs" variant="ghost" className="px-2" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
