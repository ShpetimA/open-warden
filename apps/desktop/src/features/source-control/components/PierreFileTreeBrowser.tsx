import {
  prepareFileTreeInput,
  type FileTree as PierreFileTreeModel,
  type FileTreePreparedInput,
  type FileTreeRowDecorationRenderer,
  type FileTreeSortComparator,
  type GitStatusEntry,
} from "@pierre/trees";
import { FileTree as PierreFileTree, useFileTree } from "@pierre/trees/react";
import {
  useEffect,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { collectPreparedTreeRowPaths } from "./pierreFileTreeProjection";
import { TreeRowHover } from "./TreeRowHover";

import type { BuildSourceControlFileTreeOptions } from "@/features/source-control/fileTree";
import {
  registerPierreFileTreeNav,
  unregisterPierreFileTreeNav,
} from "@/features/source-control/pierreFileTreeNavigation";
import type { Bucket } from "@/features/source-control/types";
import { getWrappedNavigationIndex } from "@/lib/keyboard-navigation";
import useOnLayoutScrollToFocusedPath from "@/features/source-control/components/useOnLayoutScrollToFocusedPath";
import {
  buildTreeOptions,
  collectCollapsedDirectoryPaths,
  collapseDirectoryPaths,
  type PierreFileTreeBrowserFile,
  type PierreFileTreeNavFile,
} from "./pierreFileTree";

export type { PierreFileTreeBrowserFile } from "./pierreFileTree";

type PierreFileTreeBrowserProps<TFile extends PierreFileTreeBrowserFile> = {
  files: ReadonlyArray<TFile>;
  selectedPath: string;
  autoFocus?: boolean;
  selectFirstFile?: boolean;
  directoryLabelPriority?: "start" | "end";
  selectedPaths?: readonly string[];
  navRegion: string;
  className?: string;
  style?: CSSProperties;
  flattenEmptyDirectories?: boolean;
  sort?: "default" | FileTreeSortComparator;
  compareTreeDirectories?: BuildSourceControlFileTreeOptions<TFile>["compareDirectories"];
  onActivatePath: (path: string) => void;
  onTogglePathSelection?: (path: string) => void;
  onRangeSelectPath?: (path: string) => void;
  gitStatus?: readonly GitStatusEntry[];
  renderRowDecoration?: FileTreeRowDecorationRenderer;
  renderHoverContent?: (path: string, label: string) => ReactNode;
  rowDecorationInvalidationKey?: unknown;
  renderContextMenu?: Parameters<typeof PierreFileTree>[0]["renderContextMenu"];
};

export const PIERRE_FILE_TREE_ITEM_HEIGHT = 22;

const DIRECTORY_TITLE_CSS = `
  [data-item-type='folder'] [data-truncate-group-container='middle'] > div:first-child {
    flex: 0 1 max-content;
  }

  [data-item-type='folder'] [data-truncate-group-container='middle'] > div:last-child {
    flex: 0 999999 max-content;
  }
`;

const TREE_HOST_STYLE: CSSProperties = {
  height: "100%",
  ["--trees-action-lane-width-override" as string]: "0px",
  ["--trees-bg-muted-override" as string]: "var(--accent)",
  ["--trees-bg-override" as string]: "var(--surface-toolbar)",
  ["--trees-border-color-override" as string]: "var(--border)",
  ["--trees-border-radius-override" as string]: "0px",
  ["--trees-fg-muted-override" as string]: "var(--muted-foreground)",
  ["--trees-fg-override" as string]: "var(--foreground)",
  ["--trees-focus-ring-color-override" as string]: "var(--ring)",
  ["--trees-font-size-override" as string]: "12px",
  ["--trees-git-lane-width-override" as string]: "20px",
  ["--trees-icon-width-override" as string]: "14px",
  ["--trees-item-margin-x-override" as string]: "0px",
  ["--trees-item-padding-x-override" as string]: "6px",
  ["--trees-item-row-gap-override" as string]: "0px",
  ["--trees-level-gap-override" as string]: "4px",
  ["--trees-padding-inline-override" as string]: "0px",
  ["--trees-scrollbar-gutter-override" as string]: "8px",
  ["--trees-selected-bg-override" as string]: "var(--surface-active)",
  ["--trees-selected-fg-override" as string]: "var(--foreground)",
};

const TREE_UNSAFE_CSS = `
  [data-file-tree-virtualized-scroll='true'] {
    padding-block: 2px;
  }

  [data-type='item'] {
    border-radius: 0;
  }

  [data-item-section='decoration'] {
    flex: 1 0 max-content;
    min-width: max-content;
    padding-inline: 4px 2px;
    overflow: visible;
  }

  [data-item-section='decoration'] > span {
    min-width: max-content;
    max-width: none;
    overflow: visible;
    text-overflow: clip;
    font-variant-numeric: tabular-nums;
  }
`;

function areFilePathsEqual(
  left: ReadonlyArray<PierreFileTreeBrowserFile>,
  right: ReadonlyArray<PierreFileTreeBrowserFile>,
) {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index]?.path !== right[index]?.path) {
      return false;
    }
  }

  return true;
}

export function PierreFileTreeBrowser<TFile extends PierreFileTreeBrowserFile>({
  files,
  selectedPath,
  selectedPaths,
  navRegion,
  className = "",
  autoFocus = true,
  directoryLabelPriority = "end",
  style,
  flattenEmptyDirectories = true,
  sort = "default",
  compareTreeDirectories,
  onActivatePath,
  selectFirstFile = false,
  onTogglePathSelection,
  onRangeSelectPath,
  gitStatus,
  renderRowDecoration,
  renderHoverContent,
  rowDecorationInvalidationKey,
  renderContextMenu,
}: PierreFileTreeBrowserProps<TFile>) {
  const onActivatePathRef = useRef(onActivatePath);
  const onTogglePathSelectionRef = useRef(onTogglePathSelection);
  const onRangeSelectPathRef = useRef(onRangeSelectPath);
  const filesRef = useRef(files);
  const selectedPathRef = useRef(selectedPath);
  const selectedPathsRef = useRef(selectedPaths);
  const initialFilePathsRef = useRef<readonly string[] | null>(null);
  const initialSelectedPathsRef = useRef<readonly string[] | null>(null);
  const initialPreparedInputRef = useRef<FileTreePreparedInput | null>(null);
  const filePathSetRef = useRef<Set<string> | null>(null);
  const pierreSelectedPathsRef = useRef<ReadonlySet<string> | null>(null);
  const navFilesRef = useRef<ReadonlyArray<PierreFileTreeNavFile>>([]);
  const renderRowDecorationRef = useRef(renderRowDecoration);
  const suppressClickPathRef = useRef<string | null>(null);
  const suppressPierreSelectionChangeRef = useRef(false);
  const syncingSelectionRef = useRef(false);

  onActivatePathRef.current = onActivatePath;
  onTogglePathSelectionRef.current = onTogglePathSelection;
  onRangeSelectPathRef.current = onRangeSelectPath;
  selectedPathRef.current = selectedPath;
  selectedPathsRef.current = selectedPaths;
  renderRowDecorationRef.current = renderRowDecoration;

  if (initialFilePathsRef.current === null) {
    initialFilePathsRef.current = files.map((file) => file.path);
  }
  const initialFilePaths = initialFilePathsRef.current;

  if (initialSelectedPathsRef.current === null) {
    initialSelectedPathsRef.current = selectedPaths ?? (selectedPath ? [selectedPath] : []);
  }
  const initialSelectedPaths = initialSelectedPathsRef.current;

  if (initialPreparedInputRef.current === null) {
    initialPreparedInputRef.current = prepareFileTreeInput(initialFilePaths, {
      flattenEmptyDirectories,
      sort,
    });
  }
  const initialPreparedInput = initialPreparedInputRef.current;
  const preparedInputRef = useRef(initialPreparedInput);

  if (filePathSetRef.current === null) {
    filePathSetRef.current = new Set(initialFilePaths);
  }
  if (pierreSelectedPathsRef.current === null) {
    pierreSelectedPathsRef.current = new Set(initialSelectedPaths);
  }

  const { model } = useFileTree({
    density: 0.5,
    flattenEmptyDirectories,
    gitStatus,
    icons: "complete",
    initialExpansion: "open",
    initialSelectedPaths,
    itemHeight: PIERRE_FILE_TREE_ITEM_HEIGHT,
    onSelectionChange: (selectedPaths) => {
      if (suppressPierreSelectionChangeRef.current) {
        return;
      }

      if (syncingSelectionRef.current) {
        return;
      }

      const nextSelectedPaths = selectedPaths.filter(
        (path) => filePathSetRef.current?.has(path) ?? false,
      );
      if (nextSelectedPaths.length === 0) {
        pierreSelectedPathsRef.current = new Set();
        return;
      }

      pierreSelectedPathsRef.current = new Set(nextSelectedPaths);
    },
    preparedInput: initialPreparedInput,
    renderRowDecoration: (context) => renderRowDecorationRef.current?.(context) ?? null,
    sort,
    stickyFolders: false,
    unsafeCSS: TREE_UNSAFE_CSS + (directoryLabelPriority === "start" ? DIRECTORY_TITLE_CSS : ""),
    composition: renderContextMenu
      ? {
          contextMenu: {
            buttonVisibility: "when-needed",
            enabled: true,
            triggerMode: "both",
          },
        }
      : undefined,
  });

  useEffect(() => {
    const nextSelectedPaths = selectedPaths ?? (selectedPath ? [selectedPath] : []);
    syncPierreSelectedPaths(
      model,
      filePathSetRef,
      pierreSelectedPathsRef,
      syncingSelectionRef,
      nextSelectedPaths,
    );
  }, [model, selectedPath, selectedPaths]);

  useEffect(() => {
    if (!selectedPath || !filePathSetRef.current?.has(selectedPath)) {
      return;
    }

    if (model.getFocusedPath() === selectedPath) {
      return;
    }

    model.focusPath(selectedPath);
  }, [model, selectedPath]);

  useEffect(() => {
    model.setGitStatus(gitStatus);
  }, [gitStatus, model, rowDecorationInvalidationKey]);

  useOnLayoutScrollToFocusedPath({
    autoFocus,
    model,
    selectedPath,
    filesRef,
    syncingSelectionRef,
    compareTreeDirectories,
    flattenEmptyDirectories,
    sort,
  });

  useEffect(() => {
    const treeOptions = buildTreeOptions(compareTreeDirectories, flattenEmptyDirectories, sort);
    const pathsChanged = !areFilePathsEqual(filesRef.current, files);
    const nextPaths = files.map((file) => file.path);
    filePathSetRef.current = new Set(nextPaths);

    if (pathsChanged) {
      const focusedPath = model.getFocusedPath();
      const collapsedDirectoryPaths = collectCollapsedDirectoryPaths(
        filesRef.current,
        model,
        treeOptions,
      );
      const nextPreparedInput = prepareFileTreeInput(nextPaths, {
        flattenEmptyDirectories,
        sort,
      });
      syncingSelectionRef.current = true;
      try {
        model.resetPaths(nextPaths, { preparedInput: nextPreparedInput });
        preparedInputRef.current = nextPreparedInput;
        collapseDirectoryPaths(model, collapsedDirectoryPaths);
        const currentSelectedPath = selectedPathRef.current;
        if (currentSelectedPath && filePathSetRef.current.has(currentSelectedPath)) {
          model.focusPath(currentSelectedPath);
        } else {
          model.focusNearestPath(focusedPath);
        }
        syncPierreSelectedPaths(
          model,
          filePathSetRef,
          pierreSelectedPathsRef,
          syncingSelectionRef,
          selectedPathsRef.current ?? (currentSelectedPath ? [currentSelectedPath] : []),
        );
      } finally {
        syncingSelectionRef.current = false;
      }
    }
    filesRef.current = files;
  }, [compareTreeDirectories, files, flattenEmptyDirectories, model, sort]);

  useEffect(() => {
    navFilesRef.current = files.map(toPierreFileTreeNavFile);
    registerPierreFileTreeNav(navRegion, navFilesRef.current, model, {
      selectedPath: selectedPathRef.current,
      preparedInput: preparedInputRef.current,
    });
  }, [compareTreeDirectories, files, flattenEmptyDirectories, model, navRegion, sort]);

  useEffect(() => {
    registerPierreFileTreeNav(navRegion, navFilesRef.current, model, {
      selectedPath,
      preparedInput: preparedInputRef.current,
    });
  }, [model, navRegion, selectedPath]);

  useEffect(() => {
    if (!selectFirstFile || (selectedPath && filePathSetRef.current?.has(selectedPath))) return;
    const firstPath = preparedInputRef.current.paths[0];
    if (firstPath) onActivatePathRef.current(firstPath);
  }, [files, model, selectFirstFile, selectedPath]);

  useEffect(() => {
    return () => {
      unregisterPierreFileTreeNav(navRegion, model);
    };
  }, [model, navRegion]);

  const activatePath = (path: string) => {
    if (!filePathSetRef.current?.has(path)) {
      return;
    }

    syncPierreSelectedPaths(model, filePathSetRef, pierreSelectedPathsRef, syncingSelectionRef, [
      path,
    ]);
    onActivatePathRef.current(path);
  };

  const togglePathSelection = (path: string) => {
    if (!filePathSetRef.current?.has(path)) {
      return;
    }

    onTogglePathSelectionRef.current?.(path);
  };

  const rangeSelectPath = (path: string) => {
    if (!filePathSetRef.current?.has(path)) {
      return;
    }

    onRangeSelectPathRef.current?.(path);
  };

  const clearSuppressedPierreSelectionChange = () => {
    window.setTimeout(() => {
      suppressPierreSelectionChangeRef.current = false;
    }, 0);
  };

  const handleHostPointerDownCapture = (event: PointerEvent<HTMLElement>) => {
    if (!event.shiftKey && !event.metaKey && !event.ctrlKey) {
      return;
    }

    const path = getFilePathFromComposedPath(event.nativeEvent.composedPath());
    if (!path) {
      return;
    }

    const shouldRangeSelect = event.shiftKey && !!onRangeSelectPathRef.current;
    const shouldToggleSelection =
      (event.metaKey || event.ctrlKey) && !!onTogglePathSelectionRef.current;
    if (!shouldRangeSelect && !shouldToggleSelection) {
      return;
    }

    suppressPierreSelectionChangeRef.current = true;
    clearSuppressedPierreSelectionChange();

    suppressClickPathRef.current = path;
    event.preventDefault();
    event.stopPropagation();

    if (shouldRangeSelect) {
      rangeSelectPath(path);
    } else {
      togglePathSelection(path);
    }
  };

  const handleHostClick = (event: MouseEvent<HTMLElement>) => {
    if (syncingSelectionRef.current) {
      return;
    }

    for (const target of event.nativeEvent.composedPath()) {
      if (!(target instanceof HTMLElement)) {
        continue;
      }

      if (target.dataset.type !== "item" || target.dataset.itemType !== "file") {
        continue;
      }

      const path = target.dataset.itemPath;
      if (path && path.length > 0) {
        if (suppressClickPathRef.current === path) {
          suppressClickPathRef.current = null;
          event.preventDefault();
          event.stopPropagation();
          return;
        }

        const shouldRangeSelect = event.shiftKey && !!onRangeSelectPathRef.current;
        const shouldToggleSelection =
          (event.metaKey || event.ctrlKey) && !!onTogglePathSelectionRef.current;
        if (shouldRangeSelect || shouldToggleSelection) {
          event.preventDefault();
          event.stopPropagation();
          if (shouldRangeSelect) {
            rangeSelectPath(path);
          } else {
            togglePathSelection(path);
          }
          clearSuppressedPierreSelectionChange();
          suppressClickPathRef.current = null;
          return;
        }

        activatePath(path);
        return;
      }
    }
  };

  const handleHostKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.shiftKey && isRangeNavigationKey(event)) {
      const targetPath = getShiftNavigationTargetPath(model, preparedInputRef.current.paths, event);
      if (!targetPath) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      model.focusPath(targetPath);

      rangeSelectPath(targetPath);
      return;
    }

    const isActivationKey = event.key === "Enter" || event.key === " " || event.key === "Spacebar";
    if (!isActivationKey) {
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
      return;
    }

    const focusedPath = model.getFocusedPath();
    if (!focusedPath) {
      return;
    }

    const focusedItem = model.getItem(focusedPath);
    if (!focusedItem) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if ("toggle" in focusedItem) {
      focusedItem.toggle();
      return;
    }

    activatePath(focusedPath);
  };

  return (
    <div
      data-nav-region={navRegion}
      className={`min-h-0 flex-1 overflow-hidden ${className}`.trim()}
      style={style}
    >
      <TreeRowHover directoriesOnly renderContent={renderHoverContent}>
        <PierreFileTree
          model={model}
          className="block h-full min-h-0"
          style={{
            ...TREE_HOST_STYLE,
            ...(renderContextMenu
              ? { ["--trees-action-lane-width-override" as string]: "24px" }
              : null),
          }}
          onClick={handleHostClick}
          onPointerDownCapture={handleHostPointerDownCapture}
          onKeyDown={handleHostKeyDown}
          renderContextMenu={renderContextMenu}
        />
      </TreeRowHover>
    </div>
  );
}

function syncPierreSelectedPaths(
  model: PierreFileTreeModel,
  filePathSetRef: { current: ReadonlySet<string> | null },
  selectedPathSetRef: { current: ReadonlySet<string> | null },
  syncingSelectionRef: { current: boolean },
  paths: ReadonlyArray<string>,
) {
  const nextPaths = paths.filter((path) => filePathSetRef.current?.has(path) ?? false);
  const nextPathSet = new Set(nextPaths);
  const previousPathSet = selectedPathSetRef.current ?? new Set<string>();
  const sameSelection =
    nextPathSet.size === previousPathSet.size &&
    nextPaths.every((path) => previousPathSet.has(path));

  if (sameSelection) {
    return;
  }

  const wasSyncingSelection = syncingSelectionRef.current;
  syncingSelectionRef.current = true;
  try {
    for (const previousPath of previousPathSet) {
      if (!nextPathSet.has(previousPath)) {
        model.getItem(previousPath)?.deselect();
      }
    }
    for (const path of nextPathSet) {
      model.getItem(path)?.select();
    }
    selectedPathSetRef.current = nextPathSet;
  } finally {
    syncingSelectionRef.current = wasSyncingSelection;
  }
}

function toPierreFileTreeNavFile(file: PierreFileTreeBrowserFile): PierreFileTreeNavFile {
  const navFile: PierreFileTreeNavFile = { path: file.path };

  if ("bucket" in file && isBucket(file.bucket)) {
    navFile.bucket = file.bucket;
  }
  if ("realPath" in file && typeof file.realPath === "string") {
    navFile.realPath = file.realPath;
  }

  return navFile;
}

function isBucket(value: unknown): value is Bucket {
  return value === "staged" || value === "unstaged" || value === "untracked";
}

function getFilePathFromComposedPath(path: EventTarget[]) {
  for (const target of path) {
    if (!(target instanceof HTMLElement)) {
      continue;
    }

    if (target.dataset.type === "item" && target.dataset.itemType === "file") {
      const filePath = target.dataset.itemPath;
      return filePath && filePath.length > 0 ? filePath : null;
    }
  }

  return null;
}

function isRangeNavigationKey(event: KeyboardEvent<HTMLElement>) {
  return (
    event.key === "ArrowDown" ||
    event.key === "ArrowUp" ||
    event.key.toLowerCase() === "j" ||
    event.key.toLowerCase() === "k"
  );
}

function getShiftNavigationTargetPath(
  model: PierreFileTreeModel,
  orderedPaths: readonly string[],
  event: KeyboardEvent<HTMLElement>,
) {
  const filePaths = new Set(orderedPaths);
  const visibleFilePaths = collectPreparedTreeRowPaths(orderedPaths, model).filter((path) =>
    filePaths.has(path),
  );
  if (visibleFilePaths.length === 0) {
    return null;
  }

  const next = event.key === "ArrowDown" || event.key.toLowerCase() === "j";
  const activePath = model.getFocusedPath();
  const activeIndex = activePath ? visibleFilePaths.findIndex((path) => path === activePath) : -1;
  const targetIndex = getWrappedNavigationIndex(activeIndex, visibleFilePaths.length, next);
  return visibleFilePaths[targetIndex] ?? null;
}
