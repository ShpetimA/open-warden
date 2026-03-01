import type { Bucket, FileStatus } from '@/features/source-control/types'

export type CommandSection = 'actions' | 'files' | 'history'

type CommandItemBase = {
  id: string
  label: string
  searchText: string
  subtitle?: string
  shortcut?: string
  disabled?: boolean
}

export type CommandActionItem = CommandItemBase & {
  section: 'actions'
  onSelect: () => void | Promise<void>
}

export type CommandFileItem = CommandItemBase & {
  section: 'files'
  path: string
  status: FileStatus
  bucket?: Bucket
  onSelect: () => void | Promise<void>
}

export type CommandCommitItem = CommandItemBase & {
  section: 'history'
  commitId: string
  shortId: string
  onSelect: () => void | Promise<void>
}

export type CommandItem = CommandActionItem | CommandFileItem | CommandCommitItem
