import { useHotkey } from "@tanstack/react-hotkeys";
import { useRef } from "react";

import { useSidebarPanelRegistryOptional } from "@/components/layout/SidebarPanelRegistry";
import {
  SOURCE_CONTROL_HOTKEY_OPTIONS,
  useVerticalNavigationHotkeys,
} from "@/features/source-control/hooks/keyboardNavigation";
import {
  movePierreFileTreeFocusByFile,
  movePierreFileTreeFocusFile,
  scrollPierreFileTreeRealPathIntoView,
} from "@/features/source-control/pierreFileTreeNavigation";
import { isTypingTarget } from "@/features/source-control/utils";
import { focusKeyboardNavItem } from "@/lib/keyboard-navigation";
import type { GuidanceReference, GuidanceStep } from "@/platform/desktop/guidance";

type GuidancePane = "steps" | "files";

export function useGuidancePaneNavigation({
  steps,
  step,
  reference,
  busy,
  blocked,
  onSelectStep,
  onSelectReference,
}: {
  steps: readonly GuidanceStep[];
  step: GuidanceStep | undefined;
  reference: GuidanceReference | undefined;
  busy: boolean;
  blocked: boolean;
  onSelectStep(id: string): void;
  onSelectReference(index: number): void;
}) {
  const target = useRef<GuidancePane>("steps");
  const registry = useSidebarPanelRegistryOptional();

  function focusPane(event: KeyboardEvent, pane: GuidancePane) {
    if (blocked || isTypingTarget(event.target)) return;
    event.preventDefault();
    target.current = pane;
    registry
      ?.getSnapshot()
      .get(pane === "steps" ? "primary" : "pr-files")
      ?.ref.expand();

    window.requestAnimationFrame(() => {
      if (pane === "steps") {
        const index = steps.findIndex((item) => item.id === step?.id);
        focusKeyboardNavItem("guidance-steps", Math.max(0, index));
      } else if (reference) {
        scrollPierreFileTreeRealPathIntoView("guidance-files", reference.path);
      } else {
        document.querySelector<HTMLElement>('[aria-label="Files for this step"]')?.focus();
      }
    });
  }

  function navigate(event: KeyboardEvent, forward: boolean) {
    if (blocked || busy || !step || isTypingTarget(event.target)) return;
    event.preventDefault();

    if (target.current === "files") {
      const move = /^[jk]$/i.test(event.key)
        ? movePierreFileTreeFocusByFile
        : movePierreFileTreeFocusFile;
      const file = move("guidance-files", forward);
      if (!file) return;
      const index = step.references.findIndex((item) => item.path === (file.realPath ?? file.path));
      if (index >= 0) onSelectReference(index);
      return;
    }

    const index = steps.findIndex((item) => item.id === step.id) + (forward ? 1 : -1);
    const adjacent = steps[index];
    if (!adjacent) return;
    onSelectStep(adjacent.id);
    focusKeyboardNavItem("guidance-steps", index);
  }

  useHotkey("H", (event) => focusPane(event, "steps"), SOURCE_CONTROL_HOTKEY_OPTIONS);
  useHotkey("L", (event) => focusPane(event, "files"), SOURCE_CONTROL_HOTKEY_OPTIONS);
  useVerticalNavigationHotkeys({
    onNext: (event) => navigate(event, true),
    onPrevious: (event) => navigate(event, false),
  });

  return target;
}
