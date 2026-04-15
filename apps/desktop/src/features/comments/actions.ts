import type { AppThunk } from "@/app/store";
import { desktop } from "@/platform/desktop";
import {
  setLastCopiedPayload,
  clearLastCopiedPayload,
} from "@/features/comments/commentsClipboardSlice";
import {
  addComment as addCommentAction,
  removeComment as removeCommentAction,
  removeCommentsByIds as removeCommentsByIdsAction,
  updateComment as updateCommentAction,
} from "@/features/comments/commentsSlice";
import type {
  Bucket,
  CommentContext,
  CommentItem,
  SelectionRange,
} from "@/features/source-control/types";
import { formatRange } from "@/features/source-control/utils";

export type CopyCommentsResult = {
  ok: boolean;
  copiedCount: number;
  clearedCount: number;
};

function contextForComment(comment: CommentItem): CommentContext {
  if (comment.contextKind === "review" && comment.baseRef && comment.headRef) {
    return { kind: "review", baseRef: comment.baseRef, headRef: comment.headRef };
  }
  return { kind: "changes" };
}

function isMatchingContext(comment: CommentItem, context?: CommentContext): boolean {
  if (!context) return true;
  const commentContext = contextForComment(comment);
  if (commentContext.kind !== context.kind) return false;
  if (context.kind === "review" && commentContext.kind === "review") {
    return commentContext.baseRef === context.baseRef && commentContext.headRef === context.headRef;
  }
  return true;
}

export const addComment =
  (
    range: SelectionRange,
    text: string,
    context: CommentContext = { kind: "changes" },
    targetPathOverride?: string,
  ): AppThunk =>
  (dispatch, getState) => {
    const trimmed = text.trim();
    const { activeRepo, activePath, activeBucket, reviewActivePath } = getState().sourceControl;
    const targetPath =
      targetPathOverride ?? (context.kind === "review" ? reviewActivePath : activePath);
    if (!trimmed || !activeRepo || !targetPath) return;

    const side = range.side ?? "additions";
    const endSide = range.endSide ?? side;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const next: CommentItem = {
      type: "annotation",
      id,
      repoPath: activeRepo,
      filePath: targetPath,
      bucket: context.kind === "review" ? "unstaged" : activeBucket,
      startLine: range.start,
      endLine: range.end,
      side,
      endSide,
      text: trimmed,
      contextKind: context.kind,
      baseRef: context.kind === "review" ? context.baseRef : undefined,
      headRef: context.kind === "review" ? context.headRef : undefined,
    };

    dispatch(addCommentAction(next));
    dispatch(clearLastCopiedPayload());
  };

export const removeComment =
  (id: string): AppThunk =>
  (dispatch) => {
    dispatch(removeCommentAction(id));
  };

export const removeCommentsByIds =
  (ids: string[]): AppThunk =>
  (dispatch) => {
    dispatch(removeCommentsByIdsAction(ids));
  };

export const updateComment =
  (id: string, text: string): AppThunk =>
  (dispatch) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    dispatch(updateCommentAction({ id, text: trimmed }));
  };

function copyPayloadForComments(source: CommentItem[]): string {
  return source
    .map((c) => `@${c.filePath}#${formatRange(c.startLine, c.endLine)} - ${c.text}`)
    .join("\n");
}

export const copyComments =
  (
    scope: "file" | "all",
    options?: { context?: CommentContext; activePath?: string },
  ): AppThunk<Promise<CopyCommentsResult>> =>
  async (dispatch, getState) => {
    const { comments } = getState();
    const { activeRepo, activePath } = getState().sourceControl;
    const currentPath = options?.activePath ?? activePath;
    if (!activeRepo) return { ok: false, copiedCount: 0, clearedCount: 0 };
    const source =
      scope === "file"
        ? comments.filter(
            (c) =>
              c.repoPath === activeRepo &&
              c.filePath === currentPath &&
              isMatchingContext(c, options?.context),
          )
        : comments.filter(
            (c) => c.repoPath === activeRepo && isMatchingContext(c, options?.context),
          );

    if (source.length === 0) return { ok: false, copiedCount: 0, clearedCount: 0 };

    const payload = copyPayloadForComments(source);

    try {
      await navigator.clipboard.writeText(payload);
      const sourceIds = source.map((comment) => comment.id);
      dispatch(removeCommentsByIdsAction(sourceIds));
      dispatch(setLastCopiedPayload(payload));
      return { ok: true, copiedCount: source.length, clearedCount: source.length };
    } catch {
      return { ok: false, copiedCount: 0, clearedCount: 0 };
    }
  };

export const copyLastCommentsPayload =
  (): AppThunk<Promise<{ ok: boolean }>> => async (_dispatch, getState) => {
    const payload = getState().commentsClipboard.lastCopiedPayload;
    if (!payload) return { ok: false };

    try {
      await navigator.clipboard.writeText(payload);
      return { ok: true };
    } catch {
      return { ok: false };
    }
  };

export function fileComments(
  comments: CommentItem[],
  repoPath: string,
  filePath: string,
  context?: CommentContext,
) {
  return comments.filter(
    (c) => c.repoPath === repoPath && c.filePath === filePath && isMatchingContext(c, context),
  );
}

export function toLineAnnotations(comments: CommentItem[]) {
  return comments.map(
    (comment): { side: "deletions" | "additions"; lineNumber: number; metadata: CommentItem } => ({
      side: comment.endSide ?? comment.side,
      lineNumber: comment.endLine,
      metadata: comment,
    }),
  );
}

export async function confirmDiscard(message: string): Promise<boolean> {
  try {
    return await desktop.confirm(message, {
      title: "Discard Changes",
      kind: "warning",
      okLabel: "Discard",
      cancelLabel: "Cancel",
    });
  } catch {
    return window.confirm(message);
  }
}

export function canDiscard(bucket: Bucket): boolean {
  return bucket === "unstaged" || bucket === "untracked" || bucket === "staged";
}
