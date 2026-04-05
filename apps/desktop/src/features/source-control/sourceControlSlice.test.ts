import { describe, expect, it } from "vitest";

import {
  openFileViewer,
  openSymbolPeek,
  setSymbolPeekActiveIndex,
  setSymbolPeekQuery,
  sourceControlReducer,
} from "@/features/source-control/sourceControlSlice";

describe("sourceControlSlice symbol peek", () => {
  it("opens symbol peek for definitions and updates selection state", () => {
    const openedState = sourceControlReducer(
      undefined,
      openSymbolPeek({
        kind: "definitions",
        locations: [
          {
            repoPath: "/repo",
            relPath: "src/a.ts",
            uri: "file:///repo/src/a.ts",
            line: 4,
            character: 2,
            endLine: 4,
            endCharacter: 8,
          },
          {
            repoPath: "/repo",
            relPath: "src/b.ts",
            uri: "file:///repo/src/b.ts",
            line: 8,
            character: 1,
            endLine: 8,
            endCharacter: 7,
          },
        ],
        activeIndex: 0,
        query: "",
        sourceDocument: {
          repoPath: "/repo",
          relPath: "src/current.ts",
        },
        anchor: {
          lineNumber: 3,
          lineIndex: "2",
        },
      }),
    );

    const activeState = sourceControlReducer(openedState, setSymbolPeekActiveIndex(1));
    const queriedState = sourceControlReducer(activeState, setSymbolPeekQuery("src/b"));

    expect(queriedState.symbolPeek).toEqual({
      kind: "definitions",
      locations: openedState.symbolPeek?.locations ?? [],
      activeIndex: 1,
      query: "src/b",
      sourceDocument: {
        repoPath: "/repo",
        relPath: "src/current.ts",
      },
      anchor: {
        lineNumber: 3,
        lineIndex: "2",
      },
    });
  });

  it("clears symbol peek when a file viewer jump is committed", () => {
    const openedState = sourceControlReducer(
      undefined,
      openSymbolPeek({
        kind: "references",
        locations: [
          {
            repoPath: "/repo",
            relPath: "src/ref.ts",
            uri: "file:///repo/src/ref.ts",
            line: 12,
            character: 0,
            endLine: 12,
            endCharacter: 4,
          },
        ],
        activeIndex: 0,
        query: "",
        sourceDocument: {
          repoPath: "/repo",
          relPath: "src/current.ts",
        },
        anchor: {
          lineNumber: 8,
          lineIndex: "7",
        },
      }),
    );

    const jumpedState = sourceControlReducer(
      openedState,
      openFileViewer({
        repoPath: "/repo",
        relPath: "src/ref.ts",
        line: 12,
        column: 0,
        focusKey: 3,
      }),
    );

    expect(jumpedState.symbolPeek).toBeNull();
    expect(jumpedState.fileViewerTarget).toEqual({
      repoPath: "/repo",
      relPath: "src/ref.ts",
      line: 12,
      column: 0,
      focusKey: 3,
    });
  });

  it("keeps pull-request sidebar mode for PR-origin file viewer jumps", () => {
    const nextState = sourceControlReducer(
      undefined,
      openFileViewer({
        repoPath: "/repo",
        relPath: "src/ref.ts",
        line: 12,
        column: 0,
        focusKey: 3,
        returnToDiff: {
          kind: "pull-request",
          repoPath: "/repo",
          path: "src/origin.ts",
          lineNumber: 22,
          lineIndex: "21,0",
        },
      }),
    );

    expect(nextState.changesSidebarMode).toBe("pull-request");
    expect(nextState.fileViewerTarget?.returnToDiff).toEqual({
      kind: "pull-request",
      repoPath: "/repo",
      path: "src/origin.ts",
      lineNumber: 22,
      lineIndex: "21,0",
    });
  });
});
