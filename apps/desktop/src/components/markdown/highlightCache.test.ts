import { expect, test } from "vitest";

import { createHighlightCache } from "./highlightCache";

test("shares in-flight work and evicts older code blocks", async () => {
  const rendered: string[] = [];
  const highlight = createHighlightCache(
    async (code) => {
      rendered.push(code);
      return `<pre>${code}</pre>`;
    },
    { maxEntries: 2, maxBytes: 1024 },
  );

  const first = highlight("first", "text");
  expect(highlight("first", "text")).toBe(first);
  await first;
  await highlight("second", "text");
  expect(highlight("first", "text")).toBe(first);
  await highlight("third", "text");
  await highlight("second", "text");

  expect(rendered).toEqual(["first", "second", "third", "second"]);
});

test("does not retain generated HTML above the byte budget", async () => {
  let renders = 0;
  const highlight = createHighlightCache(
    async () => {
      renders += 1;
      return "x".repeat(1024);
    },
    { maxEntries: 2, maxBytes: 100 },
  );

  await highlight("large", "text");
  await highlight("large", "text");

  expect(renders).toBe(2);
});

test("a failed highlight can be retried instead of poisoning the shared cache", async () => {
  let renders = 0;
  const highlight = createHighlightCache(async () => {
    renders += 1;
    if (renders === 1) throw new Error("Highlighter unavailable");
    return "Recovered";
  });

  await expect(highlight("code", "text")).rejects.toThrow("Highlighter unavailable");
  await expect(highlight("code", "text")).resolves.toBe("Recovered");
});
