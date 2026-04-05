import { useStore } from "react-redux";

import { useAppDispatch } from "@/app/hooks";
import type { RootState } from "@/app/store";
import { gitApi } from "@/features/source-control/api";
import {
  setReviewActivePath,
  setSymbolPeekActiveIndex,
} from "@/features/source-control/sourceControlSlice";
import type { FileItem } from "@/features/source-control/types";
import { isTypingTarget } from "@/features/source-control/utils";
import {
  getWrappedNavigationIndex,
  scrollKeyboardNavItemIntoView,
} from "@/lib/keyboard-navigation";
import { getVisibleFilePaths, useVerticalNavigationHotkeys } from "./keyboardNavigation";
import { getNextSymbolPeekIndex } from "./symbolPeekNavigation";

export function useReviewKeyboardNav() {
  const dispatch = useAppDispatch();
  const store = useStore<RootState>();

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

    const symbolPeekIndex = getNextSymbolPeekIndex(store.getState(), nextKey);
    if (symbolPeekIndex !== null) {
      event.preventDefault();
      dispatch(setSymbolPeekActiveIndex(symbolPeekIndex));
      return;
    }

    event.preventDefault();

    const { reviewActivePath, allReviewFiles } = getNavigationData();
    const visibleFilePaths = getVisibleFilePaths("review-files");
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

  useVerticalNavigationHotkeys({
    onNext: (event) => navigateReview(event, true),
    onPrevious: (event) => navigateReview(event, false),
  });
}
