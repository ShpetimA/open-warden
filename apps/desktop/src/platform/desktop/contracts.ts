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

export type RepoFileItem = {
  path: string;
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

export type SyncLspDocumentInput = {
  repoPath: string;
  relPath: string;
  text: string;
};

export type CloseLspDocumentInput = {
  repoPath: string;
  relPath: string;
};

export type GetLspHoverInput = {
  repoPath: string;
  relPath: string;
  line: number;
  character: number;
};

export type GetLspReferencesInput = GetLspHoverInput & {
  includeDeclaration?: boolean;
};

export type GetRepoFileInput = {
  repoPath: string;
  relPath: string;
  revision?: string | null;
};

export type LspDiagnosticSeverity = "error" | "warning" | "information" | "hint";

export type LspDiagnostic = {
  message: string;
  severity: LspDiagnosticSeverity;
  source: string | null;
  code: string | null;
  startLine: number;
  startCharacter: number;
  endLine: number;
  endCharacter: number;
};

export type LspDiagnosticsEvent = {
  repoPath: string;
  relPath: string;
  languageId: string | null;
  diagnostics: LspDiagnostic[];
  reason: string | null;
};

export type LspHoverResult = {
  text: string;
};

export type LspLocation = {
  repoPath: string;
  relPath: string;
  uri: string;
  line: number;
  character: number;
  endLine: number;
  endCharacter: number;
};

export type DesktopApi = {
  selectFolder(): Promise<string | null>;
  loadWorkspaceSession(): Promise<WorkspaceSession>;
  saveWorkspaceSession(session: WorkspaceSession): Promise<WorkspaceSession>;
  confirm(message: string, options?: ConfirmOptions): Promise<boolean>;
  checkAppExists(appName: string): Promise<boolean>;
  openPath(path: string, appName?: string | null): Promise<void>;
  getGitSnapshot(repoPath: string): Promise<GitSnapshot>;
  getRepoFiles(repoPath: string): Promise<RepoFileItem[]>;
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
  getRepoFile(input: GetRepoFileInput): Promise<DiffFile | null>;
  syncLspDocument(input: SyncLspDocumentInput): Promise<void>;
  closeLspDocument(input: CloseLspDocumentInput): Promise<void>;
  getLspHover(input: GetLspHoverInput): Promise<LspHoverResult | null>;
  getLspDefinition(input: GetLspHoverInput): Promise<LspLocation[]>;
  getLspReferences(input: GetLspReferencesInput): Promise<LspLocation[]>;
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

export type DesktopLspApi = {
  onLspDiagnostics(listener: (event: LspDiagnosticsEvent) => void): () => void;
};

export type DesktopBridge = DesktopApi & DesktopUpdateApi & DesktopLspApi;
