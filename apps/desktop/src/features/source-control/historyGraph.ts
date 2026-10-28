import type { HistoryGraph, HistoryGraphCommit } from "@/platform/desktop/history";

type Lane = Readonly<{ id: string; color: number }>;
export type GraphEdge = Readonly<{
  column: number;
  target: number;
  color: number;
  part: "incoming" | "outgoing" | "through";
}>;
export type GraphRow = Readonly<{
  commit: HistoryGraphCommit;
  column: number;
  color: number;
  edges: readonly GraphEdge[];
}>;
export type HistoryContributor = Readonly<{
  name: string;
  email: string;
  commits: number;
  merges: number;
}>;
export type HistoryGraphViewData = Readonly<{
  rows: readonly GraphRow[];
  width: number;
  contributors: readonly HistoryContributor[];
  shallow: boolean;
}>;

export function buildHistoryGraph(data: HistoryGraph): HistoryGraphViewData {
  const lanes: Array<Lane | null> = [];
  const rows: GraphRow[] = [];
  const contributors = new Map<
    string,
    { name: string; email: string; commits: number; merges: number }
  >();
  let nextColor = 0;
  let columns = 1;

  function emptyColumn() {
    const empty = lanes.findIndex((lane) => lane === null);
    return empty >= 0 ? empty : lanes.length;
  }

  for (const commit of data.commits) {
    const incoming = lanes.slice();
    let column = lanes.findIndex((lane) => lane?.id === commit.commitId);
    if (column < 0) {
      column = emptyColumn();
      lanes[column] = { id: commit.commitId, color: nextColor++ };
    }
    const color = lanes[column]?.color ?? 0;
    lanes[column] = null;
    const edges: GraphEdge[] = [];
    incoming.forEach((lane, index) => {
      if (lane)
        edges.push({
          column: index,
          target: index,
          color: lane.color,
          part: lane.id === commit.commitId ? "incoming" : "through",
        });
    });

    for (const [index, parent] of [...new Set(commit.parents)].entries()) {
      let target = lanes.findIndex((lane) => lane?.id === parent);
      if (target < 0) {
        target = index === 0 && lanes[column] === null ? column : emptyColumn();
        lanes[target] = { id: parent, color: index === 0 ? color : nextColor++ };
      }
      edges.push({ column, target, color: lanes[target]?.color ?? color, part: "outgoing" });
    }
    columns = Math.max(columns, lanes.length, column + 1);
    while (lanes.length && lanes.at(-1) === null) lanes.pop();
    rows.push({ commit, column, color, edges });

    const identity = commit.authorEmail.toLowerCase() || commit.author;
    const contributor = contributors.get(identity) ?? {
      name: commit.author || "Unknown",
      email: commit.authorEmail,
      commits: 0,
      merges: 0,
    };
    contributor.commits += 1;
    if (commit.parents.length > 1) contributor.merges += 1;
    contributors.set(identity, contributor);
  }

  return {
    rows,
    width: Math.max(64, columns * 16 + 24),
    contributors: [...contributors.values()].toSorted(
      (a, b) => b.commits - a.commits || a.name.localeCompare(b.name),
    ),
    shallow: data.shallow,
  };
}

export function graphRefLabel(ref: string) {
  return ref
    .replace(/^refs\/heads\//, "")
    .replace(/^refs\/remotes\//, "")
    .replace(/^refs\/tags\//, "tag: ");
}
