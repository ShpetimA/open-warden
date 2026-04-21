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

function getVisibleNavItems<T>(regionId: string, readValue: NavRegionValueReader<T>): T[] {
  const regionElement = document.querySelector<HTMLElement>(`[data-nav-region="${regionId}"]`);
  if (!regionElement) {
    return [];
  }

  const navRows = regionElement.querySelectorAll<HTMLElement>(
    "[data-tree-file-row='true'][data-nav-index]",
  );
  if (navRows.length === 0) {
    return [];
  }

  const orderedItems: Array<T | undefined> = [];

  for (const element of navRows) {
    const navIndex = Number(element.dataset.navIndex);
    if (!Number.isInteger(navIndex) || navIndex < 0) {
      continue;
    }

    const value = readValue(element);
    if (value === null) {
      continue;
    }

    if (orderedItems[navIndex] === undefined) {
      orderedItems[navIndex] = value;
    }
  }

  const visibleItems: T[] = [];
  for (const item of orderedItems) {
    if (item !== undefined) {
      visibleItems.push(item);
    }
  }

  return visibleItems;
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
