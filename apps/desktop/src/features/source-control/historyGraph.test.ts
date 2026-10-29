import { expect, test } from "vitest";
import type { HistoryGraphCommit } from "@/platform/desktop/history";
import { buildHistoryGraph, graphRefLabel } from "./historyGraph";

function commit(
  id: string,
  parents: string[],
  author = "Alice",
  email = "alice@example.com",
): HistoryGraphCommit {
  return {
    commitId: id,
    shortId: id,
    summary: id,
    parents,
    author,
    authorEmail: email,
    relativeTime: "1 day ago",
    authoredAt: "2026-10-27T12:00:00Z",
    refs: [],
  };
}

test("connects a merge diamond to its actual parents and keeps parallel lanes continuous", () => {
  const result = buildHistoryGraph({
    shallow: false,
    commits: [
      commit("merge", ["main", "feature"]),
      commit("main", ["root"]),
      commit("feature", ["root"], "Bob", "bob@example.com"),
      commit("root", []),
    ],
  });
  const [merge, main, feature, root] = result.rows;
  expect(
    merge?.edges.filter((edge) => edge.part === "outgoing").map((edge) => edge.target),
  ).toEqual([main?.column, feature?.column]);
  expect(main?.edges).toContainEqual({
    part: "through",
    column: feature?.column,
    target: feature?.column,
    color: feature?.color,
  });
  expect(feature?.edges).toContainEqual({
    part: "outgoing",
    column: feature?.column,
    target: root?.column,
    color: root?.color,
  });
  expect(root?.edges.filter((edge) => edge.part === "outgoing")).toEqual([]);
  expect(result.contributors).toEqual([
    { name: "Alice", email: "alice@example.com", commits: 3, merges: 1 },
    { name: "Bob", email: "bob@example.com", commits: 1, merges: 0 },
  ]);
});

test("supports octopus merges, unrelated roots, and exact ref labels", () => {
  const result = buildHistoryGraph({
    shallow: true,
    commits: [
      commit("merge", ["a", "b", "c"]),
      commit("a", []),
      commit("b", []),
      commit("c", []),
      commit("unrelated", []),
    ],
  });
  expect(result.rows[0]?.edges.filter((edge) => edge.part === "outgoing")).toHaveLength(3);
  expect(result.rows.at(-1)?.edges).toEqual([]);
  expect(result.shallow).toBe(true);
  expect(graphRefLabel("refs/remotes/origin/main")).toBe("origin/main");
  expect(graphRefLabel("refs/tags/release,one")).toBe("tag: release,one");
  expect(buildHistoryGraph({ shallow: false, commits: [] }).rows).toEqual([]);
});

test("closes empty lanes and routes surviving ancestry into the next row", () => {
  const graph = buildHistoryGraph({
    shallow: false,
    commits: [commit("merge", ["a", "b", "c"]), commit("a", []), commit("b", []), commit("c", [])],
  });
  expect(graph.rows[1]?.edges).toContainEqual({ part: "through", column: 1, target: 0, color: 1 });
  expect(graph.rows[2]?.column).toBe(0);
  expect(graph.rows[2]?.edges).toContainEqual({ part: "through", column: 1, target: 0, color: 2 });
  expect(graph.rows[3]?.column).toBe(0);
});
