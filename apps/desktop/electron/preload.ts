import { contextBridge, ipcRenderer } from "electron";

import type { DesktopApi } from "../src/platform/desktop/contracts";

type DesktopMethod = keyof DesktopApi;

function invoke<K extends DesktopMethod>(
  method: K,
  ...args: Parameters<DesktopApi[K]>
): ReturnType<DesktopApi[K]> {
  return ipcRenderer.invoke("desktop:invoke", method, ...args) as ReturnType<DesktopApi[K]>;
}

const desktopBridge: DesktopApi = {
  selectFolder: () => invoke("selectFolder"),
  confirm: (message, options) => invoke("confirm", message, options),
  checkAppExists: (appName) => invoke("checkAppExists", appName),
  openPath: (targetPath, appName) => invoke("openPath", targetPath, appName),
  getGitSnapshot: (repoPath) => invoke("getGitSnapshot", repoPath),
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
};

contextBridge.exposeInMainWorld("desktopBridge", desktopBridge);
contextBridge.exposeInMainWorld("openWarden", desktopBridge);
