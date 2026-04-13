import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useDiffLspHover } from "@/features/diff-view/useDiffLspHover";

const mocks = vi.hoisted(() => ({
  getLspHover: vi.fn(),
}));

vi.mock("@/platform/desktop", () => ({
  desktop: {
    getLspHover: mocks.getLspHover,
  },
}));

function createTokenElement() {
  const token = document.createElement("span");
  Object.defineProperty(token, "getBoundingClientRect", {
    value: () => ({
      top: 40,
      left: 20,
      width: 12,
      height: 18,
      right: 32,
      bottom: 58,
      x: 20,
      y: 40,
      toJSON: () => ({}),
    }),
  });
  document.body.appendChild(token);
  return token;
}

describe("useDiffLspHover", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = "";
  });

  it("ignores token clicks without Meta/Ctrl", () => {
    const { result } = renderHook(() =>
      useDiffLspHover({
        document: { repoPath: "/repo", relPath: "src/current.ts" },
        resetKey: "current-diff",
      }),
    );
    const tokenElement = createTokenElement();
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();

    let handled = false;
    act(() => {
      handled = result.current.onTokenClick(
        {
          lineNumber: 4,
          lineCharStart: 6,
          tokenElement,
          side: "additions",
        },
        {
          metaKey: false,
          ctrlKey: false,
          altKey: false,
          shiftKey: false,
          preventDefault,
          stopPropagation,
        } as unknown as MouseEvent,
      );
    });

    expect(handled).toBe(false);
    expect(result.current.hoverState.open).toBe(false);
    expect(preventDefault).not.toHaveBeenCalled();
    expect(stopPropagation).not.toHaveBeenCalled();
    expect(mocks.getLspHover).not.toHaveBeenCalled();
  });

  it("fetches and opens hover info on Meta click", async () => {
    mocks.getLspHover.mockResolvedValue({
      text: "(alias) foo\n\nDetailed description for foo.",
    });
    const { result } = renderHook(() =>
      useDiffLspHover({
        document: { repoPath: "/repo", relPath: "src/current.ts" },
        resetKey: "current-diff",
      }),
    );
    const tokenElement = createTokenElement();
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();

    let handled = false;
    act(() => {
      handled = result.current.onTokenClick(
        {
          lineNumber: 7,
          lineCharStart: 3,
          tokenElement,
          side: "additions",
        },
        {
          metaKey: true,
          ctrlKey: false,
          altKey: false,
          shiftKey: false,
          preventDefault,
          stopPropagation,
        } as unknown as MouseEvent,
      );
    });

    expect(handled).toBe(true);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(mocks.getLspHover).toHaveBeenCalledWith({
      repoPath: "/repo",
      relPath: "src/current.ts",
      line: 7,
      character: 3,
    });
    expect(result.current.hoverState.open).toBe(true);
    expect(result.current.hoverState.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.hoverState.loading).toBe(false);
    });

    expect(result.current.hoverState.open).toBe(true);
    expect(result.current.hoverState.content).toContain("alias");
  });

  it("ignores non-addition lines", () => {
    const { result } = renderHook(() =>
      useDiffLspHover({
        document: { repoPath: "/repo", relPath: "src/current.ts" },
        resetKey: "current-diff",
      }),
    );
    const tokenElement = createTokenElement();

    let handled = false;
    act(() => {
      handled = result.current.onTokenClick(
        {
          lineNumber: 7,
          lineCharStart: 3,
          tokenElement,
          side: "deletions",
        },
        {
          metaKey: true,
          ctrlKey: false,
          altKey: false,
          shiftKey: false,
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
        } as unknown as MouseEvent,
      );
    });

    expect(handled).toBe(false);
    expect(result.current.hoverState.open).toBe(false);
    expect(mocks.getLspHover).not.toHaveBeenCalled();
  });

  it("keeps popover open when scrolling inside the popover", async () => {
    mocks.getLspHover.mockResolvedValue({
      text: "(alias) foo",
    });
    const { result } = renderHook(() =>
      useDiffLspHover({
        document: { repoPath: "/repo", relPath: "src/current.ts" },
        resetKey: "current-diff",
      }),
    );
    const popover = document.createElement("div");
    const scrollContent = document.createElement("div");
    popover.appendChild(scrollContent);
    document.body.appendChild(popover);
    result.current.popoverRef.current = popover;

    act(() => {
      result.current.onTokenClick(
        {
          lineNumber: 7,
          lineCharStart: 3,
          tokenElement: createTokenElement(),
          side: "additions",
        },
        {
          metaKey: true,
          ctrlKey: false,
          altKey: false,
          shiftKey: false,
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
        } as unknown as MouseEvent,
      );
    });

    await waitFor(() => {
      expect(result.current.hoverState.loading).toBe(false);
    });

    act(() => {
      scrollContent.dispatchEvent(new Event("scroll", { bubbles: false }));
    });

    expect(result.current.hoverState.open).toBe(true);
  });
});
