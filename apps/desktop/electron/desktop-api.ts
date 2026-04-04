import type { DesktopApi, LspDiagnosticsEvent } from "../src/platform/desktop/contracts";
import { getAppSettingsPath, loadAppSettings, saveAppSettings } from "./appSettings";
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
} from "./git";
import { LspSessionManager } from "./lsp/sessionManager";
import { checkAppExists, confirm, openPath, selectFolder } from "./system";
import { loadWorkspaceSession, saveWorkspaceSession } from "./workspaceSession";

let lspSessionManager = new LspSessionManager({
  onDiagnostics: () => {},
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

export function configureDesktopApi(options: {
  onDiagnostics(event: LspDiagnosticsEvent): void;
}) {
  void lspSessionManager.dispose();
  lspSessionManager = new LspSessionManager({
    onDiagnostics: options.onDiagnostics,
  });
}

export async function disposeDesktopApi() {
  await lspSessionManager.dispose();
}
