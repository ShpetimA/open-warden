import type { DesktopApi } from "./contracts";

export type DesktopApiMethod = keyof DesktopApi;

export const DESKTOP_API_METHODS = [
  "selectFolder",
  "loadWorkspaceSession",
  "saveWorkspaceSession",
  "loadAppSettings",
  "saveAppSettings",
  "getAppSettingsPath",
  "confirm",
  "checkAppExists",
  "openPath",
  "listProviderConnections",
  "connectProvider",
  "disconnectProvider",
  "resolveHostedRepo",
  "resolvePullRequestWorkspace",
  "listPullRequests",
  "getPullRequestConversation",
  "getPullRequestFiles",
  "getPullRequestPatch",
  "addPullRequestComment",
  "replyToPullRequestThread",
  "submitPullRequestReviewComments",
  "setPullRequestThreadResolved",
  "preparePullRequestCompareRefs",
  "preparePullRequestWorkspace",
  "getGitSnapshot",
  "getRepoFiles",
  "getCommitHistory",
  "getBranches",
  "getBranchFiles",
  "getCommitFiles",
  "getCommitFileVersions",
  "getFileVersions",
  "getBranchFileVersions",
  "stageFile",
  "unstageFile",
  "stageAll",
  "unstageAll",
  "discardFile",
  "discardFiles",
  "discardAll",
  "commitStaged",
  "getRepoFile",
  "syncLspDocument",
  "closeLspDocument",
  "getLspHover",
  "getLspDefinition",
  "getLspReferences",
] as const satisfies readonly DesktopApiMethod[];

type RegisteredDesktopApiMethod = (typeof DESKTOP_API_METHODS)[number];
type MissingDesktopApiMethod = Exclude<DesktopApiMethod, RegisteredDesktopApiMethod>;
type ExtraDesktopApiMethod = Exclude<RegisteredDesktopApiMethod, DesktopApiMethod>;

const missingDesktopApiMethodCheck: never = null as unknown as MissingDesktopApiMethod;
const extraDesktopApiMethodCheck: never = null as unknown as ExtraDesktopApiMethod;

void missingDesktopApiMethodCheck;
void extraDesktopApiMethodCheck;
