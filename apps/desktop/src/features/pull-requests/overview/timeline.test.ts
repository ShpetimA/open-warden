import { expect, it } from "vitest";

import { buildTimeline } from "./timeline";
import type { PersonView, TimelineEntry } from "./types";

const ana: PersonView = { login: "ana", name: "Ana", avatarUrl: null };
const ben: PersonView = { login: "ben", name: "Ben", avatarUrl: null };

function edited(id: string, createdAt: string, actor = ana): TimelineEntry {
  return { kind: "event", id, actor, createdAt, event: "edited", detail: null };
}

function commit(id: string, createdAt: string, author = ana): TimelineEntry {
  return { kind: "commit", id, author, createdAt, sha: id, message: `commit ${id}` };
}

it("folds repeated edits by the same actor into one item", () => {
  const items = buildTimeline([
    edited("a", "2026-10-21T10:00:00Z"),
    edited("b", "2026-10-21T11:00:00Z"),
    edited("c", "2026-10-22T09:00:00Z"),
  ]);

  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({ kind: "event", count: 3, lastAt: "2026-10-22T09:00:00Z" });
});

it("groups consecutive commits and keeps comments between them in order", () => {
  const items = buildTimeline([
    commit("3", "2026-10-21T12:00:00Z"),
    commit("1", "2026-10-21T10:00:00Z"),
    {
      kind: "comment",
      id: "c1",
      author: ben,
      createdAt: "2026-10-21T13:00:00Z",
      body: "Looks good",
      url: null,
    },
    commit("2", "2026-10-21T11:00:00Z"),
    commit("4", "2026-10-21T14:00:00Z", ben),
  ]);

  expect(items.map((item) => item.kind)).toEqual(["commits", "comment", "commits"]);
  expect(items[0]).toMatchObject({ commits: [{ id: "1" }, { id: "2" }, { id: "3" }] });
});

it("does not fold events from different actors", () => {
  const items = buildTimeline([
    edited("a", "2026-10-21T10:00:00Z", ana),
    edited("b", "2026-10-21T11:00:00Z", ben),
  ]);

  expect(items).toHaveLength(2);
});
