import { PanelLeftInactive, PanelLeftOpen, PanelRightInactive, PanelRightOpen } from "lucide-react";
import { useLocation } from "react-router";

import { FEATURE_SIDEBARS, featureKeyFromPath } from "@/app/featureNavigation";
import { useSidebarToggleHotkeys } from "@/app/useSidebarToggleHotkeys";
import { TooltipProvider, Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSidebarPanelRegistry } from "@/components/layout/SidebarPanelRegistry";

function sidebarPanelIcon(icon: "left" | "right", isCollapsed: boolean) {
  if (icon === "left") {
    return isCollapsed ? <PanelLeftInactive /> : <PanelLeftOpen />;
  }
  return isCollapsed ? <PanelRightInactive /> : <PanelRightOpen />;
}

export function SidebarPanelToggles() {
  const location = useLocation();
  const feature = featureKeyFromPath(location.pathname);
  const { panels, toggle } = useSidebarPanelRegistry();
  const sidebars = FEATURE_SIDEBARS[feature].filter((sidebar) => panels.has(sidebar.panelId));
  useSidebarToggleHotkeys({ sidebars, toggle });

  if (sidebars.length === 0) {
    return null;
  }

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-1">
        {sidebars.map((sidebar) => {
          const entry = panels.get(sidebar.panelId);
          const isCollapsed = entry?.collapsed ?? true;
          const tooltipLabel =
            sidebar.panelId === "history-files" ? "Toggle files pane" : "Toggle sidebar";
          const shortcut = sidebar.icon === "left" ? "⌘S" : "⌘⇧S";

          return (
            <Tooltip key={sidebar.panelId}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className={`flex h-8 w-8 items-center justify-center rounded-md transition-[background-color,color] duration-150 ease-[var(--ease-out)] active:scale-[0.95] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${
                    isCollapsed
                      ? "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                      : "text-foreground"
                  }`}
                  onClick={() => toggle(sidebar.panelId)}
                  aria-label={`${tooltipLabel} (${shortcut})`}
                >
                  {sidebarPanelIcon(sidebar.icon, isCollapsed)}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="px-2.5 py-1.5">
                <div className="flex items-center gap-2">
                  <span>{tooltipLabel}</span>
                  <span className="border-input bg-surface-alt text-muted-foreground rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-none">
                    {shortcut}
                  </span>
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
