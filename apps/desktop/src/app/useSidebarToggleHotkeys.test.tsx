import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { useSidebarToggleHotkeys } from "./useSidebarToggleHotkeys";

const mocks = vi.hoisted(() => ({
  useHotkey: vi.fn(),
}));

vi.mock("@tanstack/react-hotkeys", () => ({
  useHotkey: mocks.useHotkey,
}));

describe("useSidebarToggleHotkeys", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("binds both sidebar shortcuts on history and toggles the correct panels", () => {
    const toggle = vi.fn();

    renderHook(() => useSidebarToggleHotkeys({ activeFeature: "history", toggle }));

    expect(mocks.useHotkey).toHaveBeenNthCalledWith(
      1,
      "Mod+S",
      expect.any(Function),
      expect.objectContaining({ enabled: true, ignoreInputs: false }),
    );
    expect(mocks.useHotkey).toHaveBeenNthCalledWith(
      2,
      "Mod+Shift+S",
      expect.any(Function),
      expect.objectContaining({ enabled: true, ignoreInputs: false }),
    );

    const leftHandler = mocks.useHotkey.mock.calls[0]?.[1] as (event: KeyboardEvent) => void;
    const rightHandler = mocks.useHotkey.mock.calls[1]?.[1] as (event: KeyboardEvent) => void;
    const leftEvent = { preventDefault: vi.fn() } as unknown as KeyboardEvent;
    const rightEvent = { preventDefault: vi.fn() } as unknown as KeyboardEvent;

    leftHandler(leftEvent);
    rightHandler(rightEvent);

    expect(leftEvent.preventDefault).toHaveBeenCalledOnce();
    expect(rightEvent.preventDefault).toHaveBeenCalledOnce();
    expect(toggle).toHaveBeenNthCalledWith(1, "primary");
    expect(toggle).toHaveBeenNthCalledWith(2, "history-files");
  });

  test("disables the right-sidebar shortcut when the current tab only has one sidebar", () => {
    const toggle = vi.fn();

    renderHook(() => useSidebarToggleHotkeys({ activeFeature: "review", toggle }));

    expect(mocks.useHotkey).toHaveBeenNthCalledWith(
      1,
      "Mod+S",
      expect.any(Function),
      expect.objectContaining({ enabled: true }),
    );
    expect(mocks.useHotkey).toHaveBeenNthCalledWith(
      2,
      "Mod+Shift+S",
      expect.any(Function),
      expect.objectContaining({ enabled: false }),
    );

    const leftHandler = mocks.useHotkey.mock.calls[0]?.[1] as (event: KeyboardEvent) => void;
    const leftEvent = { preventDefault: vi.fn() } as unknown as KeyboardEvent;

    leftHandler(leftEvent);

    expect(leftEvent.preventDefault).toHaveBeenCalledOnce();
    expect(toggle).toHaveBeenCalledWith("review");
  });
});
