import { useEffect, useRef, useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { HotkeysProvider, useHotkey } from "@tanstack/react-hotkeys";
import { describe, expect, test, vi } from "vitest";

import { useCommandComposerHotkeys } from "./useCommandComposerHotkeys";
import {
  CommandComposerLayout,
  CommandComposerLayoutHost,
  useCommandComposerRootRef,
} from "./CommandComposerLayout";

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

function HostedComposerNavigation({
  onBack,
  onClose,
  onRun,
  busy = false,
}: {
  onBack: () => void;
  onClose: () => void;
  onRun: () => void;
  busy?: boolean;
}) {
  const rootRef = useCommandComposerRootRef();
  const searchRef = useRef<HTMLInputElement>(null);
  const runButtonRef = useRef<HTMLButtonElement>(null);
  const [pane, setPane] = useState<"choice" | "review">("choice");
  const [highlighted, setHighlighted] = useState("first");

  useCommandComposerHotkeys({
    rootRef,
    searchRef,
    runButtonRef,
    pane,
    query: "",
    enabledChoiceIds: ["first", "second"],
    activeChoiceId: highlighted,
    canRun: true,
    hasError: false,
    busy,
    onHighlight: setHighlighted,
    onSelect: () => setPane("review"),
    onBack,
    onClose,
    onRun,
  });

  useEffect(() => {
    if (pane === "choice") searchRef.current?.focus();
    else runButtonRef.current?.focus();
  }, [pane]);

  return (
    <CommandComposerLayout pane={pane}>
      {pane === "choice" ? (
        <>
          <input ref={searchRef} aria-label="Search pull requests" />
          <span data-testid="hosted-highlighted">{highlighted}</span>
        </>
      ) : (
        <button ref={runButtonRef} onClick={onRun}>
          Confirm
        </button>
      )}
    </CommandComposerLayout>
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

  test("focuses hosted choices and handles arrows, Enter, and Escape inside the composer", () => {
    const onBack = vi.fn();
    const onClose = vi.fn();
    const onRun = vi.fn();
    render(
      <CommandComposerLayoutHost>
        <HostedComposerNavigation onBack={onBack} onClose={onClose} onRun={onRun} />
      </CommandComposerLayoutHost>,
    );

    const search = screen.getByRole("textbox", { name: "Search pull requests" });
    expect(search).toHaveFocus();

    fireEvent.keyDown(search, { key: "ArrowDown" });
    expect(screen.getByTestId("hosted-highlighted")).toHaveTextContent("second");

    fireEvent.keyDown(search, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onBack).not.toHaveBeenCalled();

    fireEvent.change(search, { target: { value: "branch" } });
    fireEvent.keyDown(search, { key: "Backspace" });
    expect(onBack).not.toHaveBeenCalled();

    fireEvent.change(search, { target: { value: "" } });
    fireEvent.keyDown(search, { key: "Backspace" });
    expect(onBack).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(search, { key: "Enter" });
    const confirm = screen.getByRole("button", { name: "Confirm" });
    expect(confirm).toHaveFocus();

    fireEvent.keyDown(confirm, { key: "Enter" });
    expect(onRun).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(confirm, { key: "ArrowLeft" });
    expect(onBack).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(confirm, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onBack).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(confirm, { key: "Backspace" });
    expect(onBack).toHaveBeenCalledTimes(3);
  });

  test("keeps the composer open while an operation is running", () => {
    let closed = false;

    render(
      <CommandComposerLayoutHost>
        <HostedComposerNavigation
          busy
          onBack={() => {}}
          onClose={() => {
            closed = true;
          }}
          onRun={() => {}}
        />
      </CommandComposerLayoutHost>,
    );

    fireEvent.keyDown(screen.getByRole("textbox", { name: "Search pull requests" }), {
      key: "Escape",
    });

    expect(closed).toBe(false);
  });
});
