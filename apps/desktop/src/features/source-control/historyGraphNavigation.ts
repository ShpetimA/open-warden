import type { HistoryGraphViewData } from "./historyGraph";
import { graphRefLabel } from "./historyGraph";

export type GraphFilter = Readonly<{
  query: string;
  author: { name: string; email: string } | null;
}>;

export type GraphNavigation = Readonly<{
  rows: HistoryGraphViewData["rows"];
  byId: ReadonlyMap<string, { row: HistoryGraphViewData["rows"][number]; index: number }>;
  matchingIndices: readonly number[];
  matchPosition: ReadonlyMap<number, number>;
  filtering: boolean;
  totalLanes: number;
}>;

export function buildGraphNavigation(
  data: HistoryGraphViewData,
  filter: GraphFilter,
): GraphNavigation {
  const query = filter.query.trim().toLowerCase();
  const matchingIndices: number[] = [];
  const byId = new Map<string, { row: HistoryGraphViewData["rows"][number]; index: number }>();
  const matchPosition = new Map<number, number>();
  const filtering = Boolean(query || filter.author);
  data.rows.forEach((row, index) => {
    byId.set(row.commit.commitId, { row, index });
    const commit = row.commit;
    const authorMatches =
      !filter.author ||
      (filter.author.email
        ? commit.authorEmail.toLowerCase() === filter.author.email.toLowerCase()
        : commit.author === filter.author.name);
    const textMatches =
      !query ||
      [
        commit.summary,
        commit.author,
        commit.authorEmail,
        commit.commitId,
        ...commit.refs.map(graphRefLabel),
      ].some((value) => value.toLowerCase().includes(query));
    if (authorMatches && textMatches) {
      matchPosition.set(index, matchingIndices.length);
      matchingIndices.push(index);
    }
  });
  return {
    rows: data.rows,
    byId,
    matchingIndices,
    matchPosition,
    filtering,
    totalLanes: Math.max(1, Math.round((data.width - 24) / 16)),
  };
}
