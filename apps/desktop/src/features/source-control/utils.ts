import type { FileStatus, GitSnapshot, SelectionRange } from './types'

export function repoLabel(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  const parts = normalized.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? path
}

export function findExistingBucket(snapshot: GitSnapshot, path: string) {
  if (snapshot.unstaged.some((x) => x.path === path)) return 'unstaged' as const
  if (snapshot.staged.some((x) => x.path === path)) return 'staged' as const
  if (snapshot.untracked.some((x) => x.path === path)) return 'untracked' as const
  return null
}

export function normalizeRange(range: SelectionRange): { start: number; end: number } {
  return {
    start: Math.min(range.start, range.end),
    end: Math.max(range.start, range.end),
  }
}

export function formatRange(startLine: number, endLine: number): string {
  return startLine === endLine ? `L${startLine}` : `L${startLine}-${endLine}`
}

export function statusBadge(status: FileStatus): string {
  if (status === 'added' || status === 'untracked') return 'A'
  if (status === 'deleted') return 'D'
  if (status === 'renamed') return 'R'
  if (status === 'copied') return 'C'
  if (status === 'type-changed') return 'T'
  if (status === 'unmerged') return 'U'
  return 'M'
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return !!target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]')
}

export function parseSelectionRange(value: unknown): SelectionRange | null {
  if (!value || typeof value !== 'object') return null

  const maybe = value as Partial<SelectionRange>
  if (typeof maybe.start !== 'number' || typeof maybe.end !== 'number') return null

  return {
    start: maybe.start,
    end: maybe.end,
    side: maybe.side === 'deletions' ? 'deletions' : 'additions',
    endSide: maybe.endSide === 'deletions' ? 'deletions' : 'additions',
  }
}

export function areRangesEqual(a: SelectionRange | null, b: SelectionRange | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return a.start === b.start && a.end === b.end && a.side === b.side && a.endSide === b.endSide
}
