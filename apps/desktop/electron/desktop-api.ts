import type { DesktopApi, LspDiagnosticsEvent } from "../src/platform/desktop/contracts";
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
  confirm,
  checkAppExists,
  openPath,
  getGitSnapshot,
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
  syncLspDocument: (input) => lspSessionManager.syncDocument(input),
  closeLspDocument: (input) => lspSessionManager.closeDocument(input),
  getLspHover: (input) => lspSessionManager.getHover(input),
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
