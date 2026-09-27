import { createContext, useContext, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";

import type { ComposerPane } from "./commandComposerFlow";

type Layout = {
  pane: ComposerPane;
  children: ReactNode;
};

type LayoutContextValue = {
  rootRef: RefObject<HTMLDivElement | null>;
  setLayout: (layout: Layout) => void;
};

const LayoutContext = createContext<LayoutContextValue | null>(null);

export function CommandComposerLayoutHost({ children }: { children: ReactNode }) {
  const [layout, setLayout] = useState<Layout | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [context] = useState<LayoutContextValue>(() => ({ rootRef, setLayout }));

  return (
    <LayoutContext.Provider value={context}>
      {children}
      <div ref={rootRef} tabIndex={-1} className="change-composer" data-pane={layout?.pane}>
        {layout?.children}
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

export function CommandComposerLayout({ pane, children }: Layout) {
  const { setLayout } = useLayoutContext();

  // Keep the host mounted while flow owners change, so cards retain their prior positions.
  useLayoutEffect(() => {
    setLayout({ pane, children });
  }, [children, pane, setLayout]);

  return null;
}
