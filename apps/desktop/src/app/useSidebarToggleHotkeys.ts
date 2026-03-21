import { useHotkey } from "@tanstack/react-hotkeys";

import { FEATURE_SIDEBARS, type FeatureKey } from "@/app/featureNavigation";

type UseSidebarToggleHotkeysOptions = {
  activeFeature: FeatureKey;
  toggle: (panelId: string) => void;
};

function sidebarPanelIdForIcon(activeFeature: FeatureKey, icon: "left" | "right") {
  return FEATURE_SIDEBARS[activeFeature].find((sidebar) => sidebar.icon === icon)?.panelId ?? null;
}

export function useSidebarToggleHotkeys({
  activeFeature,
  toggle,
}: UseSidebarToggleHotkeysOptions) {
  const leftSidebarPanelId = sidebarPanelIdForIcon(activeFeature, "left");
  const rightSidebarPanelId = sidebarPanelIdForIcon(activeFeature, "right");

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
