import type { HistoryCommit } from "./types";

export type HistoryComparison = {
  baseRef: string;
  headRef: string;
  olderCommitId: string;
  newerCommitId: string;
};

export function getHistoryComparison(
  commits: readonly HistoryCommit[],
  selectedCommitIds: readonly string[] = [],
): HistoryComparison | null {
  if (selectedCommitIds.length !== 2) return null;

  const selected = selectedCommitIds.map((commitId) => {
    const index = commits.findIndex((commit) => commit.commitId === commitId);
    return index >= 0 ? { commit: commits[index]!, index } : null;
  });

  if (selected.some((item) => item === null)) return null;

  const first = selected[0]!;
  const second = selected[1]!;
  const older = first.index > second.index ? first : second;
  const newer = first.index > second.index ? second : first;

  return {
    baseRef: `${older.commit.commitId}^`,
    headRef: newer.commit.commitId,
    olderCommitId: older.commit.commitId,
    newerCommitId: newer.commit.commitId,
  };
}
