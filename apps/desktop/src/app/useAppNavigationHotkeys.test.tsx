import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { useAppNavigationHotkeys } from "./useAppNavigationHotkeys";

function Navigation() {
  const [destination, setDestination] = useState("workspace");
  useAppNavigationHotkeys({
    openProject: () => setDestination("project picker"),
    openSettings: () => setDestination("settings"),
  });
  return (
    <>
      <input aria-label="Commit message" />
      <output>{destination}</output>
    </>
  );
}

it("opens the project picker and Settings from an input without swallowing reopen", () => {
  render(<Navigation />);
  const input = screen.getByRole("textbox");
  input.focus();
  expect(fireEvent.keyDown(input, { key: "t", code: "KeyT", ctrlKey: true })).toBe(false);
  expect(screen.getByRole("status")).toHaveTextContent("project picker");
  fireEvent.keyDown(input, { key: ",", code: "Comma", ctrlKey: true });
  expect(screen.getByRole("status")).toHaveTextContent("settings");
  fireEvent.keyDown(input, { key: "T", code: "KeyT", ctrlKey: true, shiftKey: true });
  expect(screen.getByRole("status")).toHaveTextContent("settings");
  fireEvent.keyDown(input, { key: "o", code: "KeyO", ctrlKey: true });
  expect(screen.getByRole("status")).toHaveTextContent("project picker");
});

it("uses Command on macOS for new tabs and Settings", () => {
  render(
    <HotkeysProvider defaultOptions={{ hotkey: { platform: "mac" } }}>
      <Navigation />
    </HotkeysProvider>,
  );
  const input = screen.getByRole("textbox");
  input.focus();
  fireEvent.keyDown(input, { key: "t", code: "KeyT", metaKey: true });
  expect(screen.getByRole("status")).toHaveTextContent("project picker");
  fireEvent.keyDown(input, { key: ",", code: "Comma", metaKey: true });
  expect(screen.getByRole("status")).toHaveTextContent("settings");
});
