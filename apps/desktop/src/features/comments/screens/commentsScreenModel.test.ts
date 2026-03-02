import { describe, expect, it } from 'vitest'

import type { CommentItem } from '@/features/source-control/types'

import {
  commentContextLabel,
  commentsForRepo,
  createFileFilterOptions,
  createReviewPairOptions,
  filterCommentsByFile,
  filterCommentsByScope,
  filterCommentsBySearch,
  groupCommentsByFile,
  reviewPairValue,
  splitFilePath,
} from '@/features/comments/screens/commentsScreenModel'

function comment(overrides: Partial<CommentItem>): CommentItem {
  return {
    id: overrides.id ?? 'comment-id',
    repoPath: overrides.repoPath ?? '/repo/a',
    filePath: overrides.filePath ?? 'src/main.ts',
    bucket: overrides.bucket ?? 'unstaged',
    startLine: overrides.startLine ?? 1,
    endLine: overrides.endLine ?? 1,
    side: overrides.side ?? 'additions',
    endSide: overrides.endSide,
    text: overrides.text ?? 'hello world',
    contextKind: overrides.contextKind,
    baseRef: overrides.baseRef,
    headRef: overrides.headRef,
  }
}

describe('commentsScreenModel', () => {
  it('builds deduped review pair options sorted by label', () => {
    const comments = [
      comment({
        id: '1',
        contextKind: 'review',
        baseRef: 'main',
        headRef: 'feature/a',
      }),
      comment({
        id: '2',
        contextKind: 'review',
        baseRef: 'develop',
        headRef: 'feature/z',
      }),
      comment({
        id: '3',
        contextKind: 'review',
        baseRef: 'main',
        headRef: 'feature/a',
      }),
      comment({ id: '4', contextKind: 'changes' }),
    ]

    const pairs = createReviewPairOptions(comments)

    expect(pairs).toHaveLength(2)
    expect(pairs.map((pair) => pair.value)).toEqual([
      reviewPairValue('develop', 'feature/z'),
      reviewPairValue('main', 'feature/a'),
    ])
  })

  it('filters comments by context, pair, search and file', () => {
    const source = [
      comment({ id: 'c1', filePath: 'src/a.ts', text: 'ship changes', contextKind: 'changes' }),
      comment({
        id: 'c2',
        filePath: 'src/b.ts',
        text: 'review me',
        contextKind: 'review',
        baseRef: 'main',
        headRef: 'feature/ui',
      }),
      comment({
        id: 'c3',
        filePath: 'src/c.ts',
        text: 'other review',
        contextKind: 'review',
        baseRef: 'develop',
        headRef: 'feature/api',
      }),
    ]

    const scoped = filterCommentsByScope(source, 'review', reviewPairValue('main', 'feature/ui'))
    const searched = filterCommentsBySearch(scoped, 'review')
    const fileScoped = filterCommentsByFile(searched, 'src/b.ts')

    expect(fileScoped.map((entry) => entry.id)).toEqual(['c2'])
  })

  it('builds file filters and groups with per-context counts', () => {
    const source = [
      comment({ id: '1', filePath: 'src/z.ts', startLine: 10, contextKind: 'changes' }),
      comment({ id: '2', filePath: 'src/a.ts', startLine: 4, contextKind: 'review', baseRef: 'main', headRef: 'feature/x' }),
      comment({ id: '3', filePath: 'src/a.ts', startLine: 2, contextKind: 'changes' }),
    ]

    const files = createFileFilterOptions(source)
    const groups = groupCommentsByFile(source)

    expect(files).toEqual([
      { path: 'src/a.ts', count: 2 },
      { path: 'src/z.ts', count: 1 },
    ])

    expect(groups).toHaveLength(2)
    expect(groups[0].path).toBe('src/a.ts')
    expect(groups[0].comments.map((entry) => entry.id)).toEqual(['3', '2'])
    expect(groups[0].changesCount).toBe(1)
    expect(groups[0].reviewCount).toBe(1)
  })

  it('derives repo comments, path split and context labels', () => {
    const source = [
      comment({ id: '1', repoPath: '/repo/a', filePath: 'src/main.ts' }),
      comment({
        id: '2',
        repoPath: '/repo/b',
        filePath: 'main.ts',
        contextKind: 'review',
        baseRef: 'main',
        headRef: 'feature/refactor',
      }),
    ]

    expect(commentsForRepo(source, '/repo/a').map((entry) => entry.id)).toEqual(['1'])
    expect(splitFilePath('src/main.ts')).toEqual({ fileName: 'main.ts', directoryPath: 'src' })
    expect(commentContextLabel(source[0])).toBe('Changes')
    expect(commentContextLabel(source[1])).toBe('main -> feature/refactor')
  })
})
