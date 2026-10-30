import { captureDesktopOperation, desktopFailure, desktopSuccess } from "./failure";
import { createDesktopApiFromInvoker } from "./createDesktopApi";
import { createDesktopApiWithDefaults } from "./createDesktopApi";
import { createAppSettings } from "./appSettings";
import type {
  AppSettings,
  ConfirmOptions,
  DesktopHandlers,
  DesktopBridge,
  DesktopUpdateActionResult,
  DesktopUpdateState,
  WorkspaceSession,
} from "./contracts";
import type { DesktopApiMethod } from "./desktopApiMethods";
import { createWorkspaceSession } from "./workspaceSession";

const WORKSPACE_SESSION_STORAGE_KEY = "open-warden.workspace-session";
const APP_SETTINGS_STORAGE_KEY = "open-warden.app-settings";

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
  throw desktopFailure("browser", "unavailable", `${feature} requires the desktop app.`);
}

async function unsupportedAsync<T>(feature: string): Promise<T> {
  unsupported(feature);
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

function readStoredAppSettings(): AppSettings {
  if (typeof window === "undefined") {
    return createAppSettings();
  }

  try {
    const storedValue = window.localStorage.getItem(APP_SETTINGS_STORAGE_KEY);
    if (!storedValue) {
      return createAppSettings();
    }

    return createAppSettings(JSON.parse(storedValue));
  } catch {
    return createAppSettings();
  }
}

function writeStoredAppSettings(settings: AppSettings): AppSettings {
  const normalizedSettings = createAppSettings(settings);

  if (typeof window !== "undefined") {
    window.localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify(normalizedSettings));
  }

  return normalizedSettings;
}

function browserUnsupportedFeature(method: DesktopApiMethod): string {
  switch (method) {
    case "openPath":
      return "Opening local paths";
    case "listProviderConnections":
    case "connectProvider":
    case "disconnectProvider":
      return "Provider connections";
    case "resolveHostedRepo":
      return "Hosted repository detection";
    case "listPullRequests":
      return "Pull request listing";
    case "resolveActivePullRequestForBranch":
      return "Active pull request detection";
    case "getPullRequestConversation":
      return "Pull request conversation";
    case "getPullRequestReviewOverview":
    case "setPullRequestReviewer":
    case "submitPullRequestReview":
    case "runPullRequestLifecycle":
    case "getPullRequestActivity":
    case "getPullRequestViewedFiles":
    case "setPullRequestFileViewed":
      return "Pull request review workflow";
    case "getPullRequestChecks":
      return "Pull request checks";
    case "getPullRequestFiles":
      return "Pull request files";
    case "getPullRequestPatch":
      return "Pull request patch";
    case "addPullRequestComment":
      return "Pull request comments";
    case "createPullRequest":
      return "Pull request creation";
    case "submitPullRequestDecision":
      return "Pull request review decisions";
    case "mergePullRequest":
      return "Pull request merging";
    case "replyToPullRequestThread":
      return "Pull request thread replies";
    case "submitPullRequestReviewComments":
      return "Pull request review comment submission";
    case "setPullRequestThreadResolved":
      return "Pull request thread resolution";
    case "preparePullRequestCompareRefs":
      return "Pull request compare refs";
    case "preparePullRequestFromUrl":
    case "preparePullRequestWorkspace":
      return "Pull request review workspaces";
    case "getGitSnapshot":
      return "Git snapshot loading";
    case "getRepoFiles":
      return "Repository file listing";
    case "getHistoryGraph":
      return "History graph loading";
    case "getCommitHistory":
      return "Commit history loading";
    case "getCommitDetails":
      return "Commit details loading";
    case "getBranchCommits":
      return "Branch commit loading";
    case "getBranches":
      return "Branch listing";
    case "getBranchFiles":
      return "Branch file listing";
    case "getCommitFiles":
      return "Commit file listing";
    case "getCommitFileVersions":
      return "Commit file diff loading";
    case "getFileVersions":
      return "Working tree diff loading";
    case "getBranchFileVersions":
      return "Branch file diff loading";
    case "stageFile":
    case "stageFiles":
      return "Staging files";
    case "unstageFile":
    case "unstageFiles":
      return "Unstaging files";
    case "stageAll":
      return "Staging all files";
    case "unstageAll":
      return "Unstaging all files";
    case "discardFile":
    case "discardFiles":
      return "Discarding file changes";
    case "discardAll":
      return "Discarding all changes";
    case "commitStaged":
      return "Creating commits";
    default:
      return "Desktop runtime";
  }
}

const browserGuidance = {
  async getGuidanceActivity() {
    return { ok: true as const, value: null };
  },
  async clearGuidanceMessages() {
    return {
      ok: false as const,
      error: { code: "unavailable" as const, message: "Guidance requires the desktop app." },
    };
  },
  async getPullRequestGuidance() {
    return { ok: true as const, value: null };
  },
  async setGuidanceProgress() {
    return {
      ok: false as const,
      error: { code: "unavailable" as const, message: "Guidance requires the desktop app." },
    };
  },
  async addGuidanceMessage() {
    return {
      ok: false as const,
      error: { code: "unavailable" as const, message: "Guidance requires the desktop app." },
    };
  },
  async getGuidanceConnection() {
    return { status: "stopped" as const, endpoint: null, clientConfig: null, error: null };
  },
  async startGuidanceConnection() {
    return {
      status: "error" as const,
      endpoint: null,
      clientConfig: null,
      error: "MCP requires the desktop app.",
    };
  },
  async stopGuidanceConnection() {
    return { status: "stopped" as const, endpoint: null, clientConfig: null, error: null };
  },
};
const browserDesktopApiCore = createDesktopApiWithDefaults({
  fallback: (method) => async () => unsupportedAsync(browserUnsupportedFeature(method)),
  overrides: {
    async setRepositorySubscriptions() {
      return desktopSuccess(undefined);
    },
    ...browserGuidance,
    async selectFolder() {
      throw desktopFailure(
        "selectFolder",
        "unavailable",
        "Choose a repository in the desktop app.",
      );
    },
    async loadWorkspaceSession() {
      return desktopSuccess(readStoredWorkspaceSession());
    },
    async saveWorkspaceSession(session: WorkspaceSession) {
      return desktopSuccess(writeStoredWorkspaceSession(session));
    },
    async loadAppSettings() {
      return readStoredAppSettings();
    },
    async saveAppSettings(settings: AppSettings) {
      return writeStoredAppSettings(settings);
    },
    async getAppSettingsPath() {
      return APP_SETTINGS_STORAGE_KEY;
    },
    async confirm(message: string, _options?: ConfirmOptions) {
      return window.confirm(message);
    },
    async checkAppExists(_appName: string) {
      return false;
    },
    async listProviderConnections() {
      return [];
    },
    async resolveActivePullRequestForBranch() {
      return null;
    },
    async getRepoFile() {
      return null;
    },
    async syncLspDocument() {},
    async closeLspDocument() {},
    async getLspHover() {
      return null;
    },
    async getLspDefinition() {
      return [];
    },
    async getLspReferences() {
      return [];
    },
  } satisfies Partial<DesktopHandlers>,
});

export const browserDesktopApi: DesktopBridge = {
  onRepositoryChanged() {
    return () => {};
  },
  onGuidanceNavigate() {
    return () => {};
  },
  ...createDesktopApiFromInvoker((method, ...args) =>
    captureDesktopOperation(method, () => {
      const handler = browserDesktopApiCore[method] as (...parameters: unknown[]) => unknown;
      return handler(...args);
    }),
  ),
  async getUpdateState() {
    return desktopSuccess(
      createDisabledUpdateState("Automatic updates are only available in desktop builds."),
    );
  },
  async checkForUpdates() {
    return desktopSuccess(
      createRejectedUpdateActionResult("Automatic updates are only available in desktop builds."),
    );
  },
  async downloadUpdate() {
    return desktopSuccess(
      createRejectedUpdateActionResult("Automatic updates are only available in desktop builds."),
    );
  },
  async installUpdate() {
    return desktopSuccess(
      createRejectedUpdateActionResult("Automatic updates are only available in desktop builds."),
    );
  },
  onUpdateState() {
    return () => {};
  },
  onLspDiagnostics() {
    return () => {};
  },
  onAppSettingsChanged(listener) {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== APP_SETTINGS_STORAGE_KEY) {
        return;
      }

      try {
        listener(createAppSettings(event.newValue ? JSON.parse(event.newValue) : undefined));
      } catch {
        listener(createAppSettings());
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  },
};

function unavailable(): never {
  throw desktopFailure(
    "desktop",
    "unavailable",
    "Open Warden couldn’t reach its desktop service. Try again.",
  );
}

async function unavailableAsync<T>(): Promise<T> {
  unavailable();
}

const unavailableDesktopApiCore = createDesktopApiWithDefaults({
  fallback: () => async () => unavailableAsync(),
  overrides: {
    async setRepositorySubscriptions() {
      return desktopSuccess(undefined);
    },
    ...browserGuidance,
    async loadWorkspaceSession() {
      return desktopSuccess(createWorkspaceSession());
    },
    async saveWorkspaceSession(session: WorkspaceSession) {
      return desktopSuccess(createWorkspaceSession(session));
    },
    async loadAppSettings() {
      return createAppSettings();
    },
    async saveAppSettings(settings: AppSettings) {
      return createAppSettings(settings);
    },
    async listProviderConnections() {
      return [];
    },
    async resolveActivePullRequestForBranch() {
      return null;
    },
    async syncLspDocument() {},
    async closeLspDocument() {},
    async getLspHover() {
      return null;
    },
  } satisfies Partial<DesktopHandlers>,
});

export const unavailableDesktopApi: DesktopBridge = {
  ...createDesktopApiFromInvoker((method, ...args) =>
    captureDesktopOperation(method, () => {
      const handler = unavailableDesktopApiCore[method] as (...parameters: unknown[]) => unknown;
      return handler(...args);
    }),
  ),
  async getUpdateState() {
    return desktopSuccess(
      createDisabledUpdateState("Automatic updates are unavailable right now."),
    );
  },
  async checkForUpdates() {
    return desktopSuccess(
      createRejectedUpdateActionResult("Automatic updates are unavailable right now."),
    );
  },
  async downloadUpdate() {
    return desktopSuccess(
      createRejectedUpdateActionResult("Automatic updates are unavailable right now."),
    );
  },
  async installUpdate() {
    return desktopSuccess(
      createRejectedUpdateActionResult("Automatic updates are unavailable right now."),
    );
  },
  onUpdateState() {
    return () => {};
  },
  onLspDiagnostics() {
    return () => {};
  },
  onRepositoryChanged() {
    return () => {};
  },
  onGuidanceNavigate() {
    return () => {};
  },
  onAppSettingsChanged() {
    return () => {};
  },
};
