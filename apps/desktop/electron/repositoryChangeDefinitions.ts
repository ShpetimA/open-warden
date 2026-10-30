import path from "node:path";

import type { GitCommand } from "../src/platform/desktop/gitOperations";
import type { RepositoryChangeKind } from "../src/platform/desktop/repositoryEvents";

export type RepositoryWriteImpact = Readonly<{
  kinds: readonly RepositoryChangeKind[];
  paths: readonly string[];
  structure: boolean;
}>;

export type RepositoryWriteEvent = Readonly<{
  operation: string;
  impact: RepositoryWriteImpact;
}>;

const indexChanged: RepositoryWriteImpact = {
  kinds: ["index"],
  paths: [],
  structure: false,
};
const entriesChanged: RepositoryWriteImpact = {
  kinds: ["worktree"],
  paths: [],
  structure: true,
};
const changesDiscarded: RepositoryWriteImpact = {
  kinds: ["worktree", "index"],
  paths: [],
  structure: true,
};
const commitChanged: RepositoryWriteImpact = {
  kinds: ["worktree", "index", "refs"],
  paths: [],
  structure: false,
};
const workingCopyChanged: RepositoryWriteImpact = {
  kinds: ["worktree", "index", "refs"],
  paths: [],
  structure: true,
};
const worktreeCheckedOut: RepositoryWriteImpact = {
  kinds: ["worktree", "index", "refs", "config"],
  paths: [],
  structure: true,
};
const refsChanged: RepositoryWriteImpact = {
  kinds: ["refs"],
  paths: [],
  structure: false,
};
const refsAndConfigurationChanged: RepositoryWriteImpact = {
  kinds: ["refs", "config"],
  paths: [],
  structure: false,
};

export const repositoryWriteEvents = {
  preparePullRequestWorkspace: {
    operation: "preparePullRequestWorkspace",
    impact: worktreeCheckedOut,
  },
  createRepositoryEntry: { operation: "createRepositoryEntry", impact: entriesChanged },
  trashRepositoryEntry: { operation: "trashRepositoryEntry", impact: entriesChanged },
  stageFile: { operation: "stageFile", impact: indexChanged },
  unstageFile: { operation: "unstageFile", impact: indexChanged },
  stageFiles: { operation: "stageFiles", impact: indexChanged },
  unstageFiles: { operation: "unstageFiles", impact: indexChanged },
  stageAll: { operation: "stageAll", impact: indexChanged },
  unstageAll: { operation: "unstageAll", impact: indexChanged },
  updateIndexFileContents: { operation: "updateIndexFileContents", impact: indexChanged },
  discardFile: { operation: "discardFile", impact: changesDiscarded },
  discardFiles: { operation: "discardFiles", impact: changesDiscarded },
  discardAll: { operation: "discardAll", impact: changesDiscarded },
  commitStaged: { operation: "commitStaged", impact: commitChanged },
} as const satisfies Record<string, RepositoryWriteEvent>;

const gitCommandChanges = {
  amend: commitChanged,
  undo: workingCopyChanged,
  "stash-save": workingCopyChanged,
  "stash-staged": workingCopyChanged,
  "stash-apply": workingCopyChanged,
  "stash-pop": workingCopyChanged,
  "stash-drop": refsChanged,
  "stash-switch": worktreeCheckedOut,
  fetch: refsChanged,
  pull: workingCopyChanged,
  merge: workingCopyChanged,
  rebase: workingCopyChanged,
  "cherry-pick": workingCopyChanged,
  revert: workingCopyChanged,
  continue: workingCopyChanged,
  abort: workingCopyChanged,
  skip: workingCopyChanged,
  "restore-file": entriesChanged,
  push: refsChanged,
  publish: refsAndConfigurationChanged,
  switch: worktreeCheckedOut,
  track: worktreeCheckedOut,
  create: refsChanged,
  rename: refsAndConfigurationChanged,
  delete: refsChanged,
  "tag-create": refsChanged,
  "tag-delete": refsChanged,
  "worktree-add": refsChanged,
  "worktree-remove": refsChanged,
} satisfies Record<GitCommand["kind"], RepositoryWriteImpact>;

export function gitCommandWriteEvent(kind: GitCommand["kind"]): RepositoryWriteEvent {
  return { operation: "runGitCommand", impact: gitCommandChanges[kind] };
}

const worktreeConfigurationFiles = new Set([".gitignore", ".gitattributes"]);

export function worktreeChangeKinds(file: string): readonly RepositoryChangeKind[] {
  return worktreeConfigurationFiles.has(path.basename(file))
    ? ["worktree", "config"]
    : ["worktree"];
}

export function worktreeFileWriteEvent(
  file: string,
  options: { createsFile: boolean },
): RepositoryWriteEvent {
  return {
    operation: "updateWorktreeFileContents",
    impact: { kinds: worktreeChangeKinds(file), paths: [file], structure: options.createsFile },
  };
}

const temporaryFilePrefix = ".open-warden-";
const temporaryFileSuffix = ".tmp";

export function repositoryTemporaryFileName(id: string): string {
  return `${temporaryFilePrefix}${id}${temporaryFileSuffix}`;
}

export function isRepositoryTemporaryFile(name: string): boolean {
  return name.startsWith(temporaryFilePrefix) && name.endsWith(temporaryFileSuffix);
}

export type GitMetadataScope = "git-directory" | "refs" | "info" | "worktrees";

const ignoredGitRootEntries = new Set([
  "objects",
  "logs",
  "hooks",
  "rr-cache",
  "COMMIT_EDITMSG",
  "MERGE_MSG",
  "SQUASH_MSG",
  "TAG_EDITMSG",
  "PULLREQ_EDITMSG",
  "description",
]);
const gitRootFileChanges = new Map<string, readonly RepositoryChangeKind[]>([
  ["index", ["index"]],
  ["config", ["config"]],
  ["config.worktree", ["config"]],
]);
const gitInfoConfigurationFiles = new Set(["exclude", "attributes"]);

export function gitMetadataChangeKinds(
  scope: GitMetadataScope,
  filename: string | null,
): readonly RepositoryChangeKind[] {
  if (filename === null)
    return scope === "git-directory" ? ["index", "refs", "config"] : ["refs", "config"];
  if (filename.endsWith(".lock")) return [];

  switch (scope) {
    case "git-directory":
      if (ignoredGitRootEntries.has(filename)) return [];
      return gitRootFileChanges.get(filename) ?? ["refs"];
    case "info":
      return gitInfoConfigurationFiles.has(filename) ? ["config"] : ["refs"];
    case "refs":
      return ["refs"];
    case "worktrees": {
      const parts = filename.split(path.sep);
      return parts.length === 1 || parts[1] === "HEAD" ? ["refs"] : [];
    }
  }
}

export function gitMetadataPathChangeKinds(relative: string): readonly RepositoryChangeKind[] {
  if (!relative) return gitMetadataChangeKinds("git-directory", null);
  const [entry, ...rest] = relative.split(path.sep);
  switch (entry) {
    case "refs":
    case "info":
    case "worktrees":
      return gitMetadataChangeKinds(entry, rest.length ? rest.join(path.sep) : null);
    default:
      return gitMetadataChangeKinds("git-directory", entry);
  }
}
