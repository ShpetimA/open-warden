import type { Bucket, FileStatus } from '@/features/source-control/types'

import type { CommandActionItem, CommandCommitItem, CommandFileItem } from './commandPaletteTypes'

type ActionCandidate = {
  id: string
  label: string
  subtitle?: string
  shortcut?: string
  keywords?: string[]
  disabled?: boolean
  onSelect: () => void | Promise<void>
}

type FileCandidate = {
  path: string
  status: FileStatus
  bucket?: Bucket
  secondaryLabel?: string
  keywords?: string[]
  disabled?: boolean
  onSelect: () => void | Promise<void>
}

type CommitCandidate = {
  commitId: string
  shortId: string
  summary: string
  author: string
  relativeTime: string
  keywords?: string[]
  disabled?: boolean
  onSelect: () => void | Promise<void>
}

export function splitCommandPath(path: string) {
  const normalizedPath = path.replace(/\\/g, '/')
  const parts = normalizedPath.split('/').filter(Boolean)
  const fileName = parts[parts.length - 1] ?? path
  const directoryPath = parts.length > 1 ? parts.slice(0, -1).join('/') : ''
  return { fileName, directoryPath }
}

function actionSearchText(item: ActionCandidate): string {
  return [item.label, item.subtitle, ...(item.keywords ?? [])].filter(Boolean).join(' ')
}

function fileSearchText(item: FileCandidate): string {
  return [item.path, item.secondaryLabel, ...(item.keywords ?? [])].filter(Boolean).join(' ')
}

function commitSearchText(item: CommitCandidate): string {
  return [item.summary, item.shortId, item.commitId, item.author, ...(item.keywords ?? [])]
    .filter(Boolean)
    .join(' ')
}

export function buildCommandActionItems(items: ActionCandidate[]): CommandActionItem[] {
  return items.map((item) => ({
    id: item.id,
    section: 'actions',
    label: item.label,
    subtitle: item.subtitle,
    shortcut: item.shortcut,
    disabled: item.disabled,
    searchText: actionSearchText(item),
    onSelect: item.onSelect,
  }))
}

export function buildCommandFileItems(items: FileCandidate[]): CommandFileItem[] {
  return items.map((item) => {
    const pathParts = splitCommandPath(item.path)
    const subtitle = item.secondaryLabel
      ? `${pathParts.directoryPath || 'root'} · ${item.secondaryLabel}`
      : pathParts.directoryPath || 'root'

    return {
      id: `file:${item.bucket ?? 'none'}:${item.path}`,
      section: 'files',
      label: pathParts.fileName,
      subtitle,
      searchText: fileSearchText(item),
      path: item.path,
      status: item.status,
      bucket: item.bucket,
      disabled: item.disabled,
      onSelect: item.onSelect,
    }
  })
}

export function buildCommandCommitItems(items: CommitCandidate[]): CommandCommitItem[] {
  return items.map((item) => ({
    id: `commit:${item.commitId}`,
    section: 'history',
    label: item.summary || '(no commit message)',
    subtitle: `${item.shortId} · ${item.author || 'Unknown'} · ${item.relativeTime}`,
    searchText: commitSearchText(item),
    commitId: item.commitId,
    shortId: item.shortId,
    disabled: item.disabled,
    onSelect: item.onSelect,
  }))
}
