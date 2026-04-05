import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useLspTokenNavigation } from "@/features/lsp/useLspTokenNavigation";

const mocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
  getLspDefinition: vi.fn(),
  getLspReferences: vi.fn(),
  toastInfo: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/app/hooks", () => ({
  useAppDispatch: () => mocks.dispatch,
}));

vi.mock("@/platform/desktop", () => ({
  desktop: {
    getLspDefinition: mocks.getLspDefinition,
    getLspReferences: mocks.getLspReferences,
  },
}));

vi.mock("sonner", () => ({
  toast: {
    info: mocks.toastInfo,
    error: mocks.toastError,
  },
}));

describe("useLspTokenNavigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createTokenElement(lineIndex = "2") {
    const lineElement = document.createElement("span");
    lineElement.setAttribute("data-line", "3");
    lineElement.setAttribute("data-line-index", lineIndex);
    const tokenElement = document.createElement("span");
    lineElement.appendChild(tokenElement);
    return tokenElement;
  }

  it("opens symbol peek for a single definition result", async () => {
    mocks.getLspDefinition.mockResolvedValue([
      {
        repoPath: "/repo",
        relPath: "src/one.ts",
        uri: "file:///repo/src/one.ts",
        line: 7,
        character: 2,
        endLine: 7,
        endCharacter: 9,
      },
    ]);

    const { result } = renderHook(() =>
      useLspTokenNavigation({ repoPath: "/repo", relPath: "src/current.ts" }),
    );

    result.current.onTokenClick(
      {
        lineNumber: 3,
        lineCharStart: 4,
        tokenElement: createTokenElement(),
      },
      {
        metaKey: true,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as MouseEvent,
    );

    await Promise.resolve();

    expect(mocks.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "sourceControl/openSymbolPeek",
        payload: expect.objectContaining({
          kind: "definitions",
          activeIndex: 0,
          query: "",
          locations: [
            expect.objectContaining({
              repoPath: "/repo",
              relPath: "src/one.ts",
              line: 7,
              character: 2,
            }),
          ],
          sourceDocument: {
            repoPath: "/repo",
            relPath: "src/current.ts",
          },
          anchor: {
            lineNumber: 3,
            lineIndex: "2",
          },
        }),
      }),
    );
  });

  it("opens symbol peek for multiple definition results", async () => {
    mocks.getLspDefinition.mockResolvedValue([
      {
        repoPath: "/repo",
        relPath: "src/one.ts",
        uri: "file:///repo/src/one.ts",
        line: 7,
        character: 2,
        endLine: 7,
        endCharacter: 9,
      },
      {
        repoPath: "/repo",
        relPath: "src/two.ts",
        uri: "file:///repo/src/two.ts",
        line: 4,
        character: 1,
        endLine: 4,
        endCharacter: 6,
      },
    ]);

    const { result } = renderHook(() =>
      useLspTokenNavigation({ repoPath: "/repo", relPath: "src/current.ts" }),
    );

    result.current.onTokenClick(
      {
        lineNumber: 3,
        lineCharStart: 4,
        tokenElement: createTokenElement("2,2"),
      },
      {
        metaKey: true,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as MouseEvent,
    );

    await Promise.resolve();

    expect(mocks.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "sourceControl/openSymbolPeek",
        payload: expect.objectContaining({
          kind: "definitions",
          activeIndex: 0,
          query: "",
          sourceDocument: {
            repoPath: "/repo",
            relPath: "src/current.ts",
          },
          anchor: {
            lineNumber: 3,
            lineIndex: "2,2",
          },
        }),
      }),
    );
  });

  it("opens symbol peek for a single reference result", async () => {
    mocks.getLspReferences.mockResolvedValue([
      {
        repoPath: "/repo",
        relPath: "src/ref.ts",
        uri: "file:///repo/src/ref.ts",
        line: 11,
        character: 0,
        endLine: 11,
        endCharacter: 4,
      },
    ]);

    const { result } = renderHook(() =>
      useLspTokenNavigation({ repoPath: "/repo", relPath: "src/current.ts" }),
    );

    result.current.onTokenClick(
      {
        lineNumber: 3,
        lineCharStart: 4,
        tokenElement: createTokenElement(),
      },
      {
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
        altKey: true,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as MouseEvent,
    );

    await Promise.resolve();

    expect(mocks.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "sourceControl/openSymbolPeek",
        payload: expect.objectContaining({
          kind: "references",
          activeIndex: 0,
          query: "",
          locations: [
            expect.objectContaining({
              repoPath: "/repo",
              relPath: "src/ref.ts",
              line: 11,
              character: 0,
            }),
          ],
          sourceDocument: {
            repoPath: "/repo",
            relPath: "src/current.ts",
          },
          anchor: {
            lineNumber: 3,
            lineIndex: "2",
          },
        }),
      }),
    );
  });

  it("opens symbol peek for multiple reference results", async () => {
    mocks.getLspReferences.mockResolvedValue([
      {
        repoPath: "/repo",
        relPath: "src/ref.ts",
        uri: "file:///repo/src/ref.ts",
        line: 11,
        character: 0,
        endLine: 11,
        endCharacter: 4,
      },
      {
        repoPath: "/repo",
        relPath: "src/other.ts",
        uri: "file:///repo/src/other.ts",
        line: 19,
        character: 1,
        endLine: 19,
        endCharacter: 5,
      },
    ]);

    const { result } = renderHook(() =>
      useLspTokenNavigation({ repoPath: "/repo", relPath: "src/current.ts" }),
    );

    result.current.onTokenClick(
      {
        lineNumber: 3,
        lineCharStart: 4,
        tokenElement: createTokenElement("2,9"),
      },
      {
        metaKey: false,
        ctrlKey: false,
        shiftKey: true,
        altKey: true,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as MouseEvent,
    );

    await Promise.resolve();

    expect(mocks.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "sourceControl/openSymbolPeek",
        payload: expect.objectContaining({
          kind: "references",
          activeIndex: 0,
          query: "",
          sourceDocument: {
            repoPath: "/repo",
            relPath: "src/current.ts",
          },
          anchor: {
            lineNumber: 3,
            lineIndex: "2,9",
          },
        }),
      }),
    );
  });

  it("stores diff return target metadata on symbol peek payloads", async () => {
    mocks.getLspDefinition.mockResolvedValue([
      {
        repoPath: "/repo",
        relPath: "src/one.ts",
        uri: "file:///repo/src/one.ts",
        line: 7,
        character: 2,
        endLine: 7,
        endCharacter: 9,
      },
    ]);

    const { result } = renderHook(() =>
      useLspTokenNavigation(
        { repoPath: "/repo", relPath: "src/current.ts" },
        {
          getReturnToDiffTarget: (source) => ({
            kind: "changes",
            repoPath: "/repo",
            path: "src/current.ts",
            bucket: "unstaged",
            lineNumber: source.lineNumber,
            lineIndex: source.lineIndex,
          }),
        },
      ),
    );

    result.current.onTokenClick(
      {
        lineNumber: 9,
        lineCharStart: 1,
        tokenElement: createTokenElement("8,0"),
      },
      {
        metaKey: true,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as MouseEvent,
    );

    await Promise.resolve();

    expect(mocks.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "sourceControl/openSymbolPeek",
        payload: expect.objectContaining({
          kind: "definitions",
          returnToDiff: {
            kind: "changes",
            repoPath: "/repo",
            path: "src/current.ts",
            bucket: "unstaged",
            lineNumber: 9,
            lineIndex: "8,0",
          },
        }),
      }),
    );
  });
});
