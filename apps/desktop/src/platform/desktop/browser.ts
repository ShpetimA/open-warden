import type {
  Bucket,
  CloseLspDocumentInput,
  ConfirmOptions,
  DesktopBridge,
  DesktopUpdateActionResult,
  DesktopUpdateState,
  DiscardFileInput,
  GetLspHoverInput,
  GetLspReferencesInput,
  GetRepoFileInput,
  SyncLspDocumentInput,
  FileItem,
  FileVersions,
  GitSnapshot,
  HistoryCommit,
  LspHoverResult,
  LspLocation,
  RepoFileItem,
  WorkspaceSession,
} from "./contracts";
import { desktopRuntimeUnavailable, unsupportedInBrowser } from "./errors";
import { createWorkspaceSession } from "./workspaceSession";

const WORKSPACE_SESSION_STORAGE_KEY = "open-warden.workspace-session";

function createDisabledUpdateState(reason: string): DesktopUpdateState {
  return {
    enabled: false,
    status: "disabled",
    currentVersion: "0.0.0",
    availableVersion: null,
    downloadedVersion: null,
    checkedAt: null,
    downloadPercent: null,
    message: null,
    errorContext: null,
    canRetry: false,
    disabledReason: reason,
  };
}

function createRejectedUpdateActionResult(reason: string): DesktopUpdateActionResult {
  return {
    accepted: false,
    completed: false,
    state: createDisabledUpdateState(reason),
  };
}

function unsupported(feature: string): never {
  throw unsupportedInBrowser(feature);
}

async function unsupportedAsync<T>(feature: string): Promise<T> {
  unsupported(feature);
}

function readBrowserDirectorySelectionError(): Error {
  return unsupportedInBrowser("Repository selection");
}

function readStoredWorkspaceSession(): WorkspaceSession {
  if (typeof window === "undefined") {
    return createWorkspaceSession();
  }

  try {
    const storedValue = window.localStorage.getItem(WORKSPACE_SESSION_STORAGE_KEY);
    if (!storedValue) {
      return createWorkspaceSession();
    }

    return createWorkspaceSession(JSON.parse(storedValue));
  } catch {
    return createWorkspaceSession();
  }
}

function writeStoredWorkspaceSession(session: WorkspaceSession): WorkspaceSession {
  const normalizedSession = createWorkspaceSession(session);

  if (typeof window !== "undefined") {
    window.localStorage.setItem(WORKSPACE_SESSION_STORAGE_KEY, JSON.stringify(normalizedSession));
  }

  return normalizedSession;
}

export const browserDesktopApi: DesktopBridge = {
  async selectFolder() {
    throw readBrowserDirectorySelectionError();
  },
  async loadWorkspaceSession() {
    return readStoredWorkspaceSession();
  },
  async saveWorkspaceSession(session: WorkspaceSession) {
    return writeStoredWorkspaceSession(session);
  },
  async confirm(message: string, _options?: ConfirmOptions) {
    return window.confirm(message);
  },
  async checkAppExists(_appName: string) {
    return false;
  },
  async openPath(_path: string, _appName?: string | null) {
    unsupported("Opening local paths");
  },
  async getGitSnapshot(_repoPath: string): Promise<GitSnapshot> {
    return unsupportedAsync("Git snapshot loading");
  },
  async getRepoFiles(_repoPath: string): Promise<RepoFileItem[]> {
    return unsupportedAsync("Repository file listing");
  },
  async getCommitHistory(_repoPath: string, _limit?: number): Promise<HistoryCommit[]> {
    return unsupportedAsync("Commit history loading");
  },
  async getBranches(_repoPath: string) {
    return unsupportedAsync<string[]>("Branch listing");
  },
  async getBranchFiles(_repoPath: string, _baseRef: string, _headRef: string): Promise<FileItem[]> {
    return unsupportedAsync("Branch file listing");
  },
  async getCommitFiles(_repoPath: string, _commitId: string): Promise<FileItem[]> {
    return unsupportedAsync("Commit file listing");
  },
  async getCommitFileVersions(
    _repoPath: string,
    _commitId: string,
    _relPath: string,
    _previousPath?: string,
  ): Promise<FileVersions> {
    return unsupportedAsync("Commit file diff loading");
  },
  async getFileVersions(
    _repoPath: string,
    _relPath: string,
    _bucket: Bucket,
  ): Promise<FileVersions> {
    return unsupportedAsync("Working tree diff loading");
  },
  async getBranchFileVersions(
    _repoPath: string,
    _baseRef: string,
    _headRef: string,
    _relPath: string,
    _previousPath?: string,
  ): Promise<FileVersions> {
    return unsupportedAsync("Branch file diff loading");
  },
  async stageFile(_repoPath: string, _relPath: string) {
    unsupported("Staging files");
  },
  async unstageFile(_repoPath: string, _relPath: string) {
    unsupported("Unstaging files");
  },
  async stageAll(_repoPath: string) {
    unsupported("Staging all files");
  },
  async unstageAll(_repoPath: string) {
    unsupported("Unstaging all files");
  },
  async discardFile(_repoPath: string, _relPath: string, _bucket: Bucket) {
    unsupported("Discarding file changes");
  },
  async discardFiles(_repoPath: string, _files: DiscardFileInput[]) {
    unsupported("Discarding file changes");
  },
  async discardAll(_repoPath: string) {
    unsupported("Discarding all changes");
  },
  async commitStaged(_repoPath: string, _message: string) {
    return unsupportedAsync<string>("Creating commits");
  },
  async getRepoFile(_input: GetRepoFileInput) {
    return null;
  },
  async syncLspDocument(_input: SyncLspDocumentInput) {},
  async closeLspDocument(_input: CloseLspDocumentInput) {},
  async getLspHover(_input: GetLspHoverInput): Promise<LspHoverResult | null> {
    return null;
  },
  async getLspDefinition(_input: GetLspHoverInput): Promise<LspLocation[]> {
    return [];
  },
  async getLspReferences(_input: GetLspReferencesInput): Promise<LspLocation[]> {
    return [];
  },
  async getUpdateState() {
    return createDisabledUpdateState("Automatic updates are only available in desktop builds.");
  },
  async checkForUpdates() {
    return createRejectedUpdateActionResult(
      "Automatic updates are only available in desktop builds.",
    );
  },
  async downloadUpdate() {
    return createRejectedUpdateActionResult(
      "Automatic updates are only available in desktop builds.",
    );
  },
  async installUpdate() {
    return createRejectedUpdateActionResult(
      "Automatic updates are only available in desktop builds.",
    );
  },
  onUpdateState() {
    return () => {};
  },
  onLspDiagnostics() {
    return () => {};
  },
};

function unavailable(): never {
  throw desktopRuntimeUnavailable();
}

async function unavailableAsync<T>(): Promise<T> {
  unavailable();
}

export const unavailableDesktopApi: DesktopBridge = {
  async selectFolder() {
    unavailable();
  },
  async loadWorkspaceSession() {
    return createWorkspaceSession();
  },
  async saveWorkspaceSession(session: WorkspaceSession) {
    return createWorkspaceSession(session);
  },
  async confirm(_message: string, _options?: ConfirmOptions) {
    return unavailableAsync<boolean>();
  },
  async checkAppExists(_appName: string) {
    return unavailableAsync<boolean>();
  },
  async openPath(_path: string, _appName?: string | null) {
    unavailable();
  },
  async getGitSnapshot(_repoPath: string): Promise<GitSnapshot> {
    return unavailableAsync();
  },
  async getRepoFiles(_repoPath: string): Promise<RepoFileItem[]> {
    return unavailableAsync();
  },
  async getCommitHistory(_repoPath: string, _limit?: number): Promise<HistoryCommit[]> {
    return unavailableAsync();
  },
  async getBranches(_repoPath: string) {
    return unavailableAsync<string[]>();
  },
  async getBranchFiles(_repoPath: string, _baseRef: string, _headRef: string): Promise<FileItem[]> {
    return unavailableAsync();
  },
  async getCommitFiles(_repoPath: string, _commitId: string): Promise<FileItem[]> {
    return unavailableAsync();
  },
  async getCommitFileVersions(
    _repoPath: string,
    _commitId: string,
    _relPath: string,
    _previousPath?: string,
  ): Promise<FileVersions> {
    return unavailableAsync();
  },
  async getFileVersions(
    _repoPath: string,
    _relPath: string,
    _bucket: Bucket,
  ): Promise<FileVersions> {
    return unavailableAsync();
  },
  async getBranchFileVersions(
    _repoPath: string,
    _baseRef: string,
    _headRef: string,
    _relPath: string,
    _previousPath?: string,
  ): Promise<FileVersions> {
    return unavailableAsync();
  },
  async stageFile(_repoPath: string, _relPath: string) {
    unavailable();
  },
  async unstageFile(_repoPath: string, _relPath: string) {
    unavailable();
  },
  async stageAll(_repoPath: string) {
    unavailable();
  },
  async unstageAll(_repoPath: string) {
    unavailable();
  },
  async discardFile(_repoPath: string, _relPath: string, _bucket: Bucket) {
    unavailable();
  },
  async discardFiles(_repoPath: string, _files: DiscardFileInput[]) {
    unavailable();
  },
  async discardAll(_repoPath: string) {
    unavailable();
  },
  async commitStaged(_repoPath: string, _message: string) {
    return unavailableAsync<string>();
  },
  async getRepoFile(_input: GetRepoFileInput) {
    return unavailableAsync<null>();
  },
  async syncLspDocument(_input: SyncLspDocumentInput) {},
  async closeLspDocument(_input: CloseLspDocumentInput) {},
  async getLspHover(_input: GetLspHoverInput): Promise<LspHoverResult | null> {
    return null;
  },
  async getLspDefinition(_input: GetLspHoverInput): Promise<LspLocation[]> {
    return unavailableAsync();
  },
  async getLspReferences(_input: GetLspReferencesInput): Promise<LspLocation[]> {
    return unavailableAsync();
  },
  async getUpdateState() {
    return createDisabledUpdateState("Automatic updates are unavailable right now.");
  },
  async checkForUpdates() {
    return createRejectedUpdateActionResult("Automatic updates are unavailable right now.");
  },
  async downloadUpdate() {
    return createRejectedUpdateActionResult("Automatic updates are unavailable right now.");
  },
  async installUpdate() {
    return createRejectedUpdateActionResult("Automatic updates are unavailable right now.");
  },
  onUpdateState() {
    return () => {};
  },
  onLspDiagnostics() {
    return () => {};
  },
};
