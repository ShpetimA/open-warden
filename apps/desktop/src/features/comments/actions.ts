import type { AppThunk } from '@/app/store'
import {
  addComment as addCommentAction,
  removeComment as removeCommentAction,
  updateComment as updateCommentAction,
} from '@/features/comments/commentsSlice'
import { setError } from '@/features/source-control/sourceControlSlice'
import type { Bucket, CommentItem, SelectionRange } from '@/features/source-control/types'
import { formatRange, normalizeRange } from '@/features/source-control/utils'

export const addComment =
  (range: SelectionRange, text: string): AppThunk =>
  (dispatch, getState) => {
    const trimmed = text.trim()
    const { activeRepo, activePath, activeBucket } = getState().sourceControl
    if (!trimmed || !activeRepo || !activePath) return

    const normalized = normalizeRange(range)
    const side = range.side ?? 'additions'
    const endSide = range.endSide ?? side
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    const next: CommentItem = {
      id,
      repoPath: activeRepo,
      filePath: activePath,
      bucket: activeBucket,
      startLine: normalized.start,
      endLine: normalized.end,
      side,
      endSide,
      text: trimmed,
    }

    dispatch(addCommentAction(next))
  }

export const removeComment =
  (id: string): AppThunk =>
  (dispatch) => {
    dispatch(removeCommentAction(id))
  }

export const updateComment =
  (id: string, text: string): AppThunk =>
  (dispatch) => {
    const trimmed = text.trim()
    if (!trimmed) return
    dispatch(updateCommentAction({ id, text: trimmed }))
  }

export const copyComments =
  (scope: 'file' | 'all'): AppThunk<Promise<boolean>> =>
  async (dispatch, getState) => {
    const { comments } = getState()
    const { activeRepo, activePath } = getState().sourceControl
    if (!activeRepo) return false
    const source =
      scope === 'file'
        ? comments.filter((c) => c.repoPath === activeRepo && c.filePath === activePath)
        : comments.filter((c) => c.repoPath === activeRepo)

    if (source.length === 0) return false

    const payload = source
      .map((c) => `@${c.filePath}#${formatRange(c.startLine, c.endLine)} - ${c.text}`)
      .join('\n')

    try {
      await navigator.clipboard.writeText(payload)
      return true
    } catch (error) {
      dispatch(setError(error instanceof Error ? error.message : String(error)))
      return false
    }
  }

export function fileComments(comments: CommentItem[], repoPath: string, filePath: string) {
  return comments.filter((c) => c.repoPath === repoPath && c.filePath === filePath)
}

export function toLineAnnotations(comments: CommentItem[]) {
  return comments.map(
    (comment): { side: 'deletions' | 'additions'; lineNumber: number; metadata: CommentItem } => ({
      side: comment.endSide ?? comment.side,
      lineNumber: comment.endLine,
      metadata: comment,
    }),
  )
}

export function confirmDiscard(message: string): boolean {
  return window.confirm(message)
}

export function canDiscard(bucket: Bucket): boolean {
  return bucket === 'unstaged' || bucket === 'untracked' || bucket === 'staged'
}
