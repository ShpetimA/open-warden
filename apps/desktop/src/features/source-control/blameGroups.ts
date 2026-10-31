import type { GitBlameLine } from "@/platform/desktop";

export type BlameGroup = Readonly<GitBlameLine> & { readonly endLine: number };

export function groupBlameLines(lines: readonly GitBlameLine[]): readonly BlameGroup[] {
  const groups: BlameGroup[] = [];
  for (const line of lines) {
    const previous = groups.at(-1);
    if (previous && previous.commitId === line.commitId && previous.endLine + 1 === line.line) {
      groups[groups.length - 1] = { ...previous, endLine: line.line };
    } else {
      groups.push({ ...line, endLine: line.line });
    }
  }
  return groups;
}

export const BLAME_LINE_HEIGHT = 20;

export function isWorkingTreeCommit(commitId: string) {
  return /^0+$/.test(commitId);
}
