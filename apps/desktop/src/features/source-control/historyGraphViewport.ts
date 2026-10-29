import type { GraphRow } from "./historyGraph";

export const GRAPH_VISIBLE_LANES = 8;
export const GRAPH_LANE_PITCH = 14;
export const GRAPH_VIEWPORT_WIDTH = 128;

export function graphLanePosition(column: number, start: number) {
  return 12 + (column - start) * GRAPH_LANE_PITCH;
}

export function visibleGraphEdges(row: GraphRow, start: number) {
  const end = start + GRAPH_VISIBLE_LANES - 1;
  const continuations = new Set<string>();
  return row.edges.filter((edge) => {
    if (Math.max(edge.column, edge.target) < start || Math.min(edge.column, edge.target) > end)
      return false;
    if (edge.part === "outgoing" && (edge.target < start || edge.target > end)) {
      const side = edge.target < start ? "left" : "right";
      if (continuations.has(side)) return false;
      continuations.add(side);
    }
    return true;
  });
}
