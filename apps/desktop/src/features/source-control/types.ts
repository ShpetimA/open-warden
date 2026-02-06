export type Bucket = 'unstaged' | 'staged' | 'untracked'

export type DiffStyle = 'split' | 'unified'

export type FileItem = {
  path: string
  status: string
}

export type SelectionRange = {
  start: number
  end: number
  side?: 'deletions' | 'additions'
  endSide?: 'deletions' | 'additions'
}

export type CommentItem = {
  id: string
  repoPath: string
  filePath: string
  bucket: Bucket
  startLine: number
  endLine: number
  side: 'deletions' | 'additions'
  endSide?: 'deletions' | 'additions'
  text: string
}

export type GitSnapshot = {
  repoRoot: string
  branch: string
  unstaged: FileItem[]
  staged: FileItem[]
  untracked: FileItem[]
}

export type DiffFile = {
  name: string
  contents: string
}

export type FileVersions = {
  oldFile: DiffFile | null
  newFile: DiffFile | null
}

export type RunningAction =
  | ''
  | 'stage-all'
  | 'unstage-all'
  | 'discard-changes'
  | 'commit'
  | `file:${string}`
