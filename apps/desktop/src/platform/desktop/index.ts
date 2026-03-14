import type { DesktopApi } from './contracts'
import { browserDesktopApi, unavailableDesktopApi } from './browser'

function hasElectronRuntime() {
  if (typeof window === 'undefined') return false

  return (
    (typeof window.desktopBridge === 'object' && window.desktopBridge !== null) ||
    (typeof window.openWarden === 'object' && window.openWarden !== null)
  )
}

function getElectronRuntime(): DesktopApi | null {
  if (!hasElectronRuntime()) return null
  return window.desktopBridge ?? window.openWarden ?? null
}

function browserFallbackEnabled() {
  return import.meta.env.DEV && import.meta.env.VITE_DESKTOP_FALLBACK === 'browser'
}

function resolveDesktopApi(): DesktopApi {
  const electronRuntime = getElectronRuntime()
  if (electronRuntime) {
    return electronRuntime
  }

  if (browserFallbackEnabled()) {
    return browserDesktopApi
  }

  return unavailableDesktopApi
}

export const desktop: DesktopApi = {
  selectFolder: () => resolveDesktopApi().selectFolder(),
  confirm: (message, options) => resolveDesktopApi().confirm(message, options),
  checkAppExists: (appName) => resolveDesktopApi().checkAppExists(appName),
  openPath: (targetPath, appName) => resolveDesktopApi().openPath(targetPath, appName),
  getGitSnapshot: (repoPath) => resolveDesktopApi().getGitSnapshot(repoPath),
  getCommitHistory: (repoPath, limit) => resolveDesktopApi().getCommitHistory(repoPath, limit),
  getBranches: (repoPath) => resolveDesktopApi().getBranches(repoPath),
  getBranchFiles: (repoPath, baseRef, headRef) =>
    resolveDesktopApi().getBranchFiles(repoPath, baseRef, headRef),
  getCommitFiles: (repoPath, commitId) => resolveDesktopApi().getCommitFiles(repoPath, commitId),
  getCommitFileVersions: (repoPath, commitId, relPath, previousPath) =>
    resolveDesktopApi().getCommitFileVersions(repoPath, commitId, relPath, previousPath),
  getFileVersions: (repoPath, relPath, bucket) =>
    resolveDesktopApi().getFileVersions(repoPath, relPath, bucket),
  getBranchFileVersions: (repoPath, baseRef, headRef, relPath, previousPath) =>
    resolveDesktopApi().getBranchFileVersions(repoPath, baseRef, headRef, relPath, previousPath),
  stageFile: (repoPath, relPath) => resolveDesktopApi().stageFile(repoPath, relPath),
  unstageFile: (repoPath, relPath) => resolveDesktopApi().unstageFile(repoPath, relPath),
  stageAll: (repoPath) => resolveDesktopApi().stageAll(repoPath),
  unstageAll: (repoPath) => resolveDesktopApi().unstageAll(repoPath),
  discardFile: (repoPath, relPath, bucket) =>
    resolveDesktopApi().discardFile(repoPath, relPath, bucket),
  discardFiles: (repoPath, files) => resolveDesktopApi().discardFiles(repoPath, files),
  discardAll: (repoPath) => resolveDesktopApi().discardAll(repoPath),
  commitStaged: (repoPath, message) => resolveDesktopApi().commitStaged(repoPath, message),
}

export type {
  ApiError,
  Bucket,
  ConfirmOptions,
  DesktopApi,
  DiffFile,
  DiscardFileInput,
  FileItem,
  FileStatus,
  FileVersions,
  GitSnapshot,
  HistoryCommit,
} from './contracts'
