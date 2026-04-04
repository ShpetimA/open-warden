import { describe, expect, it, vi } from "vitest";

vi.mock("./serverCatalog", () => ({
  serverConfigForLanguage: () => null,
}));

import { LspSessionManager, normalizeLspHoverResponse } from "./sessionManager";

describe("normalizeLspHoverResponse", () => {
  it("returns plain string hover text", () => {
    expect(normalizeLspHoverResponse({ contents: "const answer: number" })).toEqual({
      text: "const answer: number",
    });
  });

  it("normalizes markdown hover content to plain text", () => {
    expect(
      normalizeLspHoverResponse({
        contents: {
          kind: "markdown",
          value: "**number**\n\n```ts\nconst answer = 42;\n```",
        },
      }),
    ).toEqual({
      text: "number\n\nconst answer = 42;",
    });
  });

  it("joins marked string arrays", () => {
    expect(
      normalizeLspHoverResponse({
        contents: [{ language: "ts", value: "const answer = 42;" }, "Returns the answer."],
      }),
    ).toEqual({
      text: "const answer = 42;\n\nReturns the answer.",
    });
  });

  it("returns null for empty hover content", () => {
    expect(normalizeLspHoverResponse({ contents: { kind: "plaintext", value: "   " } })).toBeNull();
  });
});

describe("LspSessionManager.getHover", () => {
  it("returns null for unsupported languages", async () => {
    const manager = new LspSessionManager({ onDiagnostics: () => {} });

    await expect(
      manager.getHover({
        repoPath: "/tmp/repo",
        relPath: "README.md",
        line: 1,
        character: 0,
      }),
    ).resolves.toBeNull();
  });

  it("returns null when the document has not been synced", async () => {
    const manager = new LspSessionManager({ onDiagnostics: () => {} });

    await expect(
      manager.getHover({
        repoPath: "/tmp/repo",
        relPath: "src/example.ts",
        line: 3,
        character: 4,
      }),
    ).resolves.toBeNull();
  });
});
