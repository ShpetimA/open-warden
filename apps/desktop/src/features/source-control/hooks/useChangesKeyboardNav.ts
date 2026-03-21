import { useHotkey } from "@tanstack/react-hotkeys";
import { useStore } from "react-redux";

import { useAppDispatch } from "@/app/hooks";
import type { RootState } from "@/app/store";
import { gitApi } from "@/features/source-control/api";
import {
  rangeSelectFile,
  selectFile,
  stageOrUnstageSelectionAction,
} from "@/features/source-control/actions";
import type { BucketedFile } from "@/features/source-control/types";
import { isTypingTarget } from "@/features/source-control/utils";
import {
  getWrappedNavigationIndex,
  scrollKeyboardNavItemIntoView,
} from "@/lib/keyboard-navigation";
import {
  getVisibleBucketedFiles,
  SOURCE_CONTROL_HOTKEY_OPTIONS,
  useVerticalNavigationHotkeys,
} from "./keyboardNavigation";

export function useChangesKeyboardNav() {
  const dispatch = useAppDispatch();
  const store = useStore<RootState>();

  const getNavigationData = () => {
    const state = store.getState();
    const {
      activeBucket,
      activePath,
      activeRepo,
      collapseStaged,
      collapseUnstaged,
      runningAction,
    } = state.sourceControl;
    const snapshot = activeRepo
      ? gitApi.endpoints.getGitSnapshot.select(activeRepo)(state).data
      : undefined;

    return {
      activeBucket,
      activePath,
      collapseStaged,
      collapseUnstaged,
      runningAction,
      snapshot,
    };
  };

  const navigateChanges = (event: KeyboardEvent, nextKey: boolean, extendSelection: boolean) => {
    if (isTypingTarget(event.target)) return;
    event.preventDefault();

    const { activeBucket, activePath, collapseStaged, collapseUnstaged, snapshot } =
      getNavigationData();
    const unstaged = snapshot?.unstaged ?? [];
    const staged = snapshot?.staged ?? [];
    const untracked = snapshot?.untracked ?? [];
    const stagedRows: BucketedFile[] = staged.map((file) => ({
      ...file,
      bucket: "staged",
    }));
    const changedRows: BucketedFile[] = [
      ...unstaged.map((file) => ({ ...file, bucket: "unstaged" as const })),
      ...untracked.map((file) => ({ ...file, bucket: "untracked" as const })),
    ];
    const visibleChangeRowsFromDom = getVisibleBucketedFiles("changes-files");
    const visibleChangeRows: BucketedFile[] =
      visibleChangeRowsFromDom.length > 0
        ? visibleChangeRowsFromDom
        : (() => {
            const fallbackRows: BucketedFile[] = [];
            if (!collapseStaged) fallbackRows.push(...stagedRows);
            if (!collapseUnstaged) fallbackRows.push(...changedRows);
            return fallbackRows;
          })();

    if (visibleChangeRows.length === 0) return;

    const activeIndex = visibleChangeRows.findIndex(
      (file) => file.bucket === activeBucket && file.path === activePath,
    );

    const targetIndex = getWrappedNavigationIndex(activeIndex, visibleChangeRows.length, nextKey);

    const targetFile = visibleChangeRows[targetIndex];
    if (!targetFile) return;

    scrollKeyboardNavItemIntoView("changes-files", targetIndex);

    if (extendSelection) {
      void dispatch(
        rangeSelectFile(
          {
            bucket: targetFile.bucket,
            path: targetFile.path,
          },
          visibleChangeRows,
        ),
      );
      return;
    }

    void dispatch(selectFile(targetFile.bucket, targetFile.path));
  };

  const stageOrUnstageSelection = (event: KeyboardEvent) => {
    if (isTypingTarget(event.target)) return;
    const { runningAction } = getNavigationData();
    if (runningAction) return;
    event.preventDefault();
    void dispatch(stageOrUnstageSelectionAction());
  };

  useVerticalNavigationHotkeys({
    onNext: (event) => navigateChanges(event, true, false),
    onPrevious: (event) => navigateChanges(event, false, false),
    onExtendNext: (event) => navigateChanges(event, true, true),
    onExtendPrevious: (event) => navigateChanges(event, false, true),
  });

  useHotkey("Mod+Enter", stageOrUnstageSelection, SOURCE_CONTROL_HOTKEY_OPTIONS);
}
