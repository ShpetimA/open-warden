import { useHotkey } from "@tanstack/react-hotkeys";
import { useStore } from "react-redux";

import { useAppDispatch } from "@/app/hooks";
import type { RootState } from "@/app/store";
import { gitApi } from "@/features/source-control/api";
import { setReviewActivePath } from "@/features/source-control/sourceControlSlice";
import type { FileItem } from "@/features/source-control/types";
import { isTypingTarget } from "@/features/source-control/utils";
import {
  getWrappedNavigationIndex,
  scrollKeyboardNavItemIntoView,
} from "@/lib/keyboard-navigation";

export function useReviewKeyboardNav() {
  const dispatch = useAppDispatch();
  const store = useStore<RootState>();

  const getVisibleReviewFilePaths = () =>
    Array.from(
      document.querySelectorAll<HTMLElement>(
        '[data-nav-region="review-files"] [data-tree-file-row="true"]',
      ),
    )
      .sort((a, b) => Number(a.dataset.navIndex) - Number(b.dataset.navIndex))
      .map((element) => element.dataset.filePath ?? "")
      .filter((pathValue) => pathValue.length > 0);

  const getNavigationData = () => {
    const state = store.getState();
    const { activeRepo, reviewBaseRef, reviewHeadRef, reviewActivePath } = state.sourceControl;
    const branchFilesArgs =
      activeRepo && reviewBaseRef && reviewHeadRef
        ? {
            repoPath: activeRepo,
            baseRef: reviewBaseRef,
            headRef: reviewHeadRef,
          }
        : null;
    const reviewFiles = branchFilesArgs
      ? gitApi.endpoints.getBranchFiles.select(branchFilesArgs)(state).data
      : undefined;

    return {
      reviewActivePath,
      allReviewFiles: (reviewFiles ?? []) as FileItem[],
    };
  };

  const navigateReview = (event: KeyboardEvent, nextKey: boolean) => {
    if (isTypingTarget(event.target)) return;
    event.preventDefault();

    const { reviewActivePath, allReviewFiles } = getNavigationData();
    const visibleFilePaths = getVisibleReviewFilePaths();
    const filePaths =
      visibleFilePaths.length > 0 ? visibleFilePaths : allReviewFiles.map((file) => file.path);
    if (filePaths.length === 0) return;

    const activeIndex = filePaths.findIndex((pathValue) => pathValue === reviewActivePath);

    const targetIndex = getWrappedNavigationIndex(activeIndex, filePaths.length, nextKey);

    const targetPath = filePaths[targetIndex];
    if (!targetPath) return;
    scrollKeyboardNavItemIntoView("review-files", targetIndex);
    dispatch(setReviewActivePath(targetPath));
  };

  useHotkey(
    "ArrowDown",
    (event) => {
      navigateReview(event, true);
    },
    { ignoreInputs: false, preventDefault: false, stopPropagation: false },
  );

  useHotkey(
    "J",
    (event) => {
      navigateReview(event, true);
    },
    { ignoreInputs: false, preventDefault: false, stopPropagation: false },
  );

  useHotkey(
    "ArrowUp",
    (event) => {
      navigateReview(event, false);
    },
    { ignoreInputs: false, preventDefault: false, stopPropagation: false },
  );

  useHotkey(
    "K",
    (event) => {
      navigateReview(event, false);
    },
    { ignoreInputs: false, preventDefault: false, stopPropagation: false },
  );
}
