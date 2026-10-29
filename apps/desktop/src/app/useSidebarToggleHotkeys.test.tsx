import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { FEATURE_SIDEBARS, type SidebarConfig } from "@/app/featureNavigation";
import { useSidebarToggleHotkeys } from "./useSidebarToggleHotkeys";

function Harness({ sidebars, toggles }: { sidebars: SidebarConfig[]; toggles: string[] }) {
  useSidebarToggleHotkeys({ sidebars, toggle: (panelId) => toggles.push(panelId) });
  return <input aria-label="Filter" />;
}

test("Cmd+B and Cmd+D toggle independent panels, including while typing", () => {
  const toggles: string[] = [];
  render(
    <HotkeysProvider defaultOptions={{ hotkey: { platform: "mac" } }}>
      <Harness sidebars={FEATURE_SIDEBARS.history} toggles={toggles} />
    </HotkeysProvider>,
  );
  const input = screen.getByRole("textbox");
  fireEvent.keyDown(input, { key: "b", code: "KeyB", metaKey: true });
  fireEvent.keyDown(input, { key: "d", code: "KeyD", metaKey: true });
  fireEvent.keyDown(input, { key: "B", code: "KeyB", metaKey: true, shiftKey: true });
  expect(toggles).toEqual(["primary", "history-files"]);
});

test("does not bind Cmd+D when the view has no second panel", () => {
  const toggles: string[] = [];
  render(
    <HotkeysProvider defaultOptions={{ hotkey: { platform: "mac" } }}>
      <Harness sidebars={FEATURE_SIDEBARS.review} toggles={toggles} />
    </HotkeysProvider>,
  );
  fireEvent.keyDown(document, { key: "d", code: "KeyD", metaKey: true });
  fireEvent.keyDown(document, { key: "b", code: "KeyB", metaKey: true });
  expect(toggles).toEqual(["review"]);
});
