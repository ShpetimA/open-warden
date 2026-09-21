import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useStore } from "react-redux";
import { useLocation } from "react-router";
import type { RootState } from "@/app/store";
import { useAppSelector } from "@/app/hooks";
import { ViewMemoryContext, type ViewMemory } from "@/components/layout/ViewMemory";
import { ProjectReviewTabs } from "./ProjectReviewTabs";
import { selectActiveWorkspace, workspaceMemoryChanged } from "../workspacesSlice";

const scrollSelectors = [
  ".diff-viewport-scroll",
  "[data-file-tree-virtualized-scroll]",
  "[data-slot=scroll-area-viewport]",
  "[data-workspace-scroll]",
];

export function WorkspaceContent({ children }: { children: ReactNode }) {
  const workspace = useAppSelector(selectActiveWorkspace);
  const id = workspace?.id ?? "";
  const { pathname } = useLocation();
  return (
    <div className="flex h-full min-h-0 flex-col">
      <ProjectReviewTabs />
      <div className="min-h-0 flex-1">
        <WorkspaceContentView key={`${id}:${pathname}`} memoryId={`${id}:${pathname}`}>
          {children}
        </WorkspaceContentView>
      </div>
    </div>
  );
}

function WorkspaceContentView({ children, memoryId }: { children: ReactNode; memoryId: string }) {
  const store = useStore<RootState>();
  const container = useRef<HTMLDivElement>(null);
  const [memory] = useState<ViewMemory>(() => ({
    read: (key) => store.getState().workspaces.memory[`${memoryId}:${key}`],
    write: (key, value) => {
      store.dispatch(workspaceMemoryChanged({ key: `${memoryId}:${key}`, value }));
    },
  }));
  useLayoutEffect(() => {
    const root = container.current;
    if (!root) return;
    const restored = new WeakSet<Element>();
    let frame = 0;
    const elements = () =>
      scrollSelectors.flatMap((selector) =>
        Array.from(root.querySelectorAll<HTMLElement>(selector)).map((element, index) => ({
          element,
          key: `scroll:${selector}:${index}`,
        })),
      );
    const restore = () => {
      for (const { element, key } of elements()) {
        if (restored.has(element)) continue;
        const saved = memory.read(key);
        if (!saved) {
          restored.add(element);
          continue;
        }
        element.scrollTop = saved.top ?? 0;
        element.scrollLeft = saved.left ?? 0;
        if (element.scrollTop >= (saved.top ?? 0)) restored.add(element);
      }
    };
    const scroll = (event: Event) => {
      for (const { element, key } of elements()) {
        if (element === event.target && restored.has(element))
          memory.write(key, { top: element.scrollTop, left: element.scrollLeft });
      }
    };
    const userScroll = () => elements().forEach(({ element }) => restored.add(element));
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(restore);
    });
    observer.observe(root, { childList: true, subtree: true });
    root.addEventListener("scroll", scroll, true);
    root.addEventListener("wheel", userScroll, { passive: true });
    restore();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      root.removeEventListener("scroll", scroll, true);
      root.removeEventListener("wheel", userScroll);
    };
  }, [memory]);
  return (
    <ViewMemoryContext value={memory}>
      <div ref={container} className="h-full min-h-0 min-w-0">
        {children}
      </div>
    </ViewMemoryContext>
  );
}
