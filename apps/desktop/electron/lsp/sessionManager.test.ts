import { describe, expect, it, vi } from "vitest";

vi.mock("./serverCatalog", () => ({
  resolveServerConfigForLanguage: async () => null,
}));

import {
  LspSessionManager,
  normalizeLspHoverResponse,
  normalizeLspLocationResponse,
} from "./sessionManager";

describe("normalizeLspHoverResponse", () => {
  it("returns plain string hover text", () => {
    expect(normalizeLspHoverResponse({ contents: "const answer: number" })).toEqual({
      text: "const answer: number",
    });
  });

  it("preserves markdown hover content", () => {
    expect(
      normalizeLspHoverResponse({
        contents: {
          kind: "markdown",
          value: "**number**\n\n```ts\nconst answer = 42;\n```",
        },
      }),
    ).toEqual({
      text: "**number**\n\n```ts\nconst answer = 42;\n```",
    });
  });

  it("joins marked string arrays and preserves code formatting", () => {
    expect(
      normalizeLspHoverResponse({
        contents: [{ language: "ts", value: "const answer = 42;" }, "Returns the answer."],
      }),
    ).toEqual({
      text: "`const answer = 42;`\n\nReturns the answer.",
    });
  });

  it("formats multiline marked string values as fenced code blocks", () => {
    expect(
      normalizeLspHoverResponse({
        contents: [
          {
            language: "rust",
            value: 'fn demo() {\n    println!("hello");\n}',
          },
        ],
      }),
    ).toEqual({
      text: '```rust\nfn demo() {\n    println!("hello");\n}\n```',
    });
  });

  it("returns null for empty hover content", () => {
    expect(normalizeLspHoverResponse({ contents: { kind: "plaintext", value: "   " } })).toBeNull();
  });
});

describe("normalizeLspLocationResponse", () => {
  it("normalizes location responses inside the repo", () => {
    expect(
      normalizeLspLocationResponse("/tmp/repo", {
        uri: "file:///tmp/repo/src/example.ts",
        range: {
          start: { line: 4, character: 2 },
          end: { line: 4, character: 8 },
        },
      }),
    ).toEqual([
      {
        repoPath: "/tmp/repo",
        relPath: "src/example.ts",
        uri: "file:///tmp/repo/src/example.ts",
        line: 5,
        character: 2,
        endLine: 5,
        endCharacter: 8,
      },
    ]);
  });

  it("normalizes location links using target selection ranges", () => {
    expect(
      normalizeLspLocationResponse("/tmp/repo", {
        targetUri: "file:///tmp/repo/src/example.ts",
        targetSelectionRange: {
          start: { line: 1, character: 4 },
          end: { line: 1, character: 10 },
        },
      }),
    ).toEqual([
      {
        repoPath: "/tmp/repo",
        relPath: "src/example.ts",
        uri: "file:///tmp/repo/src/example.ts",
        line: 2,
        character: 4,
        endLine: 2,
        endCharacter: 10,
      },
    ]);
  });

  it("drops locations outside the repo root", () => {
    expect(
      normalizeLspLocationResponse("/tmp/repo", {
        uri: "file:///tmp/other/src/example.ts",
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 1 },
        },
      }),
    ).toEqual([]);
  });

  it("normalizes backslash separators in returned relative paths", () => {
    expect(
      normalizeLspLocationResponse("/tmp/repo", {
        uri: "file:///tmp/repo/src%5Cexample.ts",
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 1 },
        },
      }),
    ).toEqual([
      {
        repoPath: "/tmp/repo",
        relPath: "src/example.ts",
        uri: "file:///tmp/repo/src%5Cexample.ts",
        line: 1,
        character: 0,
        endLine: 1,
        endCharacter: 1,
      },
    ]);
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

describe("LspSessionManager navigation", () => {
  it("returns no definitions for unsupported languages", async () => {
    const manager = new LspSessionManager({ onDiagnostics: () => {} });

    await expect(
      manager.getDefinition({
        repoPath: "/tmp/repo",
        relPath: "README.md",
        line: 1,
        character: 0,
      }),
    ).resolves.toEqual([]);
  });

  it("returns no references when the document has not been synced", async () => {
    const manager = new LspSessionManager({ onDiagnostics: () => {} });

    await expect(
      manager.getReferences({
        repoPath: "/tmp/repo",
        relPath: "src/example.ts",
        line: 3,
        character: 4,
      }),
    ).resolves.toEqual([]);
  });
});
