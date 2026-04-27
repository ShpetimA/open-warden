import type { GitStatus, GitStatusEntry } from "@pierre/trees";

import type { FileStatus } from "@/features/source-control/types";

export function toPierreGitStatus(status: FileStatus | undefined): GitStatus | null {
  if (!status) {
    return null;
  }

  if (
    status === "added" ||
    status === "deleted" ||
    status === "modified" ||
    status === "renamed" ||
    status === "untracked"
  ) {
    return status;
  }

  return "modified";
}

export function buildPierreGitStatusEntries<TFile>(
  files: ReadonlyArray<TFile>,
  getPath: (file: TFile) => string,
  getStatus: (file: TFile) => FileStatus | undefined,
): GitStatusEntry[] {
  const entries: GitStatusEntry[] = [];

  for (const file of files) {
    const status = toPierreGitStatus(getStatus(file));
    if (status) {
      entries.push({ path: getPath(file), status });
    }
  }

  return entries;
}
