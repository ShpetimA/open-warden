import { createContext, useContext, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import type { PanelImperativeHandle } from "react-resizable-panels";

type PanelEntry = {
  ref: PanelImperativeHandle;
  collapsed: boolean;
};

type SidebarPanelRegistryApi = {
  register: (id: string, ref: PanelImperativeHandle) => void;
  unregister: (id: string) => void;
  setCollapsed: (id: string, collapsed: boolean) => void;
  toggle: (id: string) => void;
  subscribe: (callback: () => void) => () => void;
  getSnapshot: () => ReadonlyMap<string, PanelEntry>;
};

function createRegistryApi(): SidebarPanelRegistryApi {
  const panels = new Map<string, PanelEntry>();
  const listeners = new Set<() => void>();
  let snapshot: ReadonlyMap<string, PanelEntry> = new Map();

  function emit() {
    snapshot = new Map(panels);
    for (const listener of listeners) {
      listener();
    }
  }

  return {
    register(id, ref) {
      panels.set(id, { ref, collapsed: ref.isCollapsed() });
      emit();
    },

    unregister(id) {
      panels.delete(id);
      emit();
    },

    setCollapsed(id, collapsed) {
      const entry = panels.get(id);
      if (!entry || entry.collapsed === collapsed) return;
      panels.set(id, { ...entry, collapsed });
      emit();
    },

    toggle(id) {
      const entry = panels.get(id);
      if (!entry) return;
      if (entry.ref.isCollapsed()) {
        entry.ref.expand();
      } else {
        entry.ref.collapse();
      }
    },

    subscribe(callback) {
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    },

    getSnapshot() {
      return snapshot;
    },
  };
}

const SidebarPanelRegistryContext = createContext<SidebarPanelRegistryApi | null>(null);

type SidebarPanelRegistryProviderProps = {
  children: ReactNode;
};

export function SidebarPanelRegistryProvider({ children }: SidebarPanelRegistryProviderProps) {
  const [api] = useState(createRegistryApi);

  return (
    <SidebarPanelRegistryContext.Provider value={api}>
      {children}
    </SidebarPanelRegistryContext.Provider>
  );
}

export function useSidebarPanelRegistryOptional() {
  return useContext(SidebarPanelRegistryContext);
}

export function useSidebarPanelRegistry() {
  const api = useContext(SidebarPanelRegistryContext);
  if (!api) {
    throw new Error("useSidebarPanelRegistry must be used within a SidebarPanelRegistryProvider");
  }

  const panels = useSyncExternalStore(api.subscribe, api.getSnapshot);

  return {
    panels,
    toggle: api.toggle,
  };
}
