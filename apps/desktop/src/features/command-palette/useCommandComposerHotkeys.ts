import type { RefObject } from "react";
import { useHotkey } from "@tanstack/react-hotkeys";

import type { ComposerPane } from "./commandComposerFlow";

type Props = {
  rootRef: RefObject<HTMLDivElement | null>;
  searchRef: RefObject<HTMLInputElement | null>;
  pane: ComposerPane;
  query: string;
  enabledChoiceIds: string[];
  activeChoiceId?: string;
  canRun: boolean;
  hasError: boolean;
  busy: boolean;
  onHighlight: (id: string) => void;
  onSelect: (id: string) => void;
  onBack: () => void;
  onClose: () => void;
  onRun: () => void;
};

function hasEditableValue(target: EventTarget | null): boolean {
  return (
    (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) &&
    target.value.length > 0
  );
}

export function useCommandComposerHotkeys({
  rootRef,
  searchRef,
  pane,
  query,
  enabledChoiceIds,
  activeChoiceId,
  canRun,
  hasError,
  busy,
  onHighlight,
  onSelect,
  onBack,
  onClose,
  onRun,
}: Props) {
  const options = {
    target: rootRef,
    ignoreInputs: false,
    preventDefault: false,
    stopPropagation: true,
  };

  function moveChoice(direction: 1 | -1) {
    if ((pane !== "action" && pane !== "choice") || !enabledChoiceIds.length) return;
    const index = enabledChoiceIds.indexOf(activeChoiceId ?? "");
    const next = (index + direction + enabledChoiceIds.length) % enabledChoiceIds.length;
    const id = enabledChoiceIds[next];
    if (id) onHighlight(id);
  }

  useHotkey(
    "ArrowDown",
    (event) => {
      if (pane !== "action" && pane !== "choice") return;
      if (!enabledChoiceIds.length) return;
      event.preventDefault();
      moveChoice(1);
    },
    options,
  );

  useHotkey(
    "ArrowUp",
    (event) => {
      if (pane !== "action" && pane !== "choice") return;
      if (!enabledChoiceIds.length) return;
      event.preventDefault();
      moveChoice(-1);
    },
    options,
  );

  useHotkey(
    "Enter",
    (event) => {
      if (event.target instanceof HTMLButtonElement) return;
      if ((pane === "action" || pane === "choice") && activeChoiceId) {
        event.preventDefault();
        onSelect(activeChoiceId);
      } else if (pane === "review" && !(event.target instanceof HTMLTextAreaElement) && canRun) {
        event.preventDefault();
        onRun();
      } else if (pane === "execute" && hasError && canRun) {
        event.preventDefault();
        onRun();
      }
    },
    options,
  );

  useHotkey(
    "ArrowRight",
    (event) => {
      if (
        event.target instanceof HTMLTextAreaElement ||
        (event.target instanceof HTMLInputElement && event.target !== searchRef.current) ||
        (event.target === searchRef.current && query)
      )
        return;
      if ((pane === "action" || pane === "choice") && activeChoiceId) {
        event.preventDefault();
        onSelect(activeChoiceId);
      }
    },
    options,
  );

  useHotkey(
    "ArrowLeft",
    (event) => {
      if (pane === "action" || hasEditableValue(event.target)) return;
      event.preventDefault();
      onBack();
    },
    options,
  );

  useHotkey(
    "Backspace",
    (event) => {
      if (pane === "action" || hasEditableValue(event.target)) return;
      event.preventDefault();
      onBack();
    },
    options,
  );

  useHotkey(
    "Mod+Enter",
    (event) => {
      if ((pane !== "review" && pane !== "execute") || !canRun) return;
      event.preventDefault();
      onRun();
    },
    options,
  );

  useHotkey(
    "Escape",
    (event) => {
      event.preventDefault();
      if (busy) return;
      if (pane === "action") onClose();
      else onBack();
    },
    options,
  );

  useHotkey(
    "Mod+K",
    (event) => {
      event.preventDefault();
      if (!busy) onClose();
    },
    options,
  );
}
