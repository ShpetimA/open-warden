import { type FileTree as PierreFileTreeModel, type FileTreeSortComparator } from "@pierre/trees";
import { useLayoutEffect, useRef } from "react";

import {
  buildSourceControlFileTree,
  type BuildSourceControlFileTreeOptions,
} from "@/features/source-control/fileTree";
import type { PierreFileTreeBrowserFile } from "@/features/source-control/components/PierreFileTreeBrowser";
import { buildTreeOptions } from "@/features/source-control/components/pierreFileTree";

const INITIAL_SCROLL_MAX_ATTEMPTS = 20;
const TREE_ROOT_SELECTOR = "[data-file-tree-virtualized-root='true']";
const TREE_SCROLL_SELECTOR = "[data-file-tree-virtualized-scroll='true']";

type UseOnLayoutScrollToFocusedPathOptions<TFile extends PierreFileTreeBrowserFile> = {
  model: PierreFileTreeModel;
  selectedPath: string;
  filesRef: { current: ReadonlyArray<TFile> };
  syncingSelectionRef: { current: boolean };
  compareTreeDirectories: BuildSourceControlFileTreeOptions<TFile>["compareDirectories"];
  flattenEmptyDirectories: boolean;
  sort: "default" | FileTreeSortComparator;
};

function findExpandedInitialRowIndex<TFile extends PierreFileTreeBrowserFile>(
  files: ReadonlyArray<TFile>,
  path: string,
  treeOptions: BuildSourceControlFileTreeOptions<TFile>,
) {
  const pendingNodes = buildSourceControlFileTree(files, treeOptions).toReversed();

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

function useOnLayoutScrollToFocusedPath<TFile extends PierreFileTreeBrowserFile>({
  model,
  selectedPath,
  filesRef,
  syncingSelectionRef,
  compareTreeDirectories,
  flattenEmptyDirectories,
  sort,
}: UseOnLayoutScrollToFocusedPathOptions<TFile>) {
  const didApplyInitialScrollRef = useRef(false);

  useLayoutEffect(() => {
    if (didApplyInitialScrollRef.current || !selectedPath) {
      return;
    }

    let canceled = false;
    let animationFrameId: number | null = null;
    let attemptCount = 0;

    const applyInitialScroll = () => {
      if (canceled || didApplyInitialScrollRef.current) {
        return;
      }

      const hostElement = model.getFileTreeContainer();
      const shadowRoot = hostElement?.shadowRoot;
      const focusTarget = shadowRoot?.querySelector<HTMLElement>(TREE_ROOT_SELECTOR);
      const scrollTarget = shadowRoot?.querySelector<HTMLElement>(TREE_SCROLL_SELECTOR);

      if (!focusTarget || !scrollTarget || scrollTarget.clientHeight === 0) {
        attemptCount += 1;
        if (attemptCount < INITIAL_SCROLL_MAX_ATTEMPTS) {
          animationFrameId = window.requestAnimationFrame(applyInitialScroll);
        }
        return;
      }

      didApplyInitialScrollRef.current = true;
      const initialRowIndex = findExpandedInitialRowIndex(
        filesRef.current,
        selectedPath,
        buildTreeOptions(compareTreeDirectories, flattenEmptyDirectories, sort),
      );

      if (initialRowIndex !== null) {
        const itemHeight = model.getItemHeight();
        const targetOffset = Math.max(0, Math.floor((scrollTarget.clientHeight - itemHeight) / 2));
        scrollTarget.scrollTop = Math.max(0, initialRowIndex * itemHeight - targetOffset);
      }

      syncingSelectionRef.current = true;
      model.focusPath(selectedPath);
      syncingSelectionRef.current = false;
      focusTarget.focus({ preventScroll: true });
      getPierreFileTreeRowElement(model, selectedPath)?.scrollIntoView({ block: "nearest" });
    };

    animationFrameId = window.requestAnimationFrame(applyInitialScroll);

    return () => {
      canceled = true;
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }
    };
  }, [compareTreeDirectories, flattenEmptyDirectories, selectedPath, model, sort]);
}

export default useOnLayoutScrollToFocusedPath;
