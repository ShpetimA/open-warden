export type ErrorCode = 'INVALID_INPUT' | 'INVALID_STATUS' | 'BACKEND' | 'UNAVAILABLE'

export type ApiError = {
  code: ErrorCode
  message: string
  details: string | null
}

export type Bucket = 'unstaged' | 'staged' | 'untracked'

export type FileStatus =
  | 'added'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'type-changed'
  | 'unmerged'
  | 'modified'
  | 'untracked'

export type DiffFile = {
  name: string
  contents: string
}

export type FileItem = {
  path: string
  previousPath: string | null
  status: FileStatus
}

export type FileVersions = {
  oldFile: DiffFile | null
  newFile: DiffFile | null
}

export type GitSnapshot = {
  repoRoot: string
  branch: string
  unstaged: FileItem[]
  staged: FileItem[]
  untracked: FileItem[]
}

export type HistoryCommit = {
  commitId: string
  shortId: string
  summary: string
  author: string
  relativeTime: string
}

export type DiscardFileInput = {
  relPath: string
  bucket: Bucket
}

export type ConfirmOptions = {
  title?: string
  kind?: 'info' | 'warning' | 'error'
  okLabel?: string
  cancelLabel?: string
}

export type DesktopApi = {
  selectFolder(): Promise<string | null>
  confirm(message: string, options?: ConfirmOptions): Promise<boolean>
  checkAppExists(appName: string): Promise<boolean>
  openPath(path: string, appName?: string | null): Promise<void>
  getGitSnapshot(repoPath: string): Promise<GitSnapshot>
  getCommitHistory(repoPath: string, limit?: number): Promise<HistoryCommit[]>
  getBranches(repoPath: string): Promise<string[]>
  getBranchFiles(repoPath: string, baseRef: string, headRef: string): Promise<FileItem[]>
  getCommitFiles(repoPath: string, commitId: string): Promise<FileItem[]>
  getCommitFileVersions(
    repoPath: string,
    commitId: string,
    relPath: string,
    previousPath?: string,
  ): Promise<FileVersions>
  getFileVersions(repoPath: string, relPath: string, bucket: Bucket): Promise<FileVersions>
  getBranchFileVersions(
    repoPath: string,
    baseRef: string,
    headRef: string,
    relPath: string,
    previousPath?: string,
  ): Promise<FileVersions>
  stageFile(repoPath: string, relPath: string): Promise<void>
  unstageFile(repoPath: string, relPath: string): Promise<void>
  stageAll(repoPath: string): Promise<void>
  unstageAll(repoPath: string): Promise<void>
  discardFile(repoPath: string, relPath: string, bucket: Bucket): Promise<void>
  discardFiles(repoPath: string, files: DiscardFileInput[]): Promise<void>
  discardAll(repoPath: string): Promise<void>
  commitStaged(repoPath: string, message: string): Promise<string>
}
