import { prepareFileTreeInput, type FileTree as PierreFileTreeModel } from "@pierre/trees";
import { FileTree as PeerFileTree, useFileTree } from "@pierre/trees/react";
import {
  useEffect,
  useRef,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
} from "react";

import { buildSourceControlFileTree } from "@/features/source-control/fileTree";
import {
  registerPeerFileTreeNav,
  unregisterPeerFileTreeNav,
} from "@/features/source-control/peerFileTreeNavigation";

type PeerFileTreeBrowserFile = {
  path: string;
};

type PeerFileTreeBrowserProps<TFile extends PeerFileTreeBrowserFile> = {
  files: ReadonlyArray<TFile>;
  initialSelectedPath: string;
  navRegion: string;
  onSelectPath: (path: string) => void;
  onActivatePath: (path: string) => void;
};

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
  ["--trees-item-margin-x-override" as string]: "0px",
  ["--trees-item-padding-x-override" as string]: "8px",
  ["--trees-level-gap-override" as string]: "8px",
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
`;

const TREE_ROOT_SELECTOR = "[data-file-tree-virtualized-root='true']";
const TREE_SCROLL_SELECTOR = "[data-file-tree-virtualized-scroll='true']";

function findExpandedInitialRowIndex<TFile extends PeerFileTreeBrowserFile>(
  files: ReadonlyArray<TFile>,
  path: string,
) {
  const pendingNodes = [...buildSourceControlFileTree(files)].reverse();

  for (let rowIndex = 0; pendingNodes.length > 0; rowIndex += 1) {
    const node = pendingNodes.pop();
    if (!node) continue;

    if (node.kind === "file") {
      if (node.file.path === path) return rowIndex;
      continue;
    }

    pendingNodes.push(...node.children.toReversed());
  }

  return null;
}

function usePierreFocusedPathChange(
  model: PierreFileTreeModel,
  onFocusedPathChange: (path: string | null) => void,
) {
  const onFocusedPathChangeRef = useRef(onFocusedPathChange);
  onFocusedPathChangeRef.current = onFocusedPathChange;

  useSyncExternalStore(
    (notify) =>
      model.subscribe(() => {
        console.log("Focused path changed:", model.getFocusedPath());
        onFocusedPathChangeRef.current(model.getFocusedPath());
        notify();
      }),
    () => model.getFocusedPath(),
    () => model.getFocusedPath(),
  );
}

export function PierreFileTreeBrowser<TFile extends PeerFileTreeBrowserFile>({
  files,
  initialSelectedPath,
  navRegion,
  onSelectPath,
  onActivatePath,
}: PeerFileTreeBrowserProps<TFile>) {
  const onActivatePathRef = useRef(onActivatePath);
  const onSelectPathRef = useRef(onSelectPath);
  const filesRef = useRef(files);
  const filePathSetRef = useRef(new Set(files.map((file) => file.path)));
  const didApplyInitialScrollRef = useRef(false);
  const pierreSelectedPathRef = useRef<string | null>(initialSelectedPath || null);
  const selectedPathRef = useRef(initialSelectedPath);
  const syncingSelectionRef = useRef(false);

  onActivatePathRef.current = onActivatePath;
  onSelectPathRef.current = onSelectPath;
  selectedPathRef.current = initialSelectedPath;

  const filePaths = files.map((file) => file.path);
  const initialPreparedInput = prepareFileTreeInput(filePaths, {
    flattenEmptyDirectories: true,
  });

  const { model } = useFileTree({
    density: "compact",
    icons: "complete",
    initialExpansion: "open",
    initialSelectedPaths: initialSelectedPath ? [initialSelectedPath] : [],
    onSelectionChange: (selectedPaths) => {
      if (syncingSelectionRef.current) {
        return;
      }

      const selectedPath = selectedPaths[0];
      if (!selectedPath) {
        pierreSelectedPathRef.current = null;
        return;
      }

      if (!filePathSetRef.current.has(selectedPath)) {
        return;
      }

      pierreSelectedPathRef.current = selectedPath;

      if (selectedPath === selectedPathRef.current) {
        return;
      }

      selectedPathRef.current = selectedPath;
      onSelectPathRef.current(selectedPath);
    },
    preparedInput: initialPreparedInput,
    stickyFolders: false,
    unsafeCSS: TREE_UNSAFE_CSS,
  });

  const setPierreSelectedPath = (path: string | null) => {
    if (path === pierreSelectedPathRef.current) {
      return;
    }

    syncingSelectionRef.current = true;
    try {
      if (pierreSelectedPathRef.current) {
        model.getItem(pierreSelectedPathRef.current)?.deselect();
      }
      if (path) {
        model.getItem(path)?.select();
      }
      pierreSelectedPathRef.current = path;
    } finally {
      syncingSelectionRef.current = false;
    }
  };

  usePierreFocusedPathChange(model, (focusedPath) => {
    if (syncingSelectionRef.current) {
      return;
    }

    if (!focusedPath || !filePathSetRef.current.has(focusedPath)) {
      setPierreSelectedPath(null);
      return;
    }

    setPierreSelectedPath(focusedPath);

    if (focusedPath === selectedPathRef.current) return;

    selectedPathRef.current = focusedPath;
    onSelectPathRef.current(focusedPath);
  });

  useEffect(() => {
    if (didApplyInitialScrollRef.current || !initialSelectedPath) {
      return;
    }

    let canceled = false;
    let animationFrameId: number | null = null;

    const applyInitialScroll = () => {
      if (canceled || didApplyInitialScrollRef.current) {
        return;
      }

      const hostElement = model.getFileTreeContainer();
      const shadowRoot = hostElement?.shadowRoot;
      const focusTarget = shadowRoot?.querySelector<HTMLElement>(TREE_ROOT_SELECTOR);
      const scrollTarget = shadowRoot?.querySelector<HTMLElement>(TREE_SCROLL_SELECTOR);

      if (!focusTarget || !scrollTarget || scrollTarget.clientHeight === 0) {
        return;
      }

      didApplyInitialScrollRef.current = true;
      const initialRowIndex = findExpandedInitialRowIndex(filesRef.current, initialSelectedPath);

      if (initialRowIndex !== null) {
        const itemHeight = model.getItemHeight();
        const targetOffset = Math.max(0, Math.floor((scrollTarget.clientHeight - itemHeight) / 2));
        scrollTarget.scrollTop = Math.max(0, initialRowIndex * itemHeight - targetOffset);
      }

      syncingSelectionRef.current = true;
      model.focusPath(initialSelectedPath);
      syncingSelectionRef.current = false;
      focusTarget.focus({ preventScroll: true });
    };

    animationFrameId = window.requestAnimationFrame(applyInitialScroll);

    return () => {
      canceled = true;
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }
    };
  }, [initialSelectedPath, model]);

  useEffect(() => {
    const pathsChanged = filesRef.current !== files;
    if (pathsChanged) {
      const focusedPath = model.getFocusedPath();
      filesRef.current = files;
      filePathSetRef.current = new Set(files.map((file) => file.path));
      const nextPaths = files.map((file) => file.path);
      const nextPreparedInput = prepareFileTreeInput(nextPaths, {
        flattenEmptyDirectories: true,
      });
      syncingSelectionRef.current = true;
      model.resetPaths(nextPaths, { preparedInput: nextPreparedInput });
      model.focusNearestPath(focusedPath);
      syncingSelectionRef.current = false;
    }

    registerPeerFileTreeNav(
      navRegion,
      files.map((file) => ({ path: file.path })),
      model,
    );

    return () => {
      unregisterPeerFileTreeNav(navRegion, model);
    };
  }, [files, model, navRegion]);

  const activatePath = (path: string) => {
    if (!filePathSetRef.current.has(path)) {
      return;
    }

    selectedPathRef.current = path;
    setPierreSelectedPath(path);
    onActivatePathRef.current(path);
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
        activatePath(path);
        return;
      }
    }
  };

  const handleHostKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Enter") {
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
    <div data-nav-region={navRegion} className="min-h-0 flex-1 overflow-hidden">
      <PeerFileTree
        model={model}
        className="block h-full min-h-0"
        style={TREE_HOST_STYLE}
        onClick={handleHostClick}
        onKeyDown={handleHostKeyDown}
      />
    </div>
  );
}
