import {
  Archive,
  ArrowDown,
  ArrowUp,
  Check,
  GitBranch,
  GitCommitHorizontal,
  GitMerge,
  GitPullRequest,
  FolderOpen,
  Link,
  MessageSquarePlus,
  Minus,
  Plus,
  RefreshCw,
  Trash2,
  XCircle,
} from "lucide-react";

import type { GitSnapshot } from "@/features/source-control/types";
import type { GitCommand, GitRepositoryState } from "@/platform/desktop/gitOperations";

export const actions = [
  { id: "open-repository", label: "Open repository", group: "Workspace", icon: FolderOpen },
  { id: "open-pr", label: "Open pull request", group: "Pull requests", icon: GitPullRequest },
  {
    id: "open-pr-worktree",
    label: "Open PR in worktree",
    group: "Pull requests",
    icon: GitPullRequest,
  },
  { id: "copy-pr-link", label: "Copy pull request link", group: "Pull requests", icon: Link },
  {
    id: "comment-pr",
    label: "Comment on pull request",
    group: "Pull requests",
    icon: MessageSquarePlus,
  },
  {
    id: "submit-review",
    label: "Submit review",
    group: "Pull requests",
    icon: MessageSquarePlus,
  },
  { id: "create-pr", label: "Create pull request", group: "Pull requests", icon: Plus },
  { id: "approve-pr", label: "Approve pull request", group: "Pull requests", icon: Check },
  { id: "request-changes", label: "Request changes", group: "Pull requests", icon: XCircle },
  { id: "merge-pr", label: "Merge pull request", group: "Pull requests", icon: GitMerge },
  { id: "pull", label: "Pull", group: "Quick", icon: ArrowDown },
  { id: "push", label: "Push", group: "Quick", icon: ArrowUp },
  { id: "commit", label: "Commit", group: "Quick", icon: GitCommitHorizontal },
  { id: "stage-all", label: "Stage all", group: "Quick", icon: Plus },
  { id: "unstage-all", label: "Unstage all", group: "Quick", icon: Minus },
  { id: "stash-staged", label: "Stash staged", group: "Quick", icon: Archive },
  { id: "fetch", label: "Fetch", group: "Remote", icon: RefreshCw },
  { id: "publish", label: "Publish branch", group: "Remote", icon: ArrowUp },
  { id: "switch-branch", label: "Switch branch", group: "Branches", icon: GitBranch },
  { id: "create-branch", label: "Create branch", group: "Branches", icon: Plus },
  { id: "rename-branch", label: "Rename current branch", group: "Branches", icon: GitBranch },
  { id: "stash-switch", label: "Stash & switch", group: "Branches", icon: Archive },
  { id: "delete-branch", label: "Delete merged branch", group: "Branches", icon: Trash2 },
  { id: "merge-branch", label: "Merge branch", group: "Branches", icon: GitMerge },
  { id: "rebase-branch", label: "Rebase onto branch", group: "Branches", icon: GitBranch },
  { id: "save-stash", label: "Save stash", group: "Stashes", icon: Archive },
  { id: "apply-stash", label: "Apply stash", group: "Stashes", icon: Archive },
  { id: "pop-stash", label: "Pop stash", group: "Stashes", icon: Archive },
  { id: "drop-stash", label: "Delete stash", group: "Stashes", icon: Trash2 },
  { id: "view-incoming", label: "View incoming commits", group: "Remote", icon: ArrowDown },
  { id: "view-outgoing", label: "View outgoing commits", group: "Remote", icon: ArrowUp },
] as const;

export type ComposerAction = (typeof actions)[number]["id"];

export const specialActions = new Set<ComposerAction>([
  "open-repository",
  "open-pr",
  "open-pr-worktree",
  "copy-pr-link",
  "comment-pr",
  "submit-review",
  "create-pr",
  "approve-pr",
  "request-changes",
  "merge-pr",
]);
export const pullRequestActions = new Set<ComposerAction>([
  "open-pr",
  "open-pr-worktree",
  "copy-pr-link",
  "comment-pr",
  "submit-review",
  "approve-pr",
  "request-changes",
  "merge-pr",
]);
export type PullRequestComposerAction = Extract<
  ComposerAction,
  | "open-pr"
  | "open-pr-worktree"
  | "copy-pr-link"
  | "comment-pr"
  | "submit-review"
  | "approve-pr"
  | "request-changes"
  | "merge-pr"
>;
export function isPullRequestAction(
  action: ComposerAction | null,
): action is PullRequestComposerAction {
  return action !== null && pullRequestActions.has(action);
}

export const branchActions = new Set<ComposerAction>([
  "switch-branch",
  "stash-switch",
  "delete-branch",
  "merge-branch",
  "rebase-branch",
]);
export const remoteActions = new Set<ComposerAction>(["fetch", "publish"]);
export const stashActions = new Set<ComposerAction>(["apply-stash", "pop-stash", "drop-stash"]);
export const nameActions = new Set<ComposerAction>([
  "create-branch",
  "rename-branch",
  "save-stash",
]);
export const selectionActions = new Set<ComposerAction>([
  ...branchActions,
  ...remoteActions,
  ...stashActions,
]);
export function actionFromId(id: string): ComposerAction | null {
  return actions.find((item) => item.id === id)?.id ?? null;
}

export function count(value: number, singular: string, plural = `${singular}s`) {
  return `${value} ${value === 1 ? singular : plural}`;
}

export function hasOverlappingChanges(snapshot: GitSnapshot | undefined): boolean {
  if (!snapshot) return false;
  const otherPaths = new Set([
    ...snapshot.unstaged.map((file) => file.path),
    ...snapshot.untracked.map((file) => file.path),
  ]);
  return snapshot.staged.some((file) => otherPaths.has(file.path));
}

export function failureMessage(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  if (cause && typeof cause === "object" && "message" in cause) return String(cause.message);
  return "The command could not be completed. Check repository state and try again.";
}

export function eligibleBranch(
  action: ComposerAction,
  branch: GitRepositoryState["branches"][number],
  repoPath: string,
  current: string,
) {
  if (branch.name === current || (branch.worktree && branch.worktree !== repoPath)) return false;
  if (action === "delete-branch") return !branch.remote && !branch.worktree;
  return true;
}

export function commandFor(
  action: ComposerAction,
  selection: string,
  draft: string,
  includeUntracked: boolean,
  repository: GitRepositoryState,
): GitCommand | null {
  switch (action) {
    case "open-repository":
    case "open-pr":
    case "open-pr-worktree":
    case "copy-pr-link":
    case "comment-pr":
    case "submit-review":
    case "create-pr":
    case "approve-pr":
    case "request-changes":
    case "merge-pr":
      return null;
    case "pull":
      return { kind: "pull" };
    case "push":
      return { kind: "push" };
    case "stash-staged":
      return { kind: "stash-staged" };
    case "fetch":
      return { kind: "fetch", remote: selection };
    case "publish":
      return { kind: "publish", remote: selection };
    case "switch-branch": {
      const branch = repository.branches.find((item) => item.name === selection);
      if (!branch) return null;
      return branch.remote
        ? {
            kind: "track",
            remoteBranch: branch.name,
            branch: branch.name.slice(branch.name.indexOf("/") + 1),
          }
        : { kind: "switch", branch: branch.name };
    }
    case "create-branch":
      return { kind: "create", branch: draft.trim(), startPoint: "HEAD" };
    case "rename-branch":
      return { kind: "rename", branch: draft.trim() };
    case "stash-switch": {
      const branch = repository.branches.find((item) => item.name === selection);
      return branch ? { kind: "stash-switch", branch: selection, remote: branch.remote } : null;
    }
    case "delete-branch":
      return { kind: "delete", branch: selection };
    case "merge-branch":
      return { kind: "merge", branch: selection };
    case "rebase-branch":
      return { kind: "rebase", branch: selection };
    case "save-stash":
      return { kind: "stash-save", message: draft.trim(), includeUntracked };
    case "apply-stash":
      return { kind: "stash-apply", oid: selection };
    case "pop-stash":
      return { kind: "stash-pop", oid: selection };
    case "drop-stash":
      return { kind: "stash-drop", oid: selection };
    case "commit":
    case "stage-all":
    case "unstage-all":
    case "view-incoming":
    case "view-outgoing":
      return null;
  }
}
