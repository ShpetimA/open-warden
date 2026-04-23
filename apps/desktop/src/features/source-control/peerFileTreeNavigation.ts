import type { FileTree as PeerFileTreeModel } from "@pierre/trees";

import {
  buildSourceControlFileTree,
  type SourceControlTreeNode,
} from "@/features/source-control/fileTree";

type PeerTreeNavFile = {
  path: string;
};

type PeerTreeNavEntry = {
  files: ReadonlyArray<PeerTreeNavFile>;
  model: PeerFileTreeModel;
};

const peerTreeNavRegistry = new Map<string, PeerTreeNavEntry>();

const treeNodesCache = new WeakMap<
  ReadonlyArray<PeerTreeNavFile>,
  ReadonlyArray<SourceControlTreeNode<PeerTreeNavFile>>
>();

export function registerPeerFileTreeNav(
  regionId: string,
  files: ReadonlyArray<PeerTreeNavFile>,
  model: PeerFileTreeModel,
) {
  peerTreeNavRegistry.set(regionId, { files, model });
}

export function unregisterPeerFileTreeNav(regionId: string, model: PeerFileTreeModel) {
  const currentEntry = peerTreeNavRegistry.get(regionId);
  if (!currentEntry || currentEntry.model !== model) {
    return;
  }

  peerTreeNavRegistry.delete(regionId);
}

export function getPeerFileTreeVisiblePaths(regionId: string) {
  const entry = peerTreeNavRegistry.get(regionId);
  if (!entry) {
    return [];
  }

  let treeNodes = treeNodesCache.get(entry.files);
  if (!treeNodes) {
    treeNodes = buildSourceControlFileTree(entry.files);
    treeNodesCache.set(entry.files, treeNodes);
  }

  return collectVisibleFilePaths(treeNodes, entry.model);
}

export function scrollPeerFileTreePathIntoView(regionId: string, path: string) {
  const entry = peerTreeNavRegistry.get(regionId);
  if (!entry || !path) {
    return;
  }

  ensurePeerFileTreeOwnsFocus(entry.model, path);
  entry.model.focusPath(path);
}

export function movePeerFileTreeFocus(regionId: string, next: boolean) {
  const entry = peerTreeNavRegistry.get(regionId);
  if (!entry) {
    return null;
  }

  const focusedPath = entry.model.getFocusedPath();
  const nearestFocusedPath = entry.model.focusNearestPath(focusedPath);
  if (!nearestFocusedPath) {
    return null;
  }

  ensurePeerFileTreeOwnsFocus(entry.model, nearestFocusedPath);

  if (focusedPath !== nearestFocusedPath) {
    return nearestFocusedPath;
  }

  const focusTarget = getPeerFileTreeKeyboardTarget(entry.model);
  if (!focusTarget) {
    return null;
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

  return entry.model.getFocusedPath();
}

function ensurePeerFileTreeOwnsFocus(model: PeerFileTreeModel, path: string) {
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

function getPeerFileTreeKeyboardTarget(model: PeerFileTreeModel) {
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

function collectVisibleFilePaths(
  nodes: ReadonlyArray<SourceControlTreeNode<PeerTreeNavFile>>,
  model: PeerFileTreeModel,
): string[] {
  const visiblePaths: string[] = [];

  for (const node of nodes) {
    if (node.kind === "file") {
      visiblePaths.push(node.file.path);
      continue;
    }

    const directoryItem = model.getItem(node.path);
    const isExpanded =
      directoryItem && "isExpanded" in directoryItem ? directoryItem.isExpanded() : true;
    if (!isExpanded) {
      continue;
    }

    visiblePaths.push(...collectVisibleFilePaths(node.children, model));
  }

  return visiblePaths;
}
