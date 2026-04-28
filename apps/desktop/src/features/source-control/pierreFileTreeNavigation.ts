import type { FileTree as PierreFileTreeModel } from "@pierre/trees";

import {
  collectVisibleFiles,
  collectVisibleRowPaths,
  type PierreFileTreeNavFile,
} from "@/features/source-control/components/pierreFileTree";
import {
  buildSourceControlFileTree,
  type BuildSourceControlFileTreeOptions,
} from "@/features/source-control/fileTree";
import type { Bucket, BucketedFile } from "@/features/source-control/types";

type PierreTreeNavEntry = {
  files: ReadonlyArray<PierreFileTreeNavFile>;
  model: PierreFileTreeModel;
  selectedPath?: string;
  treeOptions?: BuildSourceControlFileTreeOptions<PierreFileTreeNavFile>;
};

type PierreTreeNavOptions = {
  selectedPath?: string;
  treeOptions?: BuildSourceControlFileTreeOptions<PierreFileTreeNavFile>;
};

const pierreTreeNavRegistry = new Map<string, PierreTreeNavEntry[]>();

export function registerPierreFileTreeNav(
  regionId: string,
  files: ReadonlyArray<PierreFileTreeNavFile>,
  model: PierreFileTreeModel,
  options: PierreTreeNavOptions = {},
) {
  const entries = pierreTreeNavRegistry.get(regionId) ?? [];
  const existingEntry = entries.find((entry) => entry.model === model);
  if (existingEntry) {
    existingEntry.files = files;
    existingEntry.selectedPath = options.selectedPath;
    existingEntry.treeOptions = options.treeOptions;
    return;
  }

  entries.push({
    files,
    model,
    selectedPath: options.selectedPath,
    treeOptions: options.treeOptions,
  });
  pierreTreeNavRegistry.set(regionId, entries);
}

export function unregisterPierreFileTreeNav(regionId: string, model: PierreFileTreeModel) {
  const entries = pierreTreeNavRegistry.get(regionId);
  if (!entries) {
    return;
  }

  const nextEntries = entries.filter((entry) => entry.model !== model);
  if (nextEntries.length === 0) {
    pierreTreeNavRegistry.delete(regionId);
    return;
  }

  pierreTreeNavRegistry.set(regionId, nextEntries);
}

export function getPierreFileTreeVisiblePaths(regionId: string) {
  const entries = pierreTreeNavRegistry.get(regionId);
  if (!entries) {
    return [];
  }

  return entries.flatMap((entry) => collectVisibleFilesForEntry(entry).map((file) => file.path));
}

export function getPierreFileTreeVisibleBucketedFiles(regionId: string): BucketedFile[] {
  const entries = pierreTreeNavRegistry.get(regionId);
  if (!entries) {
    return [];
  }

  const files: BucketedFile[] = [];
  for (const entry of entries) {
    for (const file of collectVisibleFilesForEntry(entry)) {
      if (file.bucket) {
        files.push({ bucket: file.bucket, path: file.realPath ?? file.path } as BucketedFile);
      }
    }
  }
  return files;
}

export function getPierreFileTreeFocusedPath(regionId: string): string | null {
  const entries = pierreTreeNavRegistry.get(regionId);
  if (!entries) {
    return null;
  }

  const focusedEntry = entries.find((entry) => pierreFileTreeHasDomFocus(entry.model));
  if (focusedEntry) {
    return focusedEntry.model.getFocusedPath() ?? null;
  }

  for (const entry of entries) {
    const focusedPath = entry.model.getFocusedPath();
    if (focusedPath) return focusedPath;
  }

  return null;
}

export function getPierreFileTreeFocusedBucketedFile(regionId: string): BucketedFile | null {
  const entries = pierreTreeNavRegistry.get(regionId);
  if (!entries) {
    return null;
  }

  const focusedEntry = entries.find((entry) => pierreFileTreeHasDomFocus(entry.model));
  if (focusedEntry) {
    return getEntryFocusedBucketedFile(focusedEntry);
  }

  for (const entry of entries) {
    const focusedFile = getEntryFocusedBucketedFile(entry);
    if (focusedFile) return focusedFile;
  }

  return null;
}

function collectVisibleFilesForEntry(entry: PierreTreeNavEntry) {
  const treeNodes = buildSourceControlFileTree(entry.files, entry.treeOptions);

  return collectVisibleFiles(treeNodes, entry.model);
}

export function scrollPierreFileTreePathIntoView(regionId: string, path: string) {
  const entries = pierreTreeNavRegistry.get(regionId);
  const entry = entries?.find((candidate) =>
    collectVisibleRowPathsForEntry(candidate).includes(path),
  );
  if (!entry || !path) {
    return;
  }

  ensurePierreFileTreeOwnsFocus(entry.model, path);
  entry.model.focusPath(path);
  scrollPierreFileTreeRowIntoView(entry.model, path);
}

export function scrollPierreFileTreeRealPathIntoView(regionId: string, realPath: string) {
  const entries = pierreTreeNavRegistry.get(regionId);
  const entry = entries?.find((candidate) =>
    candidate.files.some((file) => (file.realPath ?? file.path) === realPath),
  );
  if (!entry || !realPath) {
    return;
  }

  const treePath = entry.files.find((file) => (file.realPath ?? file.path) === realPath)?.path;
  if (!treePath) {
    return;
  }

  ensurePierreFileTreeOwnsFocus(entry.model, treePath);
  entry.model.focusPath(treePath);
  scrollPierreFileTreeRowIntoView(entry.model, treePath);
}

export function scrollPierreFileTreeBucketedFileIntoView(
  regionId: string,
  bucket: Bucket,
  path: string,
) {
  const entries = pierreTreeNavRegistry.get(regionId);
  const entry = entries?.find((candidate) =>
    candidate.files.some((file) => file.bucket === bucket && (file.realPath ?? file.path) === path),
  );
  if (!entry || !path) {
    return;
  }

  const treePath = entry.files.find(
    (file) => file.bucket === bucket && (file.realPath ?? file.path) === path,
  )?.path;
  if (!treePath) {
    return;
  }

  ensurePierreFileTreeOwnsFocus(entry.model, treePath);
  entry.model.focusPath(treePath);
  scrollPierreFileTreeRowIntoView(entry.model, treePath);
}

export function movePierreFileTreeFocus(regionId: string, next: boolean) {
  return movePierreFileTreeFocusTarget(regionId, next)?.targetPath ?? null;
}

export function movePierreFileTreeFocusFile(regionId: string, next: boolean) {
  const movement = movePierreFileTreeFocusTarget(regionId, next);
  if (!movement) {
    return null;
  }

  return findFileInEntry(movement.entry, movement.targetPath);
}

function movePierreFileTreeFocusTarget(regionId: string, next: boolean) {
  const entries = pierreTreeNavRegistry.get(regionId);
  if (!entries || entries.length === 0) {
    return null;
  }

  const activeEntryIndex = getActiveEntryIndex(entries);
  const entry = entries[activeEntryIndex];
  if (!entry) {
    return null;
  }

  const movement = moveWithinPierreFileTree(entry, next);
  if (!movement.focusedPath) {
    return null;
  }

  if (movement.didMove) {
    scrollPierreFileTreeRowIntoView(entry.model, movement.focusedPath);
    return { entry, targetPath: movement.focusedPath };
  }

  const nextEntry = findAdjacentEntryWithVisibleRows(entries, activeEntryIndex, next);
  if (!nextEntry) {
    return { entry, targetPath: movement.focusedPath };
  }

  const nextEntryVisiblePaths = collectVisibleRowPathsForEntry(nextEntry);
  const targetPath = next ? nextEntryVisiblePaths[0] : nextEntryVisiblePaths.at(-1);
  if (!targetPath) {
    return { entry, targetPath: movement.focusedPath };
  }

  ensurePierreFileTreeOwnsFocus(nextEntry.model, targetPath);
  nextEntry.model.focusPath(targetPath);
  scrollPierreFileTreeRowIntoView(nextEntry.model, targetPath);
  return { entry: nextEntry, targetPath };
}

function moveWithinPierreFileTree(entry: PierreTreeNavEntry, next: boolean) {
  const focusedPath = entry.model.getFocusedPath();
  const nearestFocusedPath = entry.model.focusNearestPath(focusedPath);
  if (!nearestFocusedPath) {
    return { didMove: false, focusedPath: null };
  }

  ensurePierreFileTreeOwnsFocus(entry.model, nearestFocusedPath);

  if (focusedPath !== nearestFocusedPath) {
    return { didMove: true, focusedPath: nearestFocusedPath };
  }

  const focusTarget = getPierreFileTreeKeyboardTarget(entry.model);
  if (!focusTarget) {
    return { didMove: false, focusedPath: nearestFocusedPath };
  }

  focusTarget.dispatchEvent(
    new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      composed: true,
      code: next ? "ArrowDown" : "ArrowUp",
      key: next ? "ArrowDown" : "ArrowUp",
    }),
  );

  const nextFocusedPath = entry.model.getFocusedPath();
  if (nextFocusedPath) {
    scrollPierreFileTreeRowIntoView(entry.model, nextFocusedPath);
  }
  return {
    didMove: nextFocusedPath !== focusedPath,
    focusedPath: nextFocusedPath,
  };
}

function getActiveEntryIndex(entries: PierreTreeNavEntry[]) {
  const focusedEntryIndex = entries.findIndex((entry) => pierreFileTreeHasDomFocus(entry.model));
  if (focusedEntryIndex >= 0) {
    return focusedEntryIndex;
  }

  const selectedEntryIndex = entries.findIndex(
    (entry) => entry.selectedPath && entry.files.some((file) => file.path === entry.selectedPath),
  );
  if (selectedEntryIndex >= 0) {
    return selectedEntryIndex;
  }

  return 0;
}

function pierreFileTreeHasDomFocus(model: PierreFileTreeModel) {
  const shadowRoot = model.getFileTreeContainer()?.shadowRoot;
  return shadowRoot?.activeElement instanceof HTMLElement;
}

function getEntryFocusedBucketedFile(entry: PierreTreeNavEntry): BucketedFile | null {
  const focusedPath = entry.model.getFocusedPath();
  if (!focusedPath) {
    return null;
  }

  const focusedFile = findFileInEntry(entry, focusedPath);
  if (!focusedFile?.bucket) {
    return null;
  }

  return {
    bucket: focusedFile.bucket,
    path: focusedFile.realPath ?? focusedFile.path,
  } as BucketedFile;
}

function findFileInEntry(entry: PierreTreeNavEntry, path: string) {
  return entry.files.find((file) => file.path === path) ?? null;
}

function findAdjacentEntryWithVisibleRows(
  entries: PierreTreeNavEntry[],
  activeEntryIndex: number,
  next: boolean,
) {
  for (
    let index = activeEntryIndex + (next ? 1 : -1);
    index >= 0 && index < entries.length;
    index += next ? 1 : -1
  ) {
    const entry = entries[index];
    if (entry && collectVisibleRowPathsForEntry(entry).length > 0) {
      return entry;
    }
  }
  return null;
}

function collectVisibleRowPathsForEntry(entry: PierreTreeNavEntry) {
  const treeNodes = buildSourceControlFileTree(entry.files, entry.treeOptions);

  return collectVisibleRowPaths(treeNodes, entry.model);
}

function ensurePierreFileTreeOwnsFocus(model: PierreFileTreeModel, path: string) {
  const hostElement = model.getFileTreeContainer();
  const shadowRoot = hostElement?.shadowRoot;
  if (!shadowRoot) {
    return;
  }

  if (shadowRoot.activeElement instanceof HTMLElement) {
    return;
  }

  const focusTarget =
    Array.from(shadowRoot.querySelectorAll<HTMLElement>("[data-type='item'][data-item-path]")).find(
      (item) => item.dataset.itemPath === path,
    ) ?? shadowRoot.querySelector<HTMLElement>("[data-type='item'][data-item-focused='true']");

  focusTarget?.focus({ preventScroll: true });
}

function getPierreFileTreeKeyboardTarget(model: PierreFileTreeModel) {
  const hostElement = model.getFileTreeContainer();
  const shadowRoot = hostElement?.shadowRoot;
  if (!shadowRoot) {
    return null;
  }

  if (shadowRoot.activeElement instanceof HTMLElement) {
    return shadowRoot.activeElement;
  }

  return shadowRoot.querySelector<HTMLElement>("[data-type='item'][data-item-focused='true']");
}

function scrollPierreFileTreeRowIntoView(model: PierreFileTreeModel, path: string) {
  const rowElement = getPierreFileTreeRowElement(model, path);
  if (typeof rowElement?.scrollIntoView !== "function") {
    return;
  }

  rowElement.scrollIntoView({ block: "nearest" });
}

function getPierreFileTreeRowElement(model: PierreFileTreeModel, path: string) {
  const shadowRoot = model.getFileTreeContainer()?.shadowRoot;
  if (!shadowRoot) {
    return null;
  }

  return (
    Array.from(shadowRoot.querySelectorAll<HTMLElement>("[data-type='item'][data-item-path]")).find(
      (item) => item.dataset.itemPath === path,
    ) ?? null
  );
}
