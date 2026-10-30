import { repositoryWriteEvents } from "./repositoryChangeDefinitions";
import { coordinateRepositoryWrite } from "./repositoryWrites";
import { desktopSuccess } from "../src/platform/desktop/failure";
import { shell } from "electron";
import {
  getPullRequestGuidance,
  getGuidanceActivity,
  clearGuidanceMessages,
  setGuidanceProgress,
  addGuidanceMessage,
  getGuidanceConnection,
  startGuidanceConnection,
  stopGuidanceConnection,
} from "./guidance/runtime";
import { getGitStashPatch, getGitRepositoryState, runGitCommand } from "./gitOperations";
import { browseDirectory } from "./directories";
import type { DesktopHandlers, LspDiagnosticsEvent } from "../src/platform/desktop/contracts";
import { getAppSettingsPath, loadAppSettings, saveAppSettings } from "./appSettings";
import {
  addPullRequestComment,
  createPullRequest,
  connectProvider,
  disconnectProvider,
  getPullRequestConversation,
  getPullRequestReviewOverview,
  setPullRequestReviewer,
  submitPullRequestReview,
  runPullRequestLifecycle,
  getPullRequestActivity,
  getPullRequestViewedFiles,
  setPullRequestFileViewed,
  getPullRequestChecks,
  getPullRequestExtras,
  setPullRequestLabels,
  rerunPullRequestWorkflow,
  cancelPullRequestWorkflow,
  addPullRequestReaction,
  getPullRequestFiles,
  getPullRequestPatch,
  listProviderConnections,
  listPullRequests,
  mergePullRequest,
  resolveActivePullRequestForBranch,
  preparePullRequestCompareRefs,
  preparePullRequestWorkspace,
  preparePullRequestFromUrl,
  replyToPullRequestThread,
  resolveHostedRepo,
  setPullRequestThreadResolved,
  submitPullRequestReviewComments,
  submitPullRequestDecision,
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
  getHistoryGraph,
  getCommitDetails,
  getBranchCommits,
  getFileVersions,
  getRepoFiles,
  createRepositoryEntry,
  trashRepositoryEntry,
  getRepoFile,
  getGitBlame,
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

let setRepositorySubscriptions: DesktopHandlers["setRepositorySubscriptions"] = async () =>
  desktopSuccess(undefined);

export const desktopApi: DesktopHandlers = {
  setRepositorySubscriptions: (paths) => setRepositorySubscriptions(paths),
  getGuidanceActivity,
  clearGuidanceMessages,
  getPullRequestGuidance,
  setGuidanceProgress,
  addGuidanceMessage,
  getGuidanceConnection,
  startGuidanceConnection,
  stopGuidanceConnection,
  getGitStashPatch,
  getGitRepositoryState,
  runGitCommand,
  selectFolder,
  browseDirectory,
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
  getPullRequestReviewOverview,
  setPullRequestReviewer,
  submitPullRequestReview,
  runPullRequestLifecycle,
  getPullRequestActivity,
  getPullRequestViewedFiles,
  setPullRequestFileViewed,
  getPullRequestChecks,
  getPullRequestExtras,
  setPullRequestLabels,
  rerunPullRequestWorkflow,
  cancelPullRequestWorkflow,
  addPullRequestReaction,
  getPullRequestFiles,
  getPullRequestPatch,
  addPullRequestComment,
  createPullRequest,
  submitPullRequestDecision,
  mergePullRequest,
  replyToPullRequestThread,
  submitPullRequestReviewComments,
  setPullRequestThreadResolved,
  preparePullRequestCompareRefs,
  preparePullRequestWorkspace: (input) =>
    coordinateRepositoryWrite(
      input.repoPath,
      repositoryWriteEvents.preparePullRequestWorkspace,
      async () => desktopSuccess(await preparePullRequestWorkspace(input)),
    ),
  preparePullRequestFromUrl,
  getGitSnapshot,
  getRepoFiles,
  createRepositoryEntry: (input) =>
    coordinateRepositoryWrite(input.repoPath, repositoryWriteEvents.createRepositoryEntry, () =>
      createRepositoryEntry(input),
    ),
  trashRepositoryEntry: (input) =>
    coordinateRepositoryWrite(input.repoPath, repositoryWriteEvents.trashRepositoryEntry, () =>
      trashRepositoryEntry(input, (path) => shell.trashItem(path)),
    ),
  getCommitHistory,
  getHistoryGraph,
  getCommitDetails,
  getBranchCommits,
  getBranches,
  getBranchFiles,
  getCommitFiles,
  getCommitFileVersions,
  getFileVersions,
  getBranchFileVersions,
  stageFile: (repoPath, ...args) =>
    coordinateRepositoryWrite(repoPath, repositoryWriteEvents.stageFile, async () =>
      desktopSuccess(await stageFile(repoPath, ...args)),
    ),
  unstageFile: (repoPath, ...args) =>
    coordinateRepositoryWrite(repoPath, repositoryWriteEvents.unstageFile, async () =>
      desktopSuccess(await unstageFile(repoPath, ...args)),
    ),
  updateIndexFileContents,
  updateWorktreeFileContents,
  stageAll: (repoPath, ...args) =>
    coordinateRepositoryWrite(repoPath, repositoryWriteEvents.stageAll, async () =>
      desktopSuccess(await stageAll(repoPath, ...args)),
    ),
  unstageAll: (repoPath, ...args) =>
    coordinateRepositoryWrite(repoPath, repositoryWriteEvents.unstageAll, async () =>
      desktopSuccess(await unstageAll(repoPath, ...args)),
    ),
  discardFile: (repoPath, ...args) =>
    coordinateRepositoryWrite(repoPath, repositoryWriteEvents.discardFile, async () =>
      desktopSuccess(await discardFile(repoPath, ...args)),
    ),
  discardFiles: (repoPath, ...args) =>
    coordinateRepositoryWrite(repoPath, repositoryWriteEvents.discardFiles, async () =>
      desktopSuccess(await discardFiles(repoPath, ...args)),
    ),
  discardAll: (repoPath, ...args) =>
    coordinateRepositoryWrite(repoPath, repositoryWriteEvents.discardAll, async () =>
      desktopSuccess(await discardAll(repoPath, ...args)),
    ),
  commitStaged: (repoPath, ...args) =>
    coordinateRepositoryWrite(repoPath, repositoryWriteEvents.commitStaged, async () =>
      desktopSuccess(await commitStaged(repoPath, ...args)),
    ),
  getRepoFile,
  getGitBlame,
  syncLspDocument: (input) => lspSessionManager.syncDocument(input),
  closeLspDocument: (input) => lspSessionManager.closeDocument(input),
  getLspHover: (input) => lspSessionManager.getHover(input),
  getLspDefinition: (input) => lspSessionManager.getDefinition(input),
  getLspReferences: (input) => lspSessionManager.getReferences(input),
};

export function configureDesktopApi(options: {
  onDiagnostics(event: LspDiagnosticsEvent): void;
  setRepositorySubscriptions: DesktopHandlers["setRepositorySubscriptions"];
}) {
  setRepositorySubscriptions = options.setRepositorySubscriptions;
  void lspSessionManager.dispose();
  lspSessionManager = new LspSessionManager({
    onDiagnostics: options.onDiagnostics,
    loadAppSettings,
  });
}

export async function disposeDesktopApi() {
  await lspSessionManager.dispose();
}
