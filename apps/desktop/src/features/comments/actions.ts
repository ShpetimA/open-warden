import { appState$ } from '@/features/source-control/store'
import type { Bucket, CommentItem, SelectionRange } from '@/features/source-control/types'
import { formatRange, normalizeRange } from '@/features/source-control/utils'
import { safeComments } from './selectors'

export function addComment(range: SelectionRange, text: string) {
  const trimmed = text.trim()
  const repoPath = appState$.activeRepo.get()
  const filePath = appState$.activePath.get()
  const bucket = appState$.activeBucket.get()
  if (!trimmed || !repoPath || !filePath) return

  const normalized = normalizeRange(range)
  const side = range.side ?? 'additions'
  const endSide = range.endSide ?? side
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  const next: CommentItem = {
    id,
    repoPath,
    filePath,
    bucket,
    startLine: normalized.start,
    endLine: normalized.end,
    side,
    endSide,
    text: trimmed,
  }

  appState$.comments.set([...safeComments(appState$.comments.get()), next])
}

export function removeComment(id: string) {
  appState$.comments.set(safeComments(appState$.comments.get()).filter((item) => item.id !== id))
}

export function updateComment(id: string, text: string) {
  const trimmed = text.trim()
  if (!trimmed) return

  appState$.comments.set(
    safeComments(appState$.comments.get()).map((item) => {
      if (item.id !== id) return item
      return { ...item, text: trimmed }
    }),
  )
}

export async function copyComments(scope: 'file' | 'all') {
  const all = safeComments(appState$.comments.get())
  const source =
    scope === 'file'
      ? all.filter((c) => c.repoPath === appState$.activeRepo.get() && c.filePath === appState$.activePath.get())
      : all

  if (source.length === 0) return

  const payload = source.map((c) => `@${c.filePath}#${formatRange(c.startLine, c.endLine)} - ${c.text}`).join('\n')

  try {
    await navigator.clipboard.writeText(payload)
  } catch (error) {
    appState$.error.set(error instanceof Error ? error.message : String(error))
  }
}

export function fileComments(comments: CommentItem[], repoPath: string, filePath: string) {
  return comments.filter((c) => c.repoPath === repoPath && c.filePath === filePath)
}

export function toLineAnnotations(comments: CommentItem[]) {
  return comments.map((comment): { side: 'deletions' | 'additions'; lineNumber: number; metadata: CommentItem } => ({
    side: comment.endSide ?? comment.side,
    lineNumber: comment.endLine,
    metadata: comment,
  }))
}

export function confirmDiscard(message: string): boolean {
  return window.confirm(message)
}

export function canDiscard(bucket: Bucket): boolean {
  return bucket === 'unstaged' || bucket === 'untracked' || bucket === 'staged'
}
