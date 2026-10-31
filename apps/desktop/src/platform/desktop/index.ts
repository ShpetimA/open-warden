import { createDesktopApiForwarder } from "./createDesktopApi";
import type { DesktopBridge } from "./contracts";
import { browserDesktopApi, unavailableDesktopApi } from "./browser";

export function hasElectronRuntime() {
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
  onRepositoryChanged: (listener) =>
    resolveDesktopApi().onRepositoryChanged?.(listener) ?? (() => {}),
  onWorkspaceFlushRequested: (listener) =>
    resolveDesktopApi().onWorkspaceFlushRequested?.(listener) ?? (() => {}),
  onGuidanceNavigate: (listener) => resolveDesktopApi().onGuidanceNavigate(listener),
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
  CreatePullRequestInput,
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
  CommitDetails,
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
  PullRequestCheck,
  PullRequestChecksResult,
  PullRequestExtras,
  PullRequestLabel,
  PullRequestWorkflowRun,
  PullRequestStackLink,
  SetPullRequestLabelsInput,
  RerunPullRequestWorkflowInput,
  AddPullRequestReactionInput,
  GitBlameResult,
  GitBlameLine,
  PullRequestCheckState,
  PullRequestCompareRefs,
  PullRequestConversation,
  PullRequestDetail,
  PullRequestIssueComment,
  PullRequestLocatorInput,
  PullRequestLifecycleInput,
  PullRequestLifecycleResult,
  PullRequestActivity,
  PullRequestActivityItem,
  PullRequestViewedFiles,
  SetPullRequestFileViewedInput,
  PullRequestOpenMode,
  PullRequestPerson,
  PullRequestActivityEvent,
  PullRequestReviewComment,
  PullRequestReviewer,
  PullRequestInvolvement,
  PullRequestReviewOverview,
  PullRequestReviewDraftCommentInput,
  PullRequestReviewThread,
  SetPullRequestReviewerInput,
  SubmitPullRequestReviewInput,
  SubmitPullRequestReviewResult,
  ProviderAuthType,
  ProviderConnectionMethod,
  ListPullRequestsInput,
  MergePullRequestInput,
  ResolveActivePullRequestForBranchInput,
  PullRequestPage,
  PullRequestSummary,
  PullRequestState,
  ReplyToPullRequestThreadInput,
  SetPullRequestThreadResolvedInput,
  SubmitPullRequestReviewCommentsInput,
  SubmitPullRequestReviewCommentsResult,
  SubmitPullRequestDecisionInput,
  WorkspaceSession,
} from "./contracts";
