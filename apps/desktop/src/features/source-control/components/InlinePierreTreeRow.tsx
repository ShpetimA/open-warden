import { useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { FileTree } from "@pierre/trees";

import { expandPierreFileTreeParents } from "./pierreFileTree";

export type PierreTreeInlineEditor = { path: string; anchorPath?: string; children: ReactNode };

export function InlinePierreTreeRow({
  model,
  path,
  children,
}: PierreTreeInlineEditor & { model: FileTree }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const mount = document.createElement("span");
    mount.dataset.treeInlineEditor = "true";
    let frame: number | null = null;
    let disposed = false;
    let observer: MutationObserver | null = null;

    function attach() {
      if (disposed) return;
      const shadow = model.getFileTreeContainer()?.shadowRoot;
      if (!shadow) {
        scheduleAttach();
        return;
      }
      if (!observer) {
        observer = new MutationObserver(attach);
        observer.observe(shadow, { childList: true, subtree: true });
      }
      const row = Array.from(
        shadow.querySelectorAll<HTMLElement>("[data-type='item'][data-item-path]"),
      ).find((element) => element.dataset.itemPath === path);
      const content = row?.querySelector<HTMLElement>("[data-item-section='content']");
      if (!content) return;
      if (mount.parentElement !== content) {
        row?.setAttribute("aria-label", "New file or folder");
        content.append(mount);
        setHost(mount);
      }
      mount.querySelector("input")?.focus({ preventScroll: true });
    }
    function scheduleAttach() {
      if (frame === null) {
        frame = requestAnimationFrame(() => {
          frame = null;
          attach();
        });
      }
    }
    const unsubscribe = model.subscribe(scheduleAttach);
    expandPierreFileTreeParents(model, path);
    model.focusPath(path);
    attach();
    scheduleAttach();

    return () => {
      disposed = true;
      observer?.disconnect();
      unsubscribe();
      if (frame !== null) cancelAnimationFrame(frame);
      mount.remove();
    };
  }, [model, path]);

  return host ? createPortal(children, host) : null;
}
