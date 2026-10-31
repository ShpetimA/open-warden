import type { TimelineEntry, TimelineItem } from "./types";

function sameActor(left: { login: string } | null, right: { login: string } | null) {
  return (left?.login ?? null) === (right?.login ?? null);
}

/**
 * Orders the conversation by time and folds noise: a run of commits by one author becomes one
 * "pushed N commits" item, and a run of the same event by one actor (Bitbucket reports every
 * push as "updated") becomes one item with a count.
 */
export function buildTimeline(entries: TimelineEntry[]): TimelineItem[] {
  const ordered = entries.toSorted((left, right) => left.createdAt.localeCompare(right.createdAt));
  const items: TimelineItem[] = [];

  for (const entry of ordered) {
    const previous = items.at(-1);
    if (entry.kind === "commit") {
      if (previous?.kind === "commits" && sameActor(previous.author, entry.author)) {
        previous.commits.push(entry);
      } else {
        items.push({
          kind: "commits",
          id: `commits-${entry.id}`,
          author: entry.author,
          createdAt: entry.createdAt,
          commits: [entry],
        });
      }
      continue;
    }
    if (entry.kind === "event") {
      if (
        previous?.kind === "event" &&
        previous.event === entry.event &&
        sameActor(previous.actor, entry.actor)
      ) {
        previous.count += 1;
        previous.lastAt = entry.createdAt;
      } else {
        items.push({ ...entry, count: 1, lastAt: entry.createdAt });
      }
      continue;
    }
    items.push(entry);
  }

  return items;
}
