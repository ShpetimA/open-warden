import { fireEvent, renderHook } from "@testing-library/react";
import { expect, it } from "vitest";
import { focusInputById, useVerticalNavigationHotkeys } from "./keyboardNavigation";

it("focuses and selects an input by id", () => {
  const input = document.createElement("input");
  input.id = "history-filter";
  input.value = "history";
  document.body.appendChild(input);
  expect(focusInputById("history-filter")).toBe(true);
  expect(document.activeElement).toBe(input);
  expect(input.selectionStart).toBe(0);
  expect(input.selectionEnd).toBe(input.value.length);
  expect(focusInputById("missing-filter")).toBe(false);
  input.remove();
});

it("dispatches actual J/K, arrow and shifted navigation once per key", () => {
  const movements: string[] = [];
  renderHook(() =>
    useVerticalNavigationHotkeys({
      onNext: () => movements.push("next"),
      onPrevious: () => movements.push("previous"),
      onExtendNext: () => movements.push("extend-next"),
      onExtendPrevious: () => movements.push("extend-previous"),
    }),
  );
  for (const [key, code, shiftKey] of [
    ["j", "KeyJ", false],
    ["k", "KeyK", false],
    ["ArrowDown", "ArrowDown", false],
    ["ArrowUp", "ArrowUp", false],
    ["J", "KeyJ", true],
    ["K", "KeyK", true],
    ["ArrowDown", "ArrowDown", true],
    ["ArrowUp", "ArrowUp", true],
  ] as const)
    fireEvent.keyDown(document, { key, code, shiftKey });
  expect(movements).toEqual([
    "next",
    "previous",
    "next",
    "previous",
    "extend-next",
    "extend-previous",
    "extend-next",
    "extend-previous",
  ]);
});

it("does not move with shifted keys when range selection is unavailable", () => {
  const movements: string[] = [];
  renderHook(() =>
    useVerticalNavigationHotkeys({
      onNext: () => movements.push("next"),
      onPrevious: () => movements.push("previous"),
    }),
  );
  fireEvent.keyDown(document, { key: "J", code: "KeyJ", shiftKey: true });
  fireEvent.keyDown(document, { key: "ArrowUp", code: "ArrowUp", shiftKey: true });
  expect(movements).toEqual([]);
});
