import { useHotkey } from "@tanstack/react-hotkeys";
import type { RefObject } from "react";
import { useStore } from "react-redux";

import { useAppDispatch } from "@/app/hooks";
import type { RootState } from "@/app/store";
import { useSidebarPanelRegistryOptional } from "@/components/layout/SidebarPanelRegistry";
import { setPullRequestPreviewActiveFilePath } from "@/features/pull-requests/pullRequestsSlice";
import {
  SOURCE_CONTROL_HOTKEY_OPTIONS,
  useVerticalNavigationHotkeys,
} from "@/features/source-control/hooks/keyboardNavigation";
import {
  movePierreFileTreeFocusFile,
  movePierreFileTreeFocusByFile,
  scrollPierreFileTreeRealPathIntoView,
} from "@/features/source-control/pierreFileTreeNavigation";
import { isTypingTarget } from "@/features/source-control/utils";
import { focusKeyboardNavItem, getWrappedNavigationIndex } from "@/lib/keyboard-navigation";
import type { HistoryCommit } from "@/platform/desktop";

export type PullRequestNavigationTarget = "commits" | "files";

export function usePullRequestPaneNavigation({
  target,
  commits,
  selectedCommit,
  onCommitSelect,
}: {
  target: RefObject<PullRequestNavigationTarget>;
  commits: readonly HistoryCommit[];
  selectedCommit: HistoryCommit | null;
  onCommitSelect: (commit: HistoryCommit) => void;
}) {
  const dispatch = useAppDispatch();
  const store = useStore<RootState>();
  const registry = useSidebarPanelRegistryOptional();

  function focusPane(event: KeyboardEvent, pane: PullRequestNavigationTarget) {
    if (isTypingTarget(event.target)) return;
    event.preventDefault();
    target.current = pane;
    registry
      ?.getSnapshot()
      .get(pane === "commits" ? "primary" : "pr-files")
      ?.ref.expand();

    window.requestAnimationFrame(() => {
      if (pane === "commits") {
        const selected = document.querySelector<HTMLElement>(
          '[data-nav-region="pr-commits"] [aria-pressed="true"]',
        );
        focusKeyboardNavItem("pr-commits", Number(selected?.dataset.navIndex ?? 0));
        return;
      }

      const path = store.getState().pullRequests.previewActiveFilePath;
      scrollPierreFileTreeRealPathIntoView("pull-request-files", path);
    });
  }

  function navigate(event: KeyboardEvent, forward: boolean) {
    if (isTypingTarget(event.target)) return;
    event.preventDefault();

    if (target.current === "files") {
      const move = /^[jk]$/i.test(event.key)
        ? movePierreFileTreeFocusByFile
        : movePierreFileTreeFocusFile;
      const file = move("pull-request-files", forward);
      if (file) dispatch(setPullRequestPreviewActiveFilePath(file.realPath ?? file.path));
      return;
    }

    const index = commits.findIndex((commit) => commit.commitId === selectedCommit?.commitId);
    const nextIndex = getWrappedNavigationIndex(index, commits.length, forward);
    const commit = commits[nextIndex];
    if (!commit) return;
    onCommitSelect(commit);
    focusKeyboardNavItem("pr-commits", nextIndex);
  }

  useHotkey("H", (event) => focusPane(event, "commits"), SOURCE_CONTROL_HOTKEY_OPTIONS);
  useHotkey("L", (event) => focusPane(event, "files"), SOURCE_CONTROL_HOTKEY_OPTIONS);
  useVerticalNavigationHotkeys({
    onNext: (event) => navigate(event, true),
    onPrevious: (event) => navigate(event, false),
  });
}
