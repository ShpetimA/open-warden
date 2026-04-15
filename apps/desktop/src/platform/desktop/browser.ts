import { createDesktopApiWithDefaults } from "./createDesktopApi";
import { createAppSettings } from "./appSettings";
import type {
  AppSettings,
  ConfirmOptions,
  DesktopApi,
  DesktopBridge,
  DesktopUpdateActionResult,
  DesktopUpdateState,
  WorkspaceSession,
} from "./contracts";
import type { DesktopApiMethod } from "./desktopApiMethods";
import { desktopRuntimeUnavailable, unsupportedInBrowser } from "./errors";
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
  throw unsupportedInBrowser(feature);
}

async function unsupportedAsync<T>(feature: string): Promise<T> {
  unsupported(feature);
}

function readBrowserDirectorySelectionError(): Error {
  return unsupportedInBrowser("Repository selection");
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
    case "getPullRequestConversation":
      return "Pull request conversation";
    case "getPullRequestFiles":
      return "Pull request files";
    case "getPullRequestPatch":
      return "Pull request patch";
    case "addPullRequestComment":
      return "Pull request comments";
    case "replyToPullRequestThread":
      return "Pull request thread replies";
    case "setPullRequestThreadResolved":
      return "Pull request thread resolution";
    case "preparePullRequestCompareRefs":
      return "Pull request compare refs";
    case "preparePullRequestWorkspace":
      return "Pull request review workspaces";
    case "getGitSnapshot":
      return "Git snapshot loading";
    case "getRepoFiles":
      return "Repository file listing";
    case "getCommitHistory":
      return "Commit history loading";
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
      return "Staging files";
    case "unstageFile":
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

const browserDesktopApiCore = createDesktopApiWithDefaults({
  fallback: (method) => async () => unsupportedAsync(browserUnsupportedFeature(method)),
  overrides: {
    async selectFolder() {
      throw readBrowserDirectorySelectionError();
    },
    async loadWorkspaceSession() {
      return readStoredWorkspaceSession();
    },
    async saveWorkspaceSession(session: WorkspaceSession) {
      return writeStoredWorkspaceSession(session);
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
    async resolvePullRequestWorkspace(_repoPath: string) {
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
  } satisfies Partial<DesktopApi>,
});

export const browserDesktopApi: DesktopBridge = {
  ...browserDesktopApiCore,
  async getUpdateState() {
    return createDisabledUpdateState("Automatic updates are only available in desktop builds.");
  },
  async checkForUpdates() {
    return createRejectedUpdateActionResult(
      "Automatic updates are only available in desktop builds.",
    );
  },
  async downloadUpdate() {
    return createRejectedUpdateActionResult(
      "Automatic updates are only available in desktop builds.",
    );
  },
  async installUpdate() {
    return createRejectedUpdateActionResult(
      "Automatic updates are only available in desktop builds.",
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
  throw desktopRuntimeUnavailable();
}

async function unavailableAsync<T>(): Promise<T> {
  unavailable();
}

const unavailableDesktopApiCore = createDesktopApiWithDefaults({
  fallback: () => async () => unavailableAsync(),
  overrides: {
    async loadWorkspaceSession() {
      return createWorkspaceSession();
    },
    async saveWorkspaceSession(session: WorkspaceSession) {
      return createWorkspaceSession(session);
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
    async resolvePullRequestWorkspace() {
      return null;
    },
    async syncLspDocument() {},
    async closeLspDocument() {},
    async getLspHover() {
      return null;
    },
  } satisfies Partial<DesktopApi>,
});

export const unavailableDesktopApi: DesktopBridge = {
  ...unavailableDesktopApiCore,
  async getUpdateState() {
    return createDisabledUpdateState("Automatic updates are unavailable right now.");
  },
  async checkForUpdates() {
    return createRejectedUpdateActionResult("Automatic updates are unavailable right now.");
  },
  async downloadUpdate() {
    return createRejectedUpdateActionResult("Automatic updates are unavailable right now.");
  },
  async installUpdate() {
    return createRejectedUpdateActionResult("Automatic updates are unavailable right now.");
  },
  onUpdateState() {
    return () => {};
  },
  onLspDiagnostics() {
    return () => {};
  },
  onAppSettingsChanged() {
    return () => {};
  },
};
