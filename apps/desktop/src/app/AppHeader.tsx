import {
  PanelLeftInactive,
  PanelLeftOpen,
  PanelRightInactive,
  PanelRightOpen,
  Search,
} from "lucide-react";
import { useNavigate } from "react-router";
import { ThemeSwitcher } from "@/app/ThemeSwitcher";
import { FEATURE_NAV_ITEMS, FEATURE_SIDEBARS, type FeatureKey } from "@/app/featureNavigation";
import { useSidebarPanelRegistry } from "@/components/layout/SidebarPanelRegistry";

type AppHeaderProps = {
  activeFeature: FeatureKey;
  onOpenCommandPalette: () => void;
};

export function AppHeader({ activeFeature, onOpenCommandPalette }: AppHeaderProps) {
  const navigate = useNavigate();
  const { panels, toggle } = useSidebarPanelRegistry();
  const sidebars = FEATURE_SIDEBARS[activeFeature];

  return (
    <header className="app-drag-region border-border bg-surface-toolbar grid h-14 select-none grid-cols-[1fr_auto_1fr] items-center gap-3 border-b pl-22 pr-3">
      <div className="min-w-0">
        <div className="app-no-drag bg-surface-alt border-input inline-flex items-center gap-0.5 rounded-md border p-0.5">
          {sidebars.map((sidebar) => {
            const entry = panels.get(sidebar.panelId);
            const isCollapsed = entry?.collapsed ?? true;
            const Icon =
              sidebar.icon === "left"
                ? isCollapsed
                  ? PanelLeftInactive
                  : PanelLeftOpen
                : isCollapsed
                  ? PanelRightInactive
                  : PanelRightOpen;

            return (
              <button
                key={sidebar.panelId}
                type="button"
                className={`inline-flex h-7 w-7 items-center justify-center rounded-sm transition-colors ${
                  isCollapsed
                    ? "text-muted-foreground hover:bg-accent hover:text-foreground"
                    : "text-foreground"
                }`}
                onClick={() => {
                  toggle(sidebar.panelId);
                }}
                title={isCollapsed ? "Show sidebar" : "Hide sidebar"}
                aria-label={isCollapsed ? "Show sidebar" : "Hide sidebar"}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-w-0 justify-self-center">
        <div className="app-no-drag border-input bg-surface-alt inline-flex w-fit items-center gap-1 rounded-xl border p-1">
          {FEATURE_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = item.key === activeFeature;

            return (
              <button
                key={item.key}
                type="button"
                className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm ${
                  isActive
                    ? "bg-surface-active text-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
                onClick={() => {
                  navigate(item.path);
                }}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="app-no-drag flex min-w-0 items-center justify-self-end gap-1.5">
        <button
          type="button"
          className="border-input bg-surface-alt text-muted-foreground hover:text-foreground inline-flex h-8 w-8 items-center justify-center rounded-md border"
          onClick={onOpenCommandPalette}
          title="Open Command Palette (⌘K)"
          aria-label="Open command palette"
        >
          <Search className="h-3.5 w-3.5" />
        </button>

        <ThemeSwitcher />
      </div>
    </header>
  );
}
