import { contextBridge, ipcRenderer } from "electron";

import type { DesktopApi, DesktopBridge } from "../src/platform/desktop/contracts";
import {
  APP_SETTINGS_CHANGED_CHANNEL,
  DESKTOP_INVOKE_CHANNEL,
  LSP_DIAGNOSTICS_CHANNEL,
  UPDATE_CHECK_CHANNEL,
  UPDATE_DOWNLOAD_CHANNEL,
  UPDATE_GET_STATE_CHANNEL,
  UPDATE_INSTALL_CHANNEL,
  UPDATE_STATE_CHANNEL,
} from "./ipc-channels";

type DesktopMethod = keyof DesktopApi;

function invoke<K extends DesktopMethod>(
  method: K,
  ...args: Parameters<DesktopApi[K]>
): ReturnType<DesktopApi[K]> {
  return ipcRenderer.invoke(DESKTOP_INVOKE_CHANNEL, method, ...args) as ReturnType<DesktopApi[K]>;
}

const desktopBridge: DesktopBridge = {
  selectFolder: () => invoke("selectFolder"),
  loadWorkspaceSession: () => invoke("loadWorkspaceSession"),
  saveWorkspaceSession: (session) => invoke("saveWorkspaceSession", session),
  loadAppSettings: () => invoke("loadAppSettings"),
  saveAppSettings: (settings) => invoke("saveAppSettings", settings),
  getAppSettingsPath: () => invoke("getAppSettingsPath"),
  confirm: (message, options) => invoke("confirm", message, options),
  checkAppExists: (appName) => invoke("checkAppExists", appName),
  openPath: (targetPath, appName) => invoke("openPath", targetPath, appName),
  listProviderConnections: () => invoke("listProviderConnections"),
  connectProvider: (input) => invoke("connectProvider", input),
  disconnectProvider: (providerId) => invoke("disconnectProvider", providerId),
  resolveHostedRepo: (repoPath) => invoke("resolveHostedRepo", repoPath),
  resolvePullRequestWorkspace: (repoPath) => invoke("resolvePullRequestWorkspace", repoPath),
  listPullRequests: (repoPath) => invoke("listPullRequests", repoPath),
  getPullRequestConversation: (input) => invoke("getPullRequestConversation", input),
  addPullRequestComment: (input) => invoke("addPullRequestComment", input),
  replyToPullRequestThread: (input) => invoke("replyToPullRequestThread", input),
  setPullRequestThreadResolved: (input) => invoke("setPullRequestThreadResolved", input),
  preparePullRequestWorkspace: (input) => invoke("preparePullRequestWorkspace", input),
  getGitSnapshot: (repoPath) => invoke("getGitSnapshot", repoPath),
  getRepoFiles: (repoPath) => invoke("getRepoFiles", repoPath),
  getCommitHistory: (repoPath, limit) => invoke("getCommitHistory", repoPath, limit),
  getBranches: (repoPath) => invoke("getBranches", repoPath),
  getBranchFiles: (repoPath, baseRef, headRef) =>
    invoke("getBranchFiles", repoPath, baseRef, headRef),
  getCommitFiles: (repoPath, commitId) => invoke("getCommitFiles", repoPath, commitId),
  getCommitFileVersions: (repoPath, commitId, relPath, previousPath) =>
    invoke("getCommitFileVersions", repoPath, commitId, relPath, previousPath),
  getFileVersions: (repoPath, relPath, bucket) =>
    invoke("getFileVersions", repoPath, relPath, bucket),
  getBranchFileVersions: (repoPath, baseRef, headRef, relPath, previousPath) =>
    invoke("getBranchFileVersions", repoPath, baseRef, headRef, relPath, previousPath),
  stageFile: (repoPath, relPath) => invoke("stageFile", repoPath, relPath),
  unstageFile: (repoPath, relPath) => invoke("unstageFile", repoPath, relPath),
  stageAll: (repoPath) => invoke("stageAll", repoPath),
  unstageAll: (repoPath) => invoke("unstageAll", repoPath),
  discardFile: (repoPath, relPath, bucket) => invoke("discardFile", repoPath, relPath, bucket),
  discardFiles: (repoPath, files) => invoke("discardFiles", repoPath, files),
  discardAll: (repoPath) => invoke("discardAll", repoPath),
  commitStaged: (repoPath, message) => invoke("commitStaged", repoPath, message),
  getRepoFile: (input) => invoke("getRepoFile", input),
  syncLspDocument: (input) => invoke("syncLspDocument", input),
  closeLspDocument: (input) => invoke("closeLspDocument", input),
  getLspHover: (input) => invoke("getLspHover", input),
  getLspDefinition: (input) => invoke("getLspDefinition", input),
  getLspReferences: (input) => invoke("getLspReferences", input),
  getUpdateState: () => ipcRenderer.invoke(UPDATE_GET_STATE_CHANNEL),
  checkForUpdates: () => ipcRenderer.invoke(UPDATE_CHECK_CHANNEL),
  downloadUpdate: () => ipcRenderer.invoke(UPDATE_DOWNLOAD_CHANNEL),
  installUpdate: () => ipcRenderer.invoke(UPDATE_INSTALL_CHANNEL),
  onUpdateState: (listener) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, state: unknown) => {
      if (typeof state !== "object" || state === null) {
        return;
      }

      listener(state as Parameters<typeof listener>[0]);
    };

    ipcRenderer.on(UPDATE_STATE_CHANNEL, wrappedListener);
    return () => {
      ipcRenderer.removeListener(UPDATE_STATE_CHANNEL, wrappedListener);
    };
  },
  onLspDiagnostics: (listener) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, event: unknown) => {
      if (typeof event !== "object" || event === null) {
        return;
      }

      listener(event as Parameters<typeof listener>[0]);
    };

    ipcRenderer.on(LSP_DIAGNOSTICS_CHANNEL, wrappedListener);
    return () => {
      ipcRenderer.removeListener(LSP_DIAGNOSTICS_CHANNEL, wrappedListener);
    };
  },
  onAppSettingsChanged: (listener) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, settings: unknown) => {
      if (typeof settings !== "object" || settings === null) {
        return;
      }

      listener(settings as Parameters<typeof listener>[0]);
    };

    ipcRenderer.on(APP_SETTINGS_CHANGED_CHANNEL, wrappedListener);
    return () => {
      ipcRenderer.removeListener(APP_SETTINGS_CHANGED_CHANNEL, wrappedListener);
    };
  },
};

contextBridge.exposeInMainWorld("desktopBridge", desktopBridge);
contextBridge.exposeInMainWorld("openWarden", desktopBridge);
