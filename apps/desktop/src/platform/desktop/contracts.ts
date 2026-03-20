export type ErrorCode = "INVALID_INPUT" | "INVALID_STATUS" | "BACKEND" | "UNAVAILABLE";

export type ApiError = {
  code: ErrorCode;
  message: string;
  details: string | null;
};

export type Bucket = "unstaged" | "staged" | "untracked";

export type FileStatus =
  | "added"
  | "deleted"
  | "renamed"
  | "copied"
  | "type-changed"
  | "unmerged"
  | "modified"
  | "untracked";

export type DiffFile = {
  name: string;
  contents: string;
};

export type FileItem = {
  path: string;
  previousPath: string | null;
  status: FileStatus;
};

export type FileVersions = {
  oldFile: DiffFile | null;
  newFile: DiffFile | null;
};

export type GitSnapshot = {
  repoRoot: string;
  branch: string;
  unstaged: FileItem[];
  staged: FileItem[];
  untracked: FileItem[];
};

export type HistoryCommit = {
  commitId: string;
  shortId: string;
  summary: string;
  author: string;
  relativeTime: string;
};

export type DiscardFileInput = {
  relPath: string;
  bucket: Bucket;
};

export type ConfirmOptions = {
  title?: string;
  kind?: "info" | "warning" | "error";
  okLabel?: string;
  cancelLabel?: string;
};

export type WorkspaceSession = {
  openRepos: string[];
  activeRepo: string;
  recentRepos: string[];
};

export type DesktopApi = {
  selectFolder(): Promise<string | null>;
  loadWorkspaceSession(): Promise<WorkspaceSession>;
  saveWorkspaceSession(session: WorkspaceSession): Promise<WorkspaceSession>;
  confirm(message: string, options?: ConfirmOptions): Promise<boolean>;
  checkAppExists(appName: string): Promise<boolean>;
  openPath(path: string, appName?: string | null): Promise<void>;
  getGitSnapshot(repoPath: string): Promise<GitSnapshot>;
  getCommitHistory(repoPath: string, limit?: number): Promise<HistoryCommit[]>;
  getBranches(repoPath: string): Promise<string[]>;
  getBranchFiles(repoPath: string, baseRef: string, headRef: string): Promise<FileItem[]>;
  getCommitFiles(repoPath: string, commitId: string): Promise<FileItem[]>;
  getCommitFileVersions(
    repoPath: string,
    commitId: string,
    relPath: string,
    previousPath?: string,
  ): Promise<FileVersions>;
  getFileVersions(repoPath: string, relPath: string, bucket: Bucket): Promise<FileVersions>;
  getBranchFileVersions(
    repoPath: string,
    baseRef: string,
    headRef: string,
    relPath: string,
    previousPath?: string,
  ): Promise<FileVersions>;
  stageFile(repoPath: string, relPath: string): Promise<void>;
  unstageFile(repoPath: string, relPath: string): Promise<void>;
  stageAll(repoPath: string): Promise<void>;
  unstageAll(repoPath: string): Promise<void>;
  discardFile(repoPath: string, relPath: string, bucket: Bucket): Promise<void>;
  discardFiles(repoPath: string, files: DiscardFileInput[]): Promise<void>;
  discardAll(repoPath: string): Promise<void>;
  commitStaged(repoPath: string, message: string): Promise<string>;
};

export type DesktopUpdateStatus =
  | "disabled"
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "downloaded"
  | "up-to-date"
  | "error";

export type DesktopUpdateErrorContext = "check" | "download" | "install" | null;

export type DesktopUpdateState = {
  enabled: boolean;
  status: DesktopUpdateStatus;
  currentVersion: string;
  availableVersion: string | null;
  downloadedVersion: string | null;
  checkedAt: string | null;
  downloadPercent: number | null;
  message: string | null;
  errorContext: DesktopUpdateErrorContext;
  canRetry: boolean;
  disabledReason: string | null;
};

export type DesktopUpdateActionResult = {
  accepted: boolean;
  completed: boolean;
  state: DesktopUpdateState;
};

export type DesktopUpdateApi = {
  getUpdateState(): Promise<DesktopUpdateState>;
  checkForUpdates(): Promise<DesktopUpdateActionResult>;
  downloadUpdate(): Promise<DesktopUpdateActionResult>;
  installUpdate(): Promise<DesktopUpdateActionResult>;
  onUpdateState(listener: (state: DesktopUpdateState) => void): () => void;
};

export type DesktopBridge = DesktopApi & DesktopUpdateApi;
