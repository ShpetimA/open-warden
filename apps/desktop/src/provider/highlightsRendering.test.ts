// @vitest-environment node
import { afterEach, expect, it } from "vitest";
import {
  DiffHunksRenderer,
  disposeHighlighter,
  getSharedHighlighter,
  parseDiffFromFile,
} from "@pierre/diffs";

import { getDiffTheme } from "@/features/diff-view/diffRenderConfig";

const theme = getDiffTheme();

afterEach(async () => {
  await disposeHighlighter();
});

it("preserves token offsets for Unicode source with both application themes", async () => {
  const highlighter = await getSharedHighlighter({
    themes: Object.values(theme),
    langs: [],
    preferredHighlighter: "highlights",
  });
  const source = 'export const greeting = "Hello 🌍"; const total = 42;';
  const { tokens } = highlighter.codeToTokens(source, {
    lang: "typescript",
    themes: theme,
    defaultColor: false,
  });
  const line = tokens[0] ?? [];

  expect(highlighter.name).toBe("highlights");
  expect(line.length).toBeGreaterThan(1);
  expect(line.map((token) => token.content).join("")).toBe(source);
  for (const token of line) {
    expect(source.slice(token.offset, token.offset + token.content.length)).toBe(token.content);
  }
});

it.each(["split", "unified"] as const)(
  "renders highlighted %s diffs with word changes and interactive token positions",
  async (diffStyle) => {
    await getSharedHighlighter({
      themes: Object.values(theme),
      langs: [],
      preferredHighlighter: "highlights",
    });
    const renderer = new DiffHunksRenderer({ theme, diffStyle, useTokenTransformer: true });
    const diff = parseDiffFromFile(
      { name: "invoice.ts", contents: 'export const greeting = "Hello 🌍";\n' },
      { name: "invoice.ts", contents: 'export const greeting = "Welcome 🌍";\n' },
    );

    try {
      const result = await renderer.asyncRender(diff);
      const html = renderer.renderFullHTML(result);

      expect(html).toContain('data-line-type="change-addition"');
      expect(html).toContain('data-line-type="change-deletion"');
      expect(html).toContain("data-diff-span");
      expect(html).toContain('data-char="24"');
      expect(html).toContain("--diffs-token-dark:");
      expect(html).toContain("--diffs-token-light:");
      expect(html).toContain("Welcome");
    } finally {
      renderer.cleanUp();
    }
  },
);
