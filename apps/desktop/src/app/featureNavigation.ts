import { GitBranch, GitPullRequestArrow, History } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type FeatureKey = "changes" | "history" | "review";

export type FeatureNavItem = {
  key: FeatureKey;
  path: `/${FeatureKey}`;
  label: string;
  icon: LucideIcon;
};

export const FEATURE_NAV_ITEMS: FeatureNavItem[] = [
  { key: "changes", path: "/changes", label: "Changes", icon: GitPullRequestArrow },
  { key: "history", path: "/history", label: "History", icon: History },
  { key: "review", path: "/review", label: "Review", icon: GitBranch },
];

export function featureKeyFromPath(pathname: string): FeatureKey {
  if (pathname.startsWith("/history")) return "history";
  if (pathname.startsWith("/review")) return "review";
  return "changes";
}

export function featureHasPrimarySidebar(feature: FeatureKey): boolean {
  return feature === "changes" || feature === "history";
}

export type SidebarConfig = {
  panelId: string;
  icon: "left" | "right";
};

export const FEATURE_SIDEBARS: Record<FeatureKey, SidebarConfig[]> = {
  changes: [{ panelId: "primary", icon: "left" }],
  history: [
    { panelId: "primary", icon: "left" },
    { panelId: "history-files", icon: "right" },
  ],
  review: [{ panelId: "review", icon: "left" }],
};
