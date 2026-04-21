import { useHotkey } from "@tanstack/react-hotkeys";

import type { SidebarConfig } from "@/app/featureNavigation";

type UseSidebarToggleHotkeysOptions = {
  sidebars: SidebarConfig[];
  toggle: (panelId: string) => void;
};

function sidebarPanelIdForIcon(sidebars: SidebarConfig[], icon: "left" | "right") {
  return sidebars.find((sidebar) => sidebar.icon === icon)?.panelId ?? null;
}

export function useSidebarToggleHotkeys({ sidebars, toggle }: UseSidebarToggleHotkeysOptions) {
  const leftSidebarPanelId = sidebarPanelIdForIcon(sidebars, "left");
  const rightSidebarPanelId = sidebarPanelIdForIcon(sidebars, "right");

  useHotkey(
    "Mod+S",
    (event) => {
      if (!leftSidebarPanelId) return;
      event.preventDefault();
      toggle(leftSidebarPanelId);
    },
    {
      enabled: Boolean(leftSidebarPanelId),
      ignoreInputs: false,
      preventDefault: false,
      stopPropagation: false,
    },
  );

  useHotkey(
    "Mod+Shift+S",
    (event) => {
      if (!rightSidebarPanelId) return;
      event.preventDefault();
      toggle(rightSidebarPanelId);
    },
    {
      enabled: Boolean(rightSidebarPanelId),
      ignoreInputs: false,
      preventDefault: false,
      stopPropagation: false,
    },
  );
}
