import { expect, test } from "vitest";

import { buildHistoryGraph } from "./historyGraph";
import { graphLanePosition, visibleGraphEdges } from "./historyGraphViewport";
import { historyGraphUiReducer, panGraphLanes, selectGraphCommit } from "./historyGraphUiSlice";

test("keeps lane spacing readable and bounds visible ancestry in a dense graph", () => {
  const graph = buildHistoryGraph({
    shallow: false,
    commits: Array.from({ length: 81 }, (_, index) => ({
      commitId: String(index),
      shortId: String(index),
      summary: String(index),
      author: "Alice",
      authorEmail: "alice@example.com",
      authoredAt: "2026-10-29",
      relativeTime: "today",
      refs: [],
      parents: index === 0 ? Array.from({ length: 80 }, (_, parent) => String(parent + 1)) : [],
    })),
  });
  const [merge, next] = graph.rows;
  if (!merge || !next) throw new Error("Graph fixture has no rows");
  expect(graphLanePosition(1, 0) - graphLanePosition(0, 0)).toBe(14);
  expect(graphLanePosition(61, 60) - graphLanePosition(60, 60)).toBe(14);
  expect(visibleGraphEdges(merge, 0)).toHaveLength(9);
  expect(visibleGraphEdges(next, 0).length).toBeLessThanOrEqual(9);
  expect(visibleGraphEdges(next, 60).length).toBeLessThanOrEqual(10);
});

test("follows selection only when it leaves the visible lanes and allows independent panning", () => {
  let state = historyGraphUiReducer(
    undefined,
    selectGraphCommit({ commitId: "a", column: 1, totalLanes: 80 }),
  );
  state = historyGraphUiReducer(
    state,
    selectGraphCommit({ commitId: "b", column: 7, totalLanes: 80 }),
  );
  expect(state.laneStart).toBe(0);
  state = historyGraphUiReducer(
    state,
    selectGraphCommit({ commitId: "c", column: 60, totalLanes: 80 }),
  );
  expect(state.laneStart).toBe(53);
  state = historyGraphUiReducer(state, panGraphLanes({ direction: 1, totalLanes: 80 }));
  expect(state).toEqual({ commitId: "c", laneStart: 59 });
  state = historyGraphUiReducer(
    state,
    selectGraphCommit({ commitId: "d", column: 0, totalLanes: 80 }),
  );
  expect(state.laneStart).toBe(0);
});
