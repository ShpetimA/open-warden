import type { RepositoryChange } from "@/platform/desktop/repositoryEvents";

export function repositoryChangeTags(change: RepositoryChange) {
  const { repoPath, kinds, paths, structure } = change;
  const refs = kinds.includes("refs");
  const config = kinds.includes("config");
  const index = kinds.includes("index");
  const worktree = kinds.includes("worktree");
  const tags: Array<{
    type:
      | "Snapshot"
      | "RepoFiles"
      | "Branches"
      | "HistoryCommits"
      | "WorkingVersions"
      | "ComparisonVersions"
      | "ComparedFiles"
      | "FileVersions"
      | "RepositoryState";
    id: string;
  }> = [];
  if (worktree || index || refs || config) tags.push({ type: "Snapshot", id: repoPath });
  if (index || structure || config) tags.push({ type: "RepoFiles", id: repoPath });
  if (index || refs || config) tags.push({ type: "RepositoryState", id: repoPath });
  if (refs || config)
    tags.push(
      { type: "Branches", id: repoPath },
      { type: "HistoryCommits", id: repoPath },
      { type: "ComparedFiles", id: repoPath },
      { type: "ComparisonVersions", id: repoPath },
    );
  if (index || refs || (worktree && !paths.length))
    tags.push({ type: "WorkingVersions", id: repoPath });
  else if (worktree)
    for (const file of paths)
      tags.push(
        { type: "FileVersions", id: `${repoPath}:${file}` },
        { type: "FileVersions", id: `file:${repoPath}:worktree:${file}` },
      );
  return tags;
}

export function hasRepositoryEventBridge() {
  return (
    typeof window !== "undefined" &&
    typeof (window.desktopBridge ?? window.openWarden)?.onRepositoryChanged === "function"
  );
}
