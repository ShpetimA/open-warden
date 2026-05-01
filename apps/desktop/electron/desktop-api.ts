import type { DesktopApi, LspDiagnosticsEvent } from "../src/platform/desktop/contracts";
import { getAppSettingsPath, loadAppSettings, saveAppSettings } from "./appSettings";
import {
  addPullRequestComment,
  connectProvider,
  disconnectProvider,
  getPullRequestConversation,
  getPullRequestFiles,
  getPullRequestPatch,
  listProviderConnections,
  listPullRequests,
  resolveActivePullRequestForBranch,
  preparePullRequestCompareRefs,
  preparePullRequestWorkspace,
  replyToPullRequestThread,
  resolveHostedRepo,
  setPullRequestThreadResolved,
  submitPullRequestReviewComments,
} from "./hostedRepos";
import {
  commitStaged,
  discardAll,
  discardFile,
  discardFiles,
  getBranchFileVersions,
  getBranchFiles,
  getBranches,
  getCommitFileVersions,
  getCommitFiles,
  getCommitHistory,
  getFileVersions,
  getRepoFiles,
  getRepoFile,
  getGitSnapshot,
  stageAll,
  stageFile,
  unstageAll,
  unstageFile,
  updateIndexFileContents,
  updateWorktreeFileContents,
} from "./git";
import { LspSessionManager } from "./lsp/sessionManager";
import { checkAppExists, confirm, openPath, selectFolder } from "./system";
import { loadWorkspaceSession, saveWorkspaceSession } from "./workspaceSession";

let lspSessionManager = new LspSessionManager({
  onDiagnostics: () => {},
  loadAppSettings,
});

export const desktopApi: DesktopApi = {
  selectFolder,
  loadWorkspaceSession,
  saveWorkspaceSession,
  loadAppSettings,
  saveAppSettings,
  getAppSettingsPath,
  confirm,
  checkAppExists,
  openPath,
  listProviderConnections,
  connectProvider,
  disconnectProvider,
  resolveHostedRepo,
  listPullRequests,
  resolveActivePullRequestForBranch,
  getPullRequestConversation,
  getPullRequestFiles,
  getPullRequestPatch,
  addPullRequestComment,
  replyToPullRequestThread,
  submitPullRequestReviewComments,
  setPullRequestThreadResolved,
  preparePullRequestCompareRefs,
  preparePullRequestWorkspace,
  getGitSnapshot,
  getRepoFiles,
  getCommitHistory,
  getBranches,
  getBranchFiles,
  getCommitFiles,
  getCommitFileVersions,
  getFileVersions,
  getBranchFileVersions,
  stageFile,
  unstageFile,
  updateIndexFileContents,
  updateWorktreeFileContents,
  stageAll,
  unstageAll,
  discardFile,
  discardFiles,
  discardAll,
  commitStaged,
  getRepoFile,
  syncLspDocument: (input) => lspSessionManager.syncDocument(input),
  closeLspDocument: (input) => lspSessionManager.closeDocument(input),
  getLspHover: (input) => lspSessionManager.getHover(input),
  getLspDefinition: (input) => lspSessionManager.getDefinition(input),
  getLspReferences: (input) => lspSessionManager.getReferences(input),
};

export function configureDesktopApi(options: { onDiagnostics(event: LspDiagnosticsEvent): void }) {
  void lspSessionManager.dispose();
  lspSessionManager = new LspSessionManager({
    onDiagnostics: options.onDiagnostics,
    loadAppSettings,
  });
}

export async function disposeDesktopApi() {
  await lspSessionManager.dispose();
}
