import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useEffect, useRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { gitApi } from "@/features/source-control/api";
import { LspSymbolPeekContainer } from "@/features/lsp/components/LspSymbolPeek";
import {
  openSymbolPeek,
  sourceControlReducer,
} from "@/features/source-control/sourceControlSlice";

const mocks = vi.hoisted(() => ({
  useHotkey: vi.fn(),
  useGetRepoFileQuery: vi.fn(),
}));

vi.mock("@tanstack/react-hotkeys", () => ({
  useHotkey: mocks.useHotkey,
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({
    resolvedTheme: "dark",
  }),
}));

vi.mock("@/features/source-control/diffLineFocus", () => ({
  DIFF_LINE_FOCUS_CSS: "",
  useDiffLineFocus: () => {},
  getRenderedLineOffset: () => ({
    line: document.createElement("div"),
    top: 24,
    bottom: 48,
    height: 24,
  }),
}));

vi.mock("@pierre/diffs/react", () => ({
  File: ({ file }: { file: { name: string; contents: string } }) => (
    <div data-testid="peek-preview">{`${file.name}:${file.contents}`}</div>
  ),
}));

vi.mock("@/features/source-control/api", async () => {
  const actual = await vi.importActual<typeof import("@/features/source-control/api")>(
    "@/features/source-control/api",
  );
  return {
    ...actual,
    useGetRepoFileQuery: mocks.useGetRepoFileQuery,
  };
});

function createStore() {
  return configureStore({
    reducer: {
      sourceControl: sourceControlReducer,
      [gitApi.reducerPath]: gitApi.reducer,
    },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(gitApi.middleware),
  });
}

function findLocationButton(labelText: RegExp) {
  return screen
    .getAllByRole("button")
    .find((button) => labelText.test(button.textContent ?? ""));
}

function SymbolPeekHarness() {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = document.createElement("div");
    containerRef.current?.appendChild(host);
  }, []);

  return (
    <div ref={containerRef}>
      <LspSymbolPeekContainer
        document={{ repoPath: "/repo", relPath: "src/current.ts" }}
        containerRef={containerRef}
      />
    </div>
  );
}

describe("LspSymbolPeek", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    Object.defineProperty(window, "ResizeObserver", {
      configurable: true,
      writable: true,
      value: class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    });
    Element.prototype.scrollIntoView = vi.fn();

    mocks.useGetRepoFileQuery.mockImplementation((arg) => {
      if (!arg || typeof arg !== "object" || !("relPath" in arg)) {
        return { data: undefined, isFetching: false, error: undefined };
      }

      if (arg.relPath === "src/a.ts") {
        return {
          data: { name: "src/a.ts", contents: "alpha\nbeta hit\ngamma second" },
          isFetching: false,
          error: undefined,
        };
      }

      if (arg.relPath === "src/b.ts") {
        return {
          data: { name: "src/b.ts", contents: "zero\nomega target\nlast" },
          isFetching: false,
          error: undefined,
        };
      }

      return { data: undefined, isFetching: false, error: undefined };
    });
  });

  it("renders grouped symbol results and updates the preview on selection", () => {
    const store = createStore();
    store.dispatch(
      openSymbolPeek({
        kind: "references",
        locations: [
          {
            repoPath: "/repo",
            relPath: "src/a.ts",
            uri: "file:///repo/src/a.ts",
            line: 2,
            character: 1,
            endLine: 2,
            endCharacter: 4,
          },
          {
            repoPath: "/repo",
            relPath: "src/a.ts",
            uri: "file:///repo/src/a.ts",
            line: 3,
            character: 0,
            endLine: 3,
            endCharacter: 6,
          },
          {
            repoPath: "/repo",
            relPath: "src/b.ts",
            uri: "file:///repo/src/b.ts",
            line: 2,
            character: 0,
            endLine: 2,
            endCharacter: 5,
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
          lineIndex: "2,9",
        },
      }),
    );

    render(
      <Provider store={store}>
        <SymbolPeekHarness />
      </Provider>,
    );

    expect(
      screen.getAllByText((_, element) => (element?.textContent ?? "").includes("References (3)"))
        .length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("src/a.ts").length).toBeGreaterThan(0);
    expect(screen.getAllByText("src/b.ts").length).toBeGreaterThan(0);
    expect(screen.getByTestId("peek-preview")).toHaveTextContent(
      /src\/a\.ts:alpha\s+beta hit\s+gamma second/i,
    );

    const previewButton = findLocationButton(/Ln 2, Col 1Line 2/i);
    expect(previewButton).toBeDefined();
    fireEvent.click(previewButton!);

    expect(screen.getByTestId("peek-preview")).toHaveTextContent(
      /src\/b\.ts:zero\s+omega target\s+last/i,
    );
  });

  it("commits the active selection on Enter and closes the peek", () => {
    const store = createStore();
    store.dispatch(
      openSymbolPeek({
        kind: "definitions",
        locations: [
          {
            repoPath: "/repo",
            relPath: "src/a.ts",
            uri: "file:///repo/src/a.ts",
            line: 2,
            character: 1,
            endLine: 2,
            endCharacter: 4,
          },
          {
            repoPath: "/repo",
            relPath: "src/b.ts",
            uri: "file:///repo/src/b.ts",
            line: 2,
            character: 0,
            endLine: 2,
            endCharacter: 5,
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
          lineIndex: "2,9",
        },
        returnToDiff: {
          kind: "changes",
          repoPath: "/repo",
          path: "src/current.ts",
          bucket: "unstaged",
          lineNumber: 3,
          lineIndex: "2,9",
        },
      }),
    );

    render(
      <Provider store={store}>
        <SymbolPeekHarness />
      </Provider>,
    );

    const previewButton = findLocationButton(/Ln 2, Col 1Line 2/i);
    expect(previewButton).toBeDefined();
    fireEvent.click(previewButton!);

    const enterHandler = [...mocks.useHotkey.mock.calls]
      .reverse()
      .find((call) => call[0] === "Enter")?.[1] as
      | ((event: KeyboardEvent) => void)
      | undefined;

    expect(enterHandler).toBeTypeOf("function");

    act(() => {
      enterHandler?.({
        preventDefault: vi.fn(),
      } as unknown as KeyboardEvent);
    });

    expect(store.getState().sourceControl.symbolPeek).toBeNull();
    expect(store.getState().sourceControl.fileViewerTarget).toEqual(
      expect.objectContaining({
        repoPath: "/repo",
        relPath: "src/b.ts",
        line: 2,
        column: 0,
        returnToDiff: {
          kind: "changes",
          repoPath: "/repo",
          path: "src/current.ts",
          bucket: "unstaged",
          lineNumber: 3,
          lineIndex: "2,9",
        },
      }),
    );
  });
});
