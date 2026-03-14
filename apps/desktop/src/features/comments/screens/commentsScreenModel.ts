import type { CommentItem } from '@/features/source-control/types'

export type ContextFilter = 'all' | 'changes' | 'review'

export type ReviewPairOption = {
  value: string
  label: string
  baseRef: string
  headRef: string
}

export type FileFilterOption = {
  path: string
  count: number
}

export type CommentFileGroup = {
  path: string
  comments: CommentItem[]
  reviewCount: number
  changesCount: number
}

const REVIEW_PAIR_SEPARATOR = '\u0000'

function commentContextKind(comment: CommentItem): 'changes' | 'review' {
  return comment.contextKind ?? 'changes'
}

function compareCommentsForDisplay(left: CommentItem, right: CommentItem): number {
  const pathCompare = left.filePath.localeCompare(right.filePath)
  if (pathCompare !== 0) return pathCompare

  if (left.startLine !== right.startLine) {
    return left.startLine - right.startLine
  }

  if (left.endLine !== right.endLine) {
    return left.endLine - right.endLine
  }

  return left.id.localeCompare(right.id)
}

function queryMatchesComment(comment: CommentItem, query: string): boolean {
  if (!query) return true

  if (comment.filePath.toLowerCase().includes(query)) return true
  if (comment.text.toLowerCase().includes(query)) return true

  const baseRef = comment.baseRef ?? ''
  const headRef = comment.headRef ?? ''
  return `${baseRef} ${headRef}`.toLowerCase().includes(query)
}

function reviewPairMatches(comment: CommentItem, selectedPair: string | null): boolean {
  if (!selectedPair) return true

  const pair = parseReviewPairValue(selectedPair)
  if (!pair) return false

  return (
    commentContextKind(comment) === 'review' &&
    comment.baseRef === pair.baseRef &&
    comment.headRef === pair.headRef
  )
}

function contextFilterMatches(comment: CommentItem, contextFilter: ContextFilter): boolean {
  if (contextFilter === 'all') return true
  return commentContextKind(comment) === contextFilter
}

export function reviewPairValue(baseRef: string, headRef: string): string {
  return `${baseRef}${REVIEW_PAIR_SEPARATOR}${headRef}`
}

export function parseReviewPairValue(value: string): { baseRef: string; headRef: string } | null {
  const separatorIndex = value.indexOf(REVIEW_PAIR_SEPARATOR)
  if (separatorIndex <= 0) return null

  const baseRef = value.slice(0, separatorIndex)
  const headRef = value.slice(separatorIndex + 1)
  if (!baseRef || !headRef) return null

  return { baseRef, headRef }
}

export function commentsForRepo(comments: CommentItem[], repoPath: string): CommentItem[] {
  if (!repoPath) return comments
  return comments.filter((comment) => comment.repoPath === repoPath)
}

export function createReviewPairOptions(comments: CommentItem[]): ReviewPairOption[] {
  const uniquePairs = new Map<string, ReviewPairOption>()

  for (const comment of comments) {
    if (commentContextKind(comment) !== 'review') continue
    if (!comment.baseRef || !comment.headRef) continue

    const value = reviewPairValue(comment.baseRef, comment.headRef)
    if (uniquePairs.has(value)) continue

    uniquePairs.set(value, {
      value,
      label: `${comment.baseRef} -> ${comment.headRef}`,
      baseRef: comment.baseRef,
      headRef: comment.headRef,
    })
  }

  return Array.from(uniquePairs.values()).sort((left, right) =>
    left.label.localeCompare(right.label),
  )
}

export function filterCommentsByScope(
  comments: CommentItem[],
  contextFilter: ContextFilter,
  selectedPair: string | null,
): CommentItem[] {
  return comments.filter((comment) => {
    if (!contextFilterMatches(comment, contextFilter)) return false
    return reviewPairMatches(comment, selectedPair)
  })
}

export function filterCommentsBySearch(comments: CommentItem[], searchText: string): CommentItem[] {
  const query = searchText.trim().toLowerCase()
  if (!query) return comments
  return comments.filter((comment) => queryMatchesComment(comment, query))
}

export function filterCommentsByFile(
  comments: CommentItem[],
  selectedFilePath: string | null,
): CommentItem[] {
  if (!selectedFilePath) return comments
  return comments.filter((comment) => comment.filePath === selectedFilePath)
}

export function createFileFilterOptions(comments: CommentItem[]): FileFilterOption[] {
  const countsByFile = new Map<string, number>()

  for (const comment of comments) {
    countsByFile.set(comment.filePath, (countsByFile.get(comment.filePath) ?? 0) + 1)
  }

  return Array.from(countsByFile.entries())
    .map(([path, count]) => ({ path, count }))
    .sort((left, right) => left.path.localeCompare(right.path))
}

export function groupCommentsByFile(comments: CommentItem[]): CommentFileGroup[] {
  const grouped = new Map<string, CommentItem[]>()
  const sorted = [...comments].sort(compareCommentsForDisplay)

  for (const comment of sorted) {
    const existing = grouped.get(comment.filePath)
    if (existing) {
      existing.push(comment)
      continue
    }

    grouped.set(comment.filePath, [comment])
  }

  return Array.from(grouped.entries()).map(([path, fileComments]) => {
    let reviewCount = 0
    let changesCount = 0

    for (const comment of fileComments) {
      if (commentContextKind(comment) === 'review') {
        reviewCount += 1
      } else {
        changesCount += 1
      }
    }

    return {
      path,
      comments: fileComments,
      reviewCount,
      changesCount,
    }
  })
}

export function splitFilePath(path: string): { fileName: string; directoryPath: string } {
  const normalizedPath = path.replace(/\\/g, '/')
  const pathParts = normalizedPath.split('/').filter(Boolean)
  const fileName = pathParts[pathParts.length - 1] ?? path
  const directoryPath = pathParts.length > 1 ? pathParts.slice(0, -1).join('/') : ''

  return { fileName, directoryPath }
}

export function commentContextLabel(comment: CommentItem): string {
  if (commentContextKind(comment) === 'review' && comment.baseRef && comment.headRef) {
    return `${comment.baseRef} -> ${comment.headRef}`
  }

  return 'Changes'
}

export function isReviewComment(comment: CommentItem): boolean {
  return commentContextKind(comment) === 'review'
}
