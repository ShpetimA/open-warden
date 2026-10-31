import { createContext, useContext, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";

import type { ComposerPane } from "./commandComposerFlow";

type LayoutProps = {
  pane: ComposerPane;
  children: ReactNode;
};

type LayoutContextValue = {
  rootRef: RefObject<HTMLDivElement | null>;
};

const LayoutContext = createContext<LayoutContextValue | null>(null);

export function CommandComposerLayoutHost({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [context] = useState<LayoutContextValue>(() => ({ rootRef }));

  return (
    <LayoutContext.Provider value={context}>
      <div ref={rootRef} tabIndex={-1} className="change-composer">
        {children}
      </div>
    </LayoutContext.Provider>
  );
}

function useLayoutContext() {
  const context = useContext(LayoutContext);

  if (!context) {
    throw new Error("CommandComposerLayout requires CommandComposerLayoutHost");
  }

  return context;
}

export function useCommandComposerRootRef() {
  return useLayoutContext().rootRef;
}

export function CommandComposerLayout({ children }: LayoutProps) {
  return children;
}
