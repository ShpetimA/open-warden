import { describe, expect, it } from "vitest";

import { parseMarkdown } from "@/features/markdown/parser";

describe("parseMarkdown", () => {
  it("renders fenced code blocks", () => {
    const html = parseMarkdown("```ts\nconst foo = 1;\n```");

    expect(html).toContain('<pre><code class="language-ts">const foo = 1;</code></pre>');
  });

  it("renders links with safe rel", () => {
    const html = parseMarkdown("[Docs](https://example.com)");

    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("sanitizes unsafe html", () => {
    const html = parseMarkdown('<img src=x onerror="alert(1)" />');

    expect(html).not.toContain("onerror");
  });
});
