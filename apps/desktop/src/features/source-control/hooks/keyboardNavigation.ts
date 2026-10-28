import { useHotkey } from "@tanstack/react-hotkeys";

type DirectionHandler = (event: KeyboardEvent) => void;

type VerticalNavigationHotkeysOptions = {
  onNext: DirectionHandler;
  onPrevious: DirectionHandler;
  onExtendNext?: DirectionHandler;
  onExtendPrevious?: DirectionHandler;
};

export const SOURCE_CONTROL_HOTKEY_OPTIONS = {
  ignoreInputs: false,
  preventDefault: false,
  stopPropagation: false,
} as const;

export function focusInputById(inputId: string) {
  const input = document.getElementById(inputId);
  if (!(input instanceof HTMLInputElement)) return false;
  input.focus();
  input.select();
  return true;
}

export function useVerticalNavigationHotkeys({
  onNext,
  onPrevious,
  onExtendNext,
  onExtendPrevious,
}: VerticalNavigationHotkeysOptions) {
  useHotkey(
    "ArrowDown",
    (event) => {
      if (event.shiftKey) return;
      onNext(event);
    },
    SOURCE_CONTROL_HOTKEY_OPTIONS,
  );

  useHotkey(
    "J",
    (event) => {
      if (event.shiftKey) return;
      onNext(event);
    },
    SOURCE_CONTROL_HOTKEY_OPTIONS,
  );

  useHotkey("Shift+ArrowDown", (event) => onExtendNext?.(event), {
    ...SOURCE_CONTROL_HOTKEY_OPTIONS,
    enabled: Boolean(onExtendNext),
  });

  useHotkey("Shift+J", (event) => onExtendNext?.(event), {
    ...SOURCE_CONTROL_HOTKEY_OPTIONS,
    enabled: Boolean(onExtendNext),
  });

  useHotkey(
    "ArrowUp",
    (event) => {
      if (event.shiftKey) return;
      onPrevious(event);
    },
    SOURCE_CONTROL_HOTKEY_OPTIONS,
  );

  useHotkey(
    "K",
    (event) => {
      if (event.shiftKey) return;
      onPrevious(event);
    },
    SOURCE_CONTROL_HOTKEY_OPTIONS,
  );

  useHotkey("Shift+ArrowUp", (event) => onExtendPrevious?.(event), {
    ...SOURCE_CONTROL_HOTKEY_OPTIONS,
    enabled: Boolean(onExtendPrevious),
  });

  useHotkey("Shift+K", (event) => onExtendPrevious?.(event), {
    ...SOURCE_CONTROL_HOTKEY_OPTIONS,
    enabled: Boolean(onExtendPrevious),
  });
}
