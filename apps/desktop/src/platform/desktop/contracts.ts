import type { GitCommand, GitRepositoryState, GitResult } from "./gitOperations";
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
  readonly name: string;
  readonly contents: string;
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

export type GitProviderId = "github" | "gitlab" | "bitbucket";

export type ProviderConnectionMethod = "pat";
export type ProviderAuthType = "basic" | "bearer";

export type ProviderConnection = {
  id: GitProviderId;
  providerId: GitProviderId;
  method: ProviderConnectionMethod;
  login: string;
  displayName: string | null;
  avatarUrl: string | null;
  scopes: string[];
  createdAt: string;
  updatedAt: string;
};

export type ConnectProviderInput = {
  providerId: GitProviderId;
  method: ProviderConnectionMethod;
  token: string;
  identifier?: string | null;
  authType?: ProviderAuthType | "auto";
};

export type HostedRepoRef = {
  providerId: GitProviderId;
  owner: string;
  repo: string;
  remoteName: string;
  remoteUrl: string;
  webUrl: string;
};

export type PullRequestState = "open" | "closed" | "merged";

export type PullRequestSummary = {
  id: string;
  providerId: GitProviderId;
  number: number;
  title: string;
  state: PullRequestState;
  isDraft: boolean;
  authorLogin: string;
  authorDisplayName: string | null;
  url: string;
  baseRef: string;
  headRef: string;
  headOwner: string;
  headRepo: string;
  updatedAt: string;
};

export type ListPullRequestsInput = {
  repoPath: string;
  page: number;
  perPage: number;
  state?: "open" | "merged" | "closed" | "all";
  query?: string;
  author?: string;
  involvement?: "all" | "mine";
};

export type ResolveActivePullRequestForBranchInput = {
  repoPath: string;
  branch: string;
};

export type PullRequestPage = {
  pullRequests: PullRequestSummary[];
  page: number;
  perPage: number;
  hasNextPage: boolean;
};

export type PullRequestPerson = {
  login: string;
  displayName: string | null;
  avatarUrl: string | null;
};

export type PullRequestDetail = {
  id: string;
  providerId: GitProviderId;
  number: number;
  title: string;
  body: string;
  state: PullRequestState;
  isDraft: boolean;
  url: string;
  author: PullRequestPerson | null;
  baseRef: string;
  headRef: string;
  baseSha: string;
  headSha: string;
  createdAt: string;
  updatedAt: string;
  labels: Array<{ name: string; description: string | null }>;
};

export type PullRequestIssueComment = {
  id: string;
  databaseId: number;
  body: string;
  createdAt: string;
  updatedAt: string;
  author: PullRequestPerson | null;
  url: string | null;
  reactions: Array<{
    content: "+1" | "-1" | "laugh" | "hooray" | "confused" | "heart" | "rocket" | "eyes";
    count: number;
  }>;
};

export type PullRequestReviewComment = {
  id: string;
  databaseId: number;
  body: string;
  createdAt: string;
  updatedAt: string;
  author: PullRequestPerson | null;
  path: string;
  line: number | null;
  startLine: number | null;
  url: string | null;
};

export type PullRequestReviewThread = {
  id: string;
  path: string;
  line: number | null;
  startLine: number | null;
  diffSide: "LEFT" | "RIGHT";
  isResolved: boolean;
  isOutdated: boolean;
  resolvedBy: PullRequestPerson | null;
  comments: PullRequestReviewComment[];
};

export type PullRequestConversation = {
  detail: PullRequestDetail;
  issueComments: PullRequestIssueComment[];
  reviewThreads: PullRequestReviewThread[];
};

export type PullRequestReviewer = PullRequestPerson & {
  id: string;
  state: "requested" | "approved" | "changes-requested" | "commented";
  reviewedAt: string | null;
};

export type PullRequestReviewOverview = {
  reviewers: PullRequestReviewer[];
  viewerLogin: string;
  canManageReviewers: boolean | null;
};

export type SetPullRequestReviewerInput = PullRequestLocatorInput & {
  reviewer: string;
  requested: boolean;
};

export type SubmitPullRequestReviewInput = PullRequestLocatorInput & {
  decision: "comment" | "approve" | "request-changes";
  body: string;
  comments: PullRequestReviewDraftCommentInput[];
  expectedHeadSha: string;
};

export type SubmitPullRequestReviewResult = {
  submittedDraftIds: string[];
  decisionSubmitted: boolean;
  failedMessage: string | null;
};

export type PullRequestLifecycleInput = PullRequestLocatorInput & {
  expectedHeadSha: string;
} & (
    | { action: "edit"; title: string; body: string; expectedTitle: string; expectedBody: string }
    | { action: "close" | "reopen" | "draft" | "ready" | "update-branch" | "revert" }
    | { action: "auto-merge"; method: "merge" | "squash" | "rebase" }
  );

export type PullRequestLifecycleResult = { createdPullRequestUrl: string | null };

export type PullRequestViewedFiles = {
  storage: "provider" | "device";
  viewedPaths: string[];
  truncated: boolean;
};

export type SetPullRequestFileViewedInput = PullRequestLocatorInput & {
  path: string;
  viewed: boolean;
};

export type PullRequestActivityEvent =
  | "approved"
  | "changes-requested"
  | "reviewed"
  | "review-requested"
  | "review-request-removed"
  | "force-pushed"
  | "ready"
  | "draft"
  | "merged"
  | "closed"
  | "reopened"
  | "renamed"
  | "edited"
  | "labeled"
  | "unlabeled"
  | "assigned"
  | "unassigned"
  | "auto-merge-enabled"
  | "auto-merge-disabled";

export type PullRequestActivityItem = {
  id: string;
  actor: PullRequestPerson | null;
  occurredAt: string;
  url: string | null;
} & (
  | {
      kind: "event";
      event: PullRequestActivityEvent;
      /** Event specifics: the old and new title, a label name, the person asked to review. */
      detail: string | null;
      /** A review's summary, when the event is one. */
      body: string | null;
    }
  | { kind: "commit"; commitSha: string; message: string }
);

export type PullRequestActivity = {
  items: PullRequestActivityItem[];
  truncated: boolean;
};

export type PullRequestCheckState = "passed" | "failed" | "pending";

export type PullRequestCheck = {
  id: string;
  name: string;
  description: string | null;
  state: PullRequestCheckState;
  url: string | null;
};

export type PullRequestChecksResult = {
  headSha: string;
  checks: PullRequestCheck[];
  complete: boolean;
  mergeability: "mergeable" | "conflicting" | "unknown";
};

export type PullRequestLabel = { name: string; description: string | null };
export type PullRequestWorkflowRun = {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  url: string;
  attempt: number;
};
export type PullRequestStackLink = {
  number: number;
  title: string;
  relationship: "parent" | "child";
};

export type GitBlameLine = {
  line: number;
  commitId: string;
  author: string;
  authoredAt: string | null;
  summary: string;
};
export type GitBlameResult = { lines: GitBlameLine[]; truncated: boolean };
export type PullRequestExtras = {
  providerId: GitProviderId;
  labelsAvailable: boolean;
  workflowsAvailable: boolean;
  stackAvailable: boolean;
  availableLabels: PullRequestLabel[];
  workflowRuns: PullRequestWorkflowRun[];
  stack: PullRequestStackLink[];
  stackCandidates: Array<{ number: number; title: string }>;
  truncated: boolean;
};
export type SetPullRequestLabelsInput = PullRequestLocatorInput & {
  labels: string[];
  expectedLabels: string[];
  expectedHeadSha: string;
};
export type RerunPullRequestWorkflowInput = PullRequestLocatorInput & {
  runId: number;
  expectedHeadSha: string;
};
export type AddPullRequestReactionInput = PullRequestLocatorInput & {
  commentId: number;
  content: PullRequestIssueComment["reactions"][number]["content"];
};

export type PullRequestChangedFile = {
  path: string;
  previousPath: string | null;
  status: Exclude<FileStatus, "untracked" | "type-changed" | "unmerged">;
  additions: number;
  deletions: number;
};

export type PullRequestOpenMode = "branch" | "worktree";

export type PullRequestCompareRefs = {
  providerId: GitProviderId;
  owner: string;
  repo: string;
  pullRequestNumber: number;
  baseRef: string;
  headRef: string;
  compareBaseRef: string;
  compareHeadRef: string;
  localBranch: string;
};

export type PreparePullRequestWorkspaceInput = {
  repoPath: string;
  pullRequestNumber: number;
  openMode?: PullRequestOpenMode;
};

export type PullRequestLocatorInput = {
  repoPath: string;
  pullRequestNumber: number;
};

export type AddPullRequestCommentInput = PullRequestLocatorInput & {
  body: string;
};

export type CreatePullRequestInput = {
  repoPath: string;
  title: string;
  body: string;
  baseRef: string;
  headRef: string;
};

export type SubmitPullRequestDecisionInput = PullRequestLocatorInput & {
  decision: "approve" | "request-changes";
  body: string;
};

export type MergePullRequestInput = PullRequestLocatorInput & {
  method: "merge" | "squash" | "rebase";
  expectedHeadSha: string;
};

export type ReplyToPullRequestThreadInput = PullRequestLocatorInput & {
  threadId: string;
  body: string;
};

export type PullRequestReviewDraftCommentInput = {
  draftId: string;
  path: string;
  body: string;
  line: number;
  side: "LEFT" | "RIGHT";
  startLine?: number | null;
  startSide?: "LEFT" | "RIGHT" | null;
};

export type SubmitPullRequestReviewCommentsInput = PullRequestLocatorInput & {
  comments: PullRequestReviewDraftCommentInput[];
};

export type SubmitPullRequestReviewCommentsResult = {
  submittedDraftIds: string[];
  failedDraftId: string | null;
  failedMessage: string | null;
};

export type SetPullRequestThreadResolvedInput = PullRequestLocatorInput & {
  threadId: string;
  resolved: boolean;
};

export type PreparedPullRequestWorkspace = {
  providerId: GitProviderId;
  repoPath: string;
  worktreePath: string;
  owner: string;
  repo: string;
  pullRequestNumber: number;
  title: string;
  baseRef: string;
  headRef: string;
  compareBaseRef: string;
  compareHeadRef: string;
  localBranch: string;
  hostedRepo: HostedRepoRef;
};

export type WorkspaceSession = {
  workspaceTabs?: import("./workspaceTabs").PersistedWorkspaceTabs;
  openRepos: string[];
  activeRepo: string;
  recentRepos: string[];
};

export type FileTreeRenderMode = "tree" | "list";

export type LspServerSettings = {
  command: string;
  args: string[];
  extensions?: string[];
};

export type LspSettings = {
  servers: Record<string, LspServerSettings>;
};

export type AppSettings = {
  version: 1;
  sourceControl: {
    fileTreeRenderMode: FileTreeRenderMode;
  };
  lsp: LspSettings;
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
  getGitStashPatch(repoPath: string, oid: string): Promise<GitResult<string>>;
  getGitRepositoryState(repoPath: string): Promise<GitResult<GitRepositoryState>>;
  runGitCommand(repoPath: string, command: GitCommand): Promise<GitResult<string>>;
  browseDirectory(path: string): Promise<DirectoryListing>;
  selectFolder(): Promise<string | null>;
  loadWorkspaceSession(): Promise<WorkspaceSession>;
  saveWorkspaceSession(session: WorkspaceSession): Promise<WorkspaceSession>;
  loadAppSettings(): Promise<AppSettings>;
  saveAppSettings(settings: AppSettings): Promise<AppSettings>;
  getAppSettingsPath(): Promise<string>;
  confirm(message: string, options?: ConfirmOptions): Promise<boolean>;
  checkAppExists(appName: string): Promise<boolean>;
  openPath(path: string, appName?: string | null): Promise<void>;
  listProviderConnections(): Promise<ProviderConnection[]>;
  connectProvider(input: ConnectProviderInput): Promise<ProviderConnection>;
  disconnectProvider(providerId: GitProviderId): Promise<void>;
  resolveHostedRepo(repoPath: string): Promise<HostedRepoRef | null>;
  listPullRequests(input: ListPullRequestsInput): Promise<PullRequestPage>;
  resolveActivePullRequestForBranch(
    input: ResolveActivePullRequestForBranchInput,
  ): Promise<PullRequestSummary | null>;
  getPullRequestConversation(input: PullRequestLocatorInput): Promise<PullRequestConversation>;
  getPullRequestReviewOverview(input: PullRequestLocatorInput): Promise<PullRequestReviewOverview>;
  setPullRequestReviewer(input: SetPullRequestReviewerInput): Promise<void>;
  submitPullRequestReview(
    input: SubmitPullRequestReviewInput,
  ): Promise<SubmitPullRequestReviewResult>;
  runPullRequestLifecycle(input: PullRequestLifecycleInput): Promise<PullRequestLifecycleResult>;
  getPullRequestViewedFiles(input: PullRequestLocatorInput): Promise<PullRequestViewedFiles>;
  setPullRequestFileViewed(input: SetPullRequestFileViewedInput): Promise<void>;
  getPullRequestActivity(input: PullRequestLocatorInput): Promise<PullRequestActivity>;
  getPullRequestChecks(input: PullRequestLocatorInput): Promise<PullRequestChecksResult>;
  getPullRequestExtras(input: PullRequestLocatorInput): Promise<PullRequestExtras>;
  setPullRequestLabels(input: SetPullRequestLabelsInput): Promise<void>;
  rerunPullRequestWorkflow(input: RerunPullRequestWorkflowInput): Promise<void>;
  cancelPullRequestWorkflow(input: RerunPullRequestWorkflowInput): Promise<void>;
  addPullRequestReaction(input: AddPullRequestReactionInput): Promise<void>;
  getPullRequestFiles(input: PullRequestLocatorInput): Promise<PullRequestChangedFile[]>;
  getPullRequestPatch(input: PullRequestLocatorInput): Promise<string>;
  addPullRequestComment(input: AddPullRequestCommentInput): Promise<PullRequestIssueComment>;
  createPullRequest(input: CreatePullRequestInput): Promise<PullRequestSummary>;
  submitPullRequestDecision(input: SubmitPullRequestDecisionInput): Promise<void>;
  mergePullRequest(input: MergePullRequestInput): Promise<"merged" | "queued">;
  replyToPullRequestThread(input: ReplyToPullRequestThreadInput): Promise<PullRequestReviewThread>;
  submitPullRequestReviewComments(
    input: SubmitPullRequestReviewCommentsInput,
  ): Promise<SubmitPullRequestReviewCommentsResult>;
  setPullRequestThreadResolved(
    input: SetPullRequestThreadResolvedInput,
  ): Promise<PullRequestReviewThread>;
  preparePullRequestCompareRefs(input: PullRequestLocatorInput): Promise<PullRequestCompareRefs>;
  preparePullRequestFromUrl(url: string): Promise<PreparedPullRequestWorkspace>;
  preparePullRequestWorkspace(
    input: PreparePullRequestWorkspaceInput,
  ): Promise<PreparedPullRequestWorkspace>;
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
  updateIndexFileContents(repoPath: string, relPath: string, contents: string): Promise<void>;
  updateWorktreeFileContents(repoPath: string, relPath: string, contents: string): Promise<void>;
  stageAll(repoPath: string): Promise<void>;
  unstageAll(repoPath: string): Promise<void>;
  discardFile(repoPath: string, relPath: string, bucket: Bucket): Promise<void>;
  discardFiles(repoPath: string, files: DiscardFileInput[]): Promise<void>;
  discardAll(repoPath: string): Promise<void>;
  commitStaged(repoPath: string, message: string): Promise<string>;
  getRepoFile(input: GetRepoFileInput): Promise<DiffFile | null>;
  getGitBlame(repoPath: string, relPath: string, revision?: string | null): Promise<GitBlameResult>;
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

export type DesktopSettingsApi = {
  onAppSettingsChanged(listener: (settings: AppSettings) => void): () => void;
};

export type DesktopBridge = DesktopApi & DesktopUpdateApi & DesktopLspApi & DesktopSettingsApi;

export type DirectoryListing =
  | { ok: true; path: string; parentPath: string; entries: { name: string; path: string }[] }
  | { ok: false; message: string };
