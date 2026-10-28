import type { FileTree as PierreFileTreeModel, FileTreePreparedInput } from "@pierre/trees";
import type { PierreFileTreeNavFile } from "./components/pierreFileTree";
import { collectPreparedTreeRowPaths } from "./components/pierreFileTreeProjection";
import type { Bucket, SelectedFile } from "@/features/source-control/types";

type PierreTreeNavEntry = {
  files: ReadonlyArray<PierreFileTreeNavFile>;
  model: PierreFileTreeModel;
  selectedPath?: string;
  preparedInput: FileTreePreparedInput;
};

type PierreTreeNavOptions = {
  selectedPath?: string;
  preparedInput: FileTreePreparedInput;
};

const pierreTreeNavRegistry = new Map<string, PierreTreeNavEntry[]>();

export function registerPierreFileTreeNav(
  regionId: string,
  files: ReadonlyArray<PierreFileTreeNavFile>,
  model: PierreFileTreeModel,
  options: PierreTreeNavOptions,
) {
  const entries = pierreTreeNavRegistry.get(regionId) ?? [];
  const existingEntry = entries.find((entry) => entry.model === model);
  if (existingEntry) {
    existingEntry.files = files;
    existingEntry.selectedPath = options.selectedPath;
    existingEntry.preparedInput = options.preparedInput;
    return;
  }

  entries.push({
    files,
    model,
    selectedPath: options.selectedPath,
    preparedInput: options.preparedInput,
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

/** Resolves rendered identities back to source paths without re-sorting the provider data. */
export function getPierreFileTreeVisibleFiles(regionId: string) {
  return (pierreTreeNavRegistry.get(regionId) ?? []).flatMap(collectVisibleFilesForEntry);
}

export function getNextUnviewedPierreFile(
  regionId: string,
  activePath: string,
  viewedPaths: ReadonlySet<string>,
) {
  const visibleFiles = new Set(getPierreFileTreeVisibleFiles(regionId));
  const files = (pierreTreeNavRegistry.get(regionId) ?? []).flatMap((entry) => {
    const filesByPath = new Map(entry.files.map((file) => [file.path, file]));
    return entry.preparedInput.paths.flatMap((path) => {
      const file = filesByPath.get(path);
      return file ? [file] : [];
    });
  });
  const activeIndex = files.findIndex((file) => (file.realPath ?? file.path) === activePath);
  if (activeIndex < 0) return null;
  for (let offset = 1; offset < files.length; offset += 1) {
    const file = files[(activeIndex + offset) % files.length];
    if (file && visibleFiles.has(file) && !viewedPaths.has(file.realPath ?? file.path)) return file;
  }
  return null;
}

export function getPierreFileTreeVisibleSelectedFiles(regionId: string): SelectedFile[] {
  const entries = pierreTreeNavRegistry.get(regionId);
  if (!entries) {
    return [];
  }

  const files: SelectedFile[] = [];
  for (const entry of entries) {
    for (const file of collectVisibleFilesForEntry(entry)) {
      if (file.bucket) {
        files.push({ bucket: file.bucket, path: file.realPath ?? file.path });
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

export function getPierreFileTreeFocusedSelectedFile(regionId: string): SelectedFile | null {
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
  const filesByPath = new Map(entry.files.map((file) => [file.path, file]));
  return collectVisibleRowPathsForEntry(entry).flatMap((path) => {
    const file = filesByPath.get(path);
    return file ? [file] : [];
  });
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

export function movePierreFileTreeFocusByFile(regionId: string, next: boolean) {
  const entries = pierreTreeNavRegistry.get(regionId);
  if (!entries?.length) return null;

  const activeEntry = entries[getActiveEntryIndex(entries)];
  if (!activeEntry) return null;

  const focusedPath = activeEntry.model.getFocusedPath() ?? activeEntry.selectedPath;
  const rows = entries.flatMap((entry) => {
    const filesByPath = new Map(entry.files.map((file) => [file.path, file]));
    return collectVisibleRowPathsForEntry(entry).map((path) => ({
      entry,
      path,
      file: filesByPath.get(path),
    }));
  });
  const currentIndex = rows.findIndex(
    (row) =>
      row.entry === activeEntry &&
      (row.path === focusedPath || (!row.file && `${row.path}/` === focusedPath)),
  );
  const step = next ? 1 : -1;
  const boundaryIndex = next ? 0 : rows.length - 1;
  const startIndex = currentIndex < 0 ? boundaryIndex : currentIndex + step;

  for (let index = startIndex; index >= 0 && index < rows.length; index += step) {
    const row = rows[index];
    if (!row?.file) continue;

    row.entry.model.focusPath(row.path);
    ensurePierreFileTreeOwnsFocus(row.entry.model, row.path);
    scrollPierreFileTreeRowIntoView(row.entry.model, row.path);
    return row.file;
  }

  return focusedPath ? findFileInEntry(activeEntry, focusedPath) : null;
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

function getEntryFocusedBucketedFile(entry: PierreTreeNavEntry): SelectedFile | null {
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
  };
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
  return collectPreparedTreeRowPaths(entry.preparedInput.paths, entry.model);
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
