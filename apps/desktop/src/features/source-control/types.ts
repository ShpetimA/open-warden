import type {
  Bucket as ContractBucket,
  DiffFile as ContractDiffFile,
  FileItem as ContractFileItem,
  FileStatus as ContractFileStatus,
  FileVersions as ContractFileVersions,
  GitSnapshot as ContractGitSnapshot,
  HistoryCommit as ContractHistoryCommit,
} from '@/bindings'

export type Bucket = ContractBucket

export type FileStatus = ContractFileStatus

export type HistoryNavTarget = 'commits' | 'files'

export type DiffStyle = 'split' | 'unified'

export type FileItem = ContractFileItem

export type BucketedFile = FileItem & { bucket: Bucket }

export type SelectedFile = {
  bucket: Bucket
  path: string
}

export type HistoryCommit = ContractHistoryCommit

export type SelectionRange = {
  start: number
  end: number
  side?: 'deletions' | 'additions'
  endSide?: 'deletions' | 'additions'
}

export type CommentContext =
  | { kind: 'changes' }
  | { kind: 'review'; baseRef: string; headRef: string }

export type CommentItem = {
  type: 'annotation'
  id: string
  repoPath: string
  filePath: string
  bucket: Bucket
  startLine: number
  endLine: number
  side: 'deletions' | 'additions'
  endSide?: 'deletions' | 'additions'
  text: string
  contextKind?: CommentContext['kind']
  baseRef?: string
  headRef?: string
}

export type ComposerAnnotation = {
  type: 'composer'
  side: 'deletions' | 'additions'
  endSide?: 'deletions' | 'additions'
  startLine: number
  endLine: number
}

export type DiffAnnotationItem = CommentItem | ComposerAnnotation

export type GitSnapshot = ContractGitSnapshot

export type DiffFile = ContractDiffFile

export type FileVersions = ContractFileVersions

export type RunningAction =
  | ''
  | 'stage-all'
  | 'unstage-all'
  | 'discard-changes'
  | 'commit'
  | `file:stage:${string}`
  | `file:unstage:${string}`
  | `file:discard:${string}`
