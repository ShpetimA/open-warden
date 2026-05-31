import { useCallback, useMemo, useState } from "react";
import { shallowEqual } from "react-redux";

import { useAppSelector } from "@/app/hooks";
import { fileComments, toLineAnnotations } from "@/features/comments/actions";
import { useFirstCommentTip } from "@/features/comments/useFirstCommentTip";
import { CommentAnnotation } from "@/features/diff-view/components/CommentAnnotation";
import { CommentComposer } from "@/features/diff-view/components/CommentComposer";
import type { MentionConfig } from "@/components/markdown/MarkdownEditor";
import type {
  CommentContext,
  CommentItem,
  DiffAnnotationItem,
  SelectionRange,
} from "@/features/source-control/types";
import { type DiffLineAnnotation } from "@pierre/diffs";

type FileCommentsResult = {
  comments: CommentItem[];
  annotations: ReturnType<typeof toLineAnnotations>;
};

const EMPTY_FILE_COMMENTS: CommentItem[] = [];
const EMPTY_FILE_ANNOTATIONS: ReturnType<typeof toLineAnnotations> = [];

function useCurrentFileComments(
  activeRepo: string,
  activePath: string,
  commentContext: CommentContext,
  canComment: boolean,
): FileCommentsResult {
  const comments = useAppSelector((state): CommentItem[] => {
    if (!canComment || !activeRepo || !activePath) {
      return EMPTY_FILE_COMMENTS;
    }

    return fileComments(state.comments, activeRepo, activePath, commentContext);
  }, shallowEqual);

  const annotations = useMemo(() => {
    if (comments.length === 0) {
      return EMPTY_FILE_ANNOTATIONS;
    }

    return toLineAnnotations(comments);
  }, [comments]);

  return { comments, annotations };
}

type UseDiffCommentAnnotationsOptions = {
  activePath: string;
  commentContext: CommentContext;
  canComment: boolean;
  includeCurrentFileComments?: boolean;
  commentMentions?: MentionConfig;
};

type CurrentSelection = {
  range: SelectionRange;
  showComposer: boolean;
};

export function useDiffCommentAnnotations({
  activePath,
  commentContext,
  canComment,
  includeCurrentFileComments = true,
  commentMentions,
}: UseDiffCommentAnnotationsOptions) {
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo);
  const [selection, setSelection] = useState<CurrentSelection | null>(null);
  const selectedRange = selection?.range ?? null;
  const composerRange = selection?.showComposer ? selection.range : null;

  const { annotations: commentAnnotations } = useCurrentFileComments(
    activeRepo,
    activePath,
    commentContext,
    canComment && includeCurrentFileComments,
  );

  const repoCommentCount = useAppSelector((state) => {
    if (!canComment || !activeRepo) return 0;
    return state.comments.filter((c) => c.repoPath === activeRepo).length;
  });

  const { showFirstCommentTip } = useFirstCommentTip();

  const setSelectedRange = useCallback((range: SelectionRange | null) => {
    setSelection(range ? { range, showComposer: false } : null);
  }, []);

  const onLineSelectionStart = useCallback((range: SelectionRange | null) => {
    setSelection(range ? { range, showComposer: false } : null);
  }, []);

  const onLineSelectionChange = useCallback((range: SelectionRange | null) => {
    setSelection(range ? { range, showComposer: false } : null);
  }, []);

  const onLineSelected = useCallback((range: SelectionRange | null) => {
    setSelection(range ? { range, showComposer: true } : null);
  }, []);

  const onLineSelectionEnd = useCallback((range: SelectionRange | null) => {
    setSelection(range ? { range, showComposer: true } : null);
  }, []);

  const onCloseCommentComposer = useCallback(() => {
    setSelection(null);
  }, []);

  const composerAnnotation = useMemo<DiffLineAnnotation<DiffAnnotationItem> | null>(() => {
    if (!composerRange) return null;

    return {
      lineNumber: composerRange.end,
      metadata: {
        type: "composer",
        side: composerRange.side ?? "deletions",
        endSide: composerRange.endSide,
        startLine: composerRange.start,
        endLine: composerRange.end,
      },
      side: composerRange.side ?? "deletions",
    };
  }, [composerRange]);

  const annotations = useMemo<DiffLineAnnotation<DiffAnnotationItem>[]>(() => {
    if (!composerAnnotation) return commentAnnotations;
    return [...commentAnnotations, composerAnnotation];
  }, [commentAnnotations, composerAnnotation]);

  const renderCommentAnnotation = useCallback(
    (data: DiffAnnotationItem) => {
      if (data.type === "composer") {
        return (
          <CommentComposer
            visible
            activePath={activePath}
            selectedRange={composerRange}
            commentContext={commentContext}
            onClose={onCloseCommentComposer}
            onBeforeSubmit={repoCommentCount === 0 ? showFirstCommentTip : undefined}
            mentions={commentMentions}
          />
        );
      }

      if (data.type === "annotation") {
        return <CommentAnnotation comment={data} />;
      }

      return null;
    },
    [
      activePath,
      commentContext,
      commentMentions,
      onCloseCommentComposer,
      repoCommentCount,
      composerRange,
      showFirstCommentTip,
    ],
  );

  return {
    annotations,
    renderCommentAnnotation,
    selectedRange,
    setSelectedRange,
    onLineSelectionStart,
    onLineSelectionChange,
    onLineSelected,
    onLineSelectionEnd,
    onCloseCommentComposer,
  };
}
