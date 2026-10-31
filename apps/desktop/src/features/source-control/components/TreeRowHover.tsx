import type { ReactNode } from "react";
import {
  DelayedHoverCardGroup,
  type HoverCardTarget,
} from "@/components/ui/delayed-hover-card-group";

function rowFromPath(path: EventTarget[], directoriesOnly: boolean): HoverCardTarget | null {
  for (const element of path) {
    if (!(element instanceof HTMLElement) || element.dataset.type !== "item") continue;
    if (directoriesOnly && !element.hasAttribute("aria-expanded")) return null;

    const itemPath = element.dataset.itemPath;
    const label = element.getAttribute("aria-label");
    if (itemPath && label) return { element, path: itemPath, label };
  }
  return null;
}

export function TreeRowHover({
  children,
  renderContent,
  directoriesOnly = false,
}: {
  children: ReactNode;
  renderContent?: (path: string, label: string) => ReactNode;
  directoriesOnly?: boolean;
}) {
  return (
    <DelayedHoverCardGroup
      getTarget={(path) => rowFromPath(path, directoriesOnly)}
      renderContent={renderContent}
    >
      {children}
    </DelayedHoverCardGroup>
  );
}
