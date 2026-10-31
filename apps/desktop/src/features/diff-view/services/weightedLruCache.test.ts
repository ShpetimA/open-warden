import { describe, expect, it } from "vitest";

import { WeightedLruCache } from "./weightedLruCache";

describe("WeightedLruCache", () => {
  it("evicts least-recently-used entries until both limits are satisfied", () => {
    const cache = new WeightedLruCache<string, string>({ maxEntries: 3, maxWeight: 10 });

    cache.set("a", "first", 4);
    cache.set("b", "second", 4);
    expect(cache.get("a")).toBe("first");

    cache.set("c", "third", 4);

    expect(cache.has("a")).toBe(true);
    expect(cache.has("b")).toBe(false);
    expect(cache.has("c")).toBe(true);
    expect(cache.weight).toBe(8);
  });

  it("does not retain an entry that exceeds the complete weight budget", () => {
    const cache = new WeightedLruCache<string, string>({ maxEntries: 3, maxWeight: 10 });

    cache.set("small", "kept", 3);
    cache.set("oversized", "discarded", 11);

    expect(cache.get("small")).toBe("kept");
    expect(cache.has("oversized")).toBe(false);
    expect(cache.size).toBe(1);
    expect(cache.weight).toBe(3);
  });

  it("replaces an existing entry without retaining its previous weight", () => {
    const cache = new WeightedLruCache<string, string>({ maxEntries: 3, maxWeight: 10 });

    cache.set("same", "first", 7);
    cache.set("same", "second", 2);

    expect(cache.get("same")).toBe("second");
    expect(cache.size).toBe(1);
    expect(cache.weight).toBe(2);
  });
});
