import { useRef, useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { HotkeysProvider, useHotkey } from "@tanstack/react-hotkeys";
import { describe, expect, test, vi } from "vitest";

import { useCommandComposerHotkeys } from "./useCommandComposerHotkeys";

function BackgroundNavigation({ onMove }: { onMove: () => void }) {
  useHotkey("ArrowDown", onMove, { ignoreInputs: false });
  return null;
}

function ComposerNavigation() {
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [highlighted, setHighlighted] = useState("first");
  useCommandComposerHotkeys({
    rootRef,
    searchRef,
    pane: "choice",
    query: "",
    enabledChoiceIds: ["first", "second"],
    activeChoiceId: highlighted,
    canRun: false,
    hasError: false,
    busy: false,
    onHighlight: setHighlighted,
    onSelect: () => {},
    onBack: () => {},
    onClose: () => {},
    onRun: () => {},
  });
  return (
    <div ref={rootRef}>
      <input ref={searchRef} aria-label="Composer search" />
      <span data-testid="highlighted">{highlighted}</span>
    </div>
  );
}

describe("composer keyboard priority", () => {
  test("disables background hotkeys while the composer handles arrow keys", () => {
    const onBackgroundMove = vi.fn();
    const { rerender } = render(
      <>
        <HotkeysProvider defaultOptions={{ hotkey: { enabled: false } }}>
          <BackgroundNavigation onMove={onBackgroundMove} />
        </HotkeysProvider>
        <ComposerNavigation />
      </>,
    );

    fireEvent.keyDown(screen.getByRole("textbox", { name: "Composer search" }), {
      key: "ArrowDown",
    });
    fireEvent.keyDown(document.body, { key: "ArrowDown" });

    expect(screen.getByTestId("highlighted")).toHaveTextContent("second");
    expect(onBackgroundMove).not.toHaveBeenCalled();

    rerender(
      <>
        <HotkeysProvider defaultOptions={{ hotkey: { enabled: true } }}>
          <BackgroundNavigation onMove={onBackgroundMove} />
        </HotkeysProvider>
        <ComposerNavigation />
      </>,
    );
    fireEvent.keyDown(document.body, { key: "ArrowDown" });
    expect(onBackgroundMove).toHaveBeenCalledTimes(1);
  });
});
