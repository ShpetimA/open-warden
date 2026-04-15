import { createDesktopApiForwarder } from "./createDesktopApi";
import type { DesktopBridge } from "./contracts";
import { browserDesktopApi, unavailableDesktopApi } from "./browser";

function hasElectronRuntime() {
  if (typeof window === "undefined") return false;

  return (
    (typeof window.desktopBridge === "object" && window.desktopBridge !== null) ||
    (typeof window.openWarden === "object" && window.openWarden !== null)
  );
}

function getElectronRuntime(): DesktopBridge | null {
  if (!hasElectronRuntime()) return null;
  return window.desktopBridge ?? window.openWarden ?? null;
}

function browserFallbackEnabled() {
  return import.meta.env.DEV && import.meta.env.VITE_DESKTOP_FALLBACK === "browser";
}

function resolveDesktopApi(): DesktopBridge {
  const electronRuntime = getElectronRuntime();
  if (electronRuntime) {
    return electronRuntime;
  }

  if (browserFallbackEnabled()) {
    return browserDesktopApi;
  }

  return unavailableDesktopApi;
}

const desktopApi = createDesktopApiForwarder(() => resolveDesktopApi());

export const desktop: DesktopBridge = {
  ...desktopApi,
  getUpdateState: () => resolveDesktopApi().getUpdateState(),
  checkForUpdates: () => resolveDesktopApi().checkForUpdates(),
  downloadUpdate: () => resolveDesktopApi().downloadUpdate(),
  installUpdate: () => resolveDesktopApi().installUpdate(),
  onUpdateState: (listener) => resolveDesktopApi().onUpdateState(listener),
  onLspDiagnostics: (listener) => resolveDesktopApi().onLspDiagnostics(listener),
  onAppSettingsChanged: (listener) => resolveDesktopApi().onAppSettingsChanged(listener),
};

export type {
  AppSettings,
  AddPullRequestCommentInput,
  ApiError,
  Bucket,
  ConfirmOptions,
  ConnectProviderInput,
  DesktopApi,
  DesktopBridge,
  DesktopUpdateActionResult,
  DesktopUpdateApi,
  DesktopUpdateErrorContext,
  DesktopUpdateState,
  DesktopUpdateStatus,
  DiffFile,
  DiscardFileInput,
  FileItem,
  FileStatus,
  FileVersions,
  GitProviderId,
  RepoFileItem,
  GetRepoFileInput,
  GitSnapshot,
  HostedRepoRef,
  HistoryCommit,
  LspDiagnostic,
  LspDiagnosticSeverity,
  LspDiagnosticsEvent,
  DesktopLspApi,
  DesktopSettingsApi,
  SyncLspDocumentInput,
  CloseLspDocumentInput,
  FileTreeRenderMode,
  GetLspHoverInput,
  GetLspReferencesInput,
  LspLocation,
  LspHoverResult,
  PreparedPullRequestWorkspace,
  PreparePullRequestWorkspaceInput,
  ProviderConnection,
  PullRequestChangedFile,
  PullRequestCompareRefs,
  PullRequestConversation,
  PullRequestDetail,
  PullRequestIssueComment,
  PullRequestLocatorInput,
  PullRequestOpenMode,
  PullRequestPerson,
  PullRequestReviewComment,
  PullRequestReviewDraftCommentInput,
  PullRequestReviewThread,
  ProviderAuthType,
  ProviderConnectionMethod,
  ListPullRequestsInput,
  PullRequestPage,
  PullRequestSummary,
  PullRequestState,
  ReplyToPullRequestThreadInput,
  SetPullRequestThreadResolvedInput,
  SubmitPullRequestReviewCommentsInput,
  SubmitPullRequestReviewCommentsResult,
  WorkspaceSession,
} from "./contracts";
