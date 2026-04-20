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

export function useDiffCommentAnnotations({
  activePath,
  commentContext,
  canComment,
  includeCurrentFileComments = true,
  commentMentions,
}: UseDiffCommentAnnotationsOptions) {
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo);
  const [selectedRange, setSelectedRange] = useState<SelectionRange | null>(null);

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

  const onLineSelected = useCallback((range: SelectionRange | null) => {
    setSelectedRange(range);
  }, []);

  const onLineSelectionEnd = useCallback((range: SelectionRange | null) => {
    setSelectedRange(range);
  }, []);

  const onCloseCommentComposer = useCallback(() => {
    setSelectedRange(null);
  }, []);

  const composerAnnotation = useMemo<DiffLineAnnotation<DiffAnnotationItem> | null>(() => {
    if (!selectedRange) return null;

    return {
      lineNumber: selectedRange.end,
      metadata: {
        type: "composer",
        side: selectedRange.side ?? "deletions",
        endSide: selectedRange.endSide,
        startLine: selectedRange.start,
        endLine: selectedRange.end,
      },
      side: selectedRange.side ?? "deletions",
    };
  }, [selectedRange]);

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
            selectedRange={selectedRange}
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
      selectedRange,
      showFirstCommentTip,
    ],
  );

  return {
    annotations,
    renderCommentAnnotation,
    selectedRange,
    setSelectedRange,
    onLineSelected,
    onLineSelectionEnd,
    onCloseCommentComposer,
  };
}
