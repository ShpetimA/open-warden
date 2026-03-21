import { useHotkey } from "@tanstack/react-hotkeys";

import type { BucketedFile } from "@/features/source-control/types";

type DirectionHandler = (event: KeyboardEvent) => void;

type VerticalNavigationHotkeysOptions = {
  onNext: DirectionHandler;
  onPrevious: DirectionHandler;
  onExtendNext?: DirectionHandler;
  onExtendPrevious?: DirectionHandler;
};

type NavRegionValueReader<T> = (element: HTMLElement) => T | null;

export const SOURCE_CONTROL_HOTKEY_OPTIONS = {
  ignoreInputs: false,
  preventDefault: false,
  stopPropagation: false,
} as const;

function sortByNavIndex(a: HTMLElement, b: HTMLElement) {
  return Number(a.dataset.navIndex) - Number(b.dataset.navIndex);
}

function getVisibleNavItems<T>(regionId: string, readValue: NavRegionValueReader<T>): T[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>(
      `[data-nav-region="${regionId}"] [data-tree-file-row="true"]`,
    ),
  )
    .sort(sortByNavIndex)
    .flatMap((element) => {
      const value = readValue(element);
      return value === null ? [] : [value];
    });
}

export function getVisibleFilePaths(regionId: string) {
  return getVisibleNavItems(regionId, (element) => {
    const filePath = element.dataset.filePath;
    return filePath && filePath.length > 0 ? filePath : null;
  });
}

export function getVisibleBucketedFiles(regionId: string): BucketedFile[] {
  return getVisibleNavItems(regionId, (element) => {
    const path = element.dataset.filePath;
    const bucket = element.dataset.bucket;
    if (!path || !bucket) return null;
    return { path, bucket } as BucketedFile;
  });
}

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
