import type { FileItem, HistoryCommit } from "@/platform/desktop";

export type CommitFileGroup = Readonly<{
  commit: HistoryCommit;
  files: readonly FileItem[];
}>;

export function commitGroupTitle(commit: HistoryCommit): string {
  return `${commit.summary.replaceAll("/", "∕").replaceAll("\\", "∖")} · ${commit.shortId}`;
}

export function buildCommitGroupFiles(groups: readonly CommitFileGroup[]) {
  return groups.flatMap(({ commit, files }) =>
    files.map((file) => ({
      path: `${commitGroupTitle(commit)}/${file.path}`,
      realPath: file.path,
      source: file,
      commit,
    })),
  );
}
