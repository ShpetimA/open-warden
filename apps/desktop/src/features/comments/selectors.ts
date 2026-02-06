import type { CommentItem } from '@/features/source-control/types'

export function safeComments(comments: Array<CommentItem | undefined>): CommentItem[] {
  return comments.reduce<CommentItem[]>((acc, item) => {
    if (item) acc.push(item)
    return acc
  }, [])
}
