import {
  prepareFileTreeInput,
  type FileTree as PierreFileTreeModel,
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
} from "react";

import {
  buildSourceControlFileTree,
  collectDirectoryPaths,
  type BuildSourceControlFileTreeOptions,
  type SourceControlTreeDirectoryNode,
} from "@/features/source-control/fileTree";
import {
  registerPierreFileTreeNav,
  unregisterPierreFileTreeNav,
} from "@/features/source-control/pierreFileTreeNavigation";
import type { Bucket } from "@/features/source-control/types";
import { getWrappedNavigationIndex } from "@/lib/keyboard-navigation";
import useOnLayoutScrollToFocusedPath from "@/features/source-control/components/useOnLayoutScrollToFocusedPath";

export type PierreFileTreeBrowserFile = {
  path: string;
};

type PierreFileTreeBrowserProps<TFile extends PierreFileTreeBrowserFile> = {
  files: ReadonlyArray<TFile>;
  selectedPath: string;
  selectedPaths?: readonly string[];
  navRegion: string;
  className?: string;
  style?: CSSProperties;
  disableInternalScroll?: boolean;
  flattenEmptyDirectories?: boolean;
  sort?: "default" | FileTreeSortComparator;
  compareTreeDirectories?: BuildSourceControlFileTreeOptions<TFile>["compareDirectories"];
  onActivatePath: (path: string) => void;
  onTogglePathSelection?: (path: string) => void;
  onRangeSelectPath?: (path: string) => void;
  gitStatus?: readonly GitStatusEntry[];
  renderRowDecoration?: FileTreeRowDecorationRenderer;
  renderContextMenu?: Parameters<typeof PierreFileTree>[0]["renderContextMenu"];
};

export const PIERRE_FILE_TREE_ITEM_HEIGHT = 22;

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

const TREE_DISABLE_INTERNAL_SCROLL_CSS = `
  [data-file-tree-virtualized-scroll='true'] {
    overflow: hidden !important;
    scrollbar-width: none;
  }

  [data-file-tree-virtualized-scroll='true']::-webkit-scrollbar {
    display: none;
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

function collectCollapsedDirectoryPaths<TFile extends PierreFileTreeBrowserFile>(
  files: ReadonlyArray<TFile>,
  model: PierreFileTreeModel,
  treeOptions: BuildSourceControlFileTreeOptions<TFile>,
) {
  const treeNodes = buildSourceControlFileTree(files, treeOptions);
  const collapsedPaths: string[] = [];

  for (const directoryPath of collectDirectoryPaths(treeNodes)) {
    const directoryItem = model.getItem(directoryPath);
    if (directoryItem && "isExpanded" in directoryItem && !directoryItem.isExpanded()) {
      collapsedPaths.push(directoryPath);
    }
  }

  return collapsedPaths;
}

function collapseDirectoryPaths(model: PierreFileTreeModel, directoryPaths: ReadonlyArray<string>) {
  for (const directoryPath of directoryPaths) {
    const directoryItem = model.getItem(directoryPath);
    if (directoryItem && "collapse" in directoryItem) {
      directoryItem.collapse();
    }
  }
}

export function PierreFileTreeBrowser<TFile extends PierreFileTreeBrowserFile>({
  files,
  selectedPath,
  selectedPaths,
  navRegion,
  className = "",
  style,
  disableInternalScroll = false,
  flattenEmptyDirectories = true,
  sort = "default",
  compareTreeDirectories,
  onActivatePath,
  onTogglePathSelection,
  onRangeSelectPath,
  gitStatus,
  renderRowDecoration,
  renderContextMenu,
}: PierreFileTreeBrowserProps<TFile>) {
  const onActivatePathRef = useRef(onActivatePath);
  const onTogglePathSelectionRef = useRef(onTogglePathSelection);
  const onRangeSelectPathRef = useRef(onRangeSelectPath);
  const filesRef = useRef(files);
  const filePathSetRef = useRef(new Set(files.map((file) => file.path)));
  const pierreSelectedPathsRef = useRef<ReadonlySet<string>>(
    new Set(selectedPaths ?? (selectedPath ? [selectedPath] : [])),
  );
  const renderRowDecorationRef = useRef(renderRowDecoration);
  const suppressClickPathRef = useRef<string | null>(null);
  const suppressPierreSelectionChangeRef = useRef(false);
  const syncingSelectionRef = useRef(false);

  onActivatePathRef.current = onActivatePath;
  onTogglePathSelectionRef.current = onTogglePathSelection;
  onRangeSelectPathRef.current = onRangeSelectPath;
  renderRowDecorationRef.current = renderRowDecoration;

  const filePaths = files.map((file) => file.path);
  const initialPreparedInput = prepareFileTreeInput(filePaths, {
    flattenEmptyDirectories,
    sort,
  });

  const { model } = useFileTree({
    density: 0.5,
    flattenEmptyDirectories,
    gitStatus,
    icons: "complete",
    initialExpansion: "open",
    initialSelectedPaths: selectedPaths ?? (selectedPath ? [selectedPath] : []),
    itemHeight: PIERRE_FILE_TREE_ITEM_HEIGHT,
    onSelectionChange: (selectedPaths) => {
      if (suppressPierreSelectionChangeRef.current) {
        return;
      }

      if (syncingSelectionRef.current) {
        return;
      }

      const nextSelectedPaths = selectedPaths.filter((path) => filePathSetRef.current.has(path));
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
    unsafeCSS: `${TREE_UNSAFE_CSS}${disableInternalScroll ? TREE_DISABLE_INTERNAL_SCROLL_CSS : ""}`,
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

  const treeOptions = buildTreeOptions(compareTreeDirectories, flattenEmptyDirectories, sort);

  const setPierreSelectedPaths = (paths: ReadonlyArray<string>) => {
    const nextPaths = paths.filter((path) => filePathSetRef.current.has(path));
    const nextPathSet = new Set(nextPaths);
    const previousPathSet = pierreSelectedPathsRef.current;
    const sameSelection =
      nextPathSet.size === previousPathSet.size &&
      nextPaths.every((path) => previousPathSet.has(path));

    if (sameSelection) {
      return;
    }

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
      pierreSelectedPathsRef.current = nextPathSet;
    } finally {
      syncingSelectionRef.current = false;
    }
  };

  useEffect(() => {
    const nextSelectedPaths = selectedPaths ?? (selectedPath ? [selectedPath] : []);
    setPierreSelectedPaths(nextSelectedPaths);
  }, [model, selectedPath, selectedPaths]);

  useEffect(() => {
    if (!selectedPath || !filePathSetRef.current.has(selectedPath)) {
      return;
    }

    if (model.getFocusedPath() === selectedPath) {
      return;
    }

    model.focusPath(selectedPath);
  }, [model, selectedPath]);

  useEffect(() => {
    model.setGitStatus(gitStatus);
  }, [gitStatus, model]);

  useOnLayoutScrollToFocusedPath({
    model,
    selectedPath,
    filesRef,
    syncingSelectionRef,
    compareTreeDirectories,
    flattenEmptyDirectories,
    sort,
  });

  useEffect(() => {
    const pathsChanged = !areFilePathsEqual(filesRef.current, files);
    filePathSetRef.current = new Set(files.map((file) => file.path));

    if (pathsChanged) {
      const focusedPath = model.getFocusedPath();
      const collapsedDirectoryPaths = collectCollapsedDirectoryPaths(
        filesRef.current,
        model,
        treeOptions,
      );
      const nextPaths = files.map((file) => file.path);
      const nextPreparedInput = prepareFileTreeInput(nextPaths, {
        flattenEmptyDirectories,
        sort,
      });
      syncingSelectionRef.current = true;
      model.resetPaths(nextPaths, { preparedInput: nextPreparedInput });
      collapseDirectoryPaths(model, collapsedDirectoryPaths);
      model.focusNearestPath(focusedPath);
      setPierreSelectedPaths(selectedPaths ?? (selectedPath ? [selectedPath] : []));
      syncingSelectionRef.current = false;
    }
    filesRef.current = files;

    registerPierreFileTreeNav(
      navRegion,
      files.map((file) => ({
        bucket: "bucket" in file ? (file.bucket as Bucket | undefined) : undefined,
        path: file.path,
        realPath: "realPath" in file ? (file.realPath as string | undefined) : undefined,
      })),
      model,
      {
        selectedPath,
        treeOptions: buildNavTreeOptions(compareTreeDirectories, flattenEmptyDirectories, sort),
      },
    );

    return () => {
      unregisterPierreFileTreeNav(navRegion, model);
    };
  }, [
    compareTreeDirectories,
    files,
    flattenEmptyDirectories,
    model,
    navRegion,
    selectedPath,
    selectedPaths,
    sort,
  ]);

  const activatePath = (path: string) => {
    if (!filePathSetRef.current.has(path)) {
      return;
    }

    setPierreSelectedPaths([path]);
    onActivatePathRef.current(path);
  };

  const togglePathSelection = (path: string) => {
    if (!filePathSetRef.current.has(path)) {
      return;
    }

    onTogglePathSelectionRef.current?.(path);
  };

  const rangeSelectPath = (path: string) => {
    if (!filePathSetRef.current.has(path)) {
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
      const targetPath = getShiftNavigationTargetPath(model, filesRef.current, event, treeOptions);
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
    </div>
  );
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

function toPierreSortEntry(path: string, basename: string, isDirectory: boolean) {
  const segments = path.split("/").filter(Boolean);
  return {
    basename,
    depth: Math.max(0, segments.length - 1),
    isDirectory,
    path,
    segments,
  };
}

function buildTreeOptions<TFile extends PierreFileTreeBrowserFile>(
  compareTreeDirectories: BuildSourceControlFileTreeOptions<TFile>["compareDirectories"],
  flattenEmptyDirectories: boolean,
  sort: "default" | FileTreeSortComparator,
): BuildSourceControlFileTreeOptions<TFile> {
  return {
    compareDirectories: compareTreeDirectories,
    compareFiles:
      sort === "default"
        ? undefined
        : (left, right) =>
            sort(
              toPierreSortEntry(left.path, left.name, false),
              toPierreSortEntry(right.path, right.name, false),
            ),
    flattenEmptyDirectories,
  };
}

function buildNavTreeOptions<TFile extends PierreFileTreeBrowserFile>(
  compareTreeDirectories: BuildSourceControlFileTreeOptions<TFile>["compareDirectories"],
  flattenEmptyDirectories: boolean,
  sort: "default" | FileTreeSortComparator,
): BuildSourceControlFileTreeOptions<{
  path: string;
  bucket?: Bucket;
  realPath?: string;
}> {
  return {
    compareDirectories: compareTreeDirectories
      ? (left, right, depth) =>
          compareTreeDirectories(
            left as SourceControlTreeDirectoryNode<TFile>,
            right as SourceControlTreeDirectoryNode<TFile>,
            depth,
          )
      : undefined,
    compareFiles:
      sort === "default"
        ? undefined
        : (left, right) =>
            sort(
              toPierreSortEntry(left.path, left.name, false),
              toPierreSortEntry(right.path, right.name, false),
            ),
    flattenEmptyDirectories,
  };
}

function isRangeNavigationKey(event: KeyboardEvent<HTMLElement>) {
  return (
    event.key === "ArrowDown" ||
    event.key === "ArrowUp" ||
    event.key.toLowerCase() === "j" ||
    event.key.toLowerCase() === "k"
  );
}

function getShiftNavigationTargetPath<TFile extends PierreFileTreeBrowserFile>(
  model: PierreFileTreeModel,
  files: ReadonlyArray<TFile>,
  event: KeyboardEvent<HTMLElement>,
  treeOptions: BuildSourceControlFileTreeOptions<TFile>,
) {
  const visibleFilePaths = collectVisibleFilePaths(files, model, treeOptions);
  if (visibleFilePaths.length === 0) {
    return null;
  }

  const next = event.key === "ArrowDown" || event.key.toLowerCase() === "j";
  const activePath = model.getFocusedPath();
  const activeIndex = activePath ? visibleFilePaths.findIndex((path) => path === activePath) : -1;
  const targetIndex = getWrappedNavigationIndex(activeIndex, visibleFilePaths.length, next);
  return visibleFilePaths[targetIndex] ?? null;
}

function collectVisibleFilePaths<TFile extends PierreFileTreeBrowserFile>(
  files: ReadonlyArray<TFile>,
  model: PierreFileTreeModel,
  treeOptions: BuildSourceControlFileTreeOptions<TFile>,
) {
  const visiblePaths: string[] = [];
  const pendingNodes = [...buildSourceControlFileTree(files, treeOptions)].reverse();

  while (pendingNodes.length > 0) {
    const node = pendingNodes.pop();
    if (!node) {
      continue;
    }

    if (node.kind === "file") {
      visiblePaths.push(node.file.path);
      continue;
    }

    const directoryItem = model.getItem(node.path);
    const isExpanded =
      directoryItem && "isExpanded" in directoryItem ? directoryItem.isExpanded() : true;
    if (isExpanded) {
      pendingNodes.push(...node.children.toReversed());
    }
  }

  return visiblePaths;
}
