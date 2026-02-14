import type { CommentItem } from '@/features/source-control/types'

function fileKey(repoPath: string, filePath: string): string {
  return `${repoPath}::${filePath}`
}

export function compactComments(comments: Array<CommentItem | undefined>): CommentItem[] {
  return comments.filter((comment): comment is CommentItem => !!comment)
}

export function createCommentCountByFile(comments: Array<CommentItem | undefined>): Map<string, number> {
  const counts = new Map<string, number>()
  for (const comment of comments) {
    if (!comment) continue
    const key = fileKey(comment.repoPath, comment.filePath)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

export function countCommentsForFile(comments: Array<CommentItem | undefined>, repoPath: string, filePath: string): number {
  let count = 0
  for (const comment of comments) {
    if (!comment) continue
    if (comment.repoPath === repoPath && comment.filePath === filePath) {
      count += 1
    }
  }
  return count
}

export function getCommentCountForFile(counts: Map<string, number>, repoPath: string, filePath: string): number {
  return counts.get(fileKey(repoPath, filePath)) ?? 0
}
