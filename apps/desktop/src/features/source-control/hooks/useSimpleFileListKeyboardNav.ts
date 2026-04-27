import { useStore } from "react-redux";

import { useAppDispatch } from "@/app/hooks";
import type { RootState } from "@/app/store";
import {
  movePierreFileTreeFocus,
  movePierreFileTreeFocusFile,
} from "@/features/source-control/pierreFileTreeNavigation";
import { setSymbolPeekActiveIndex } from "@/features/source-control/sourceControlSlice";
import { isTypingTarget } from "@/features/source-control/utils";
import { useVerticalNavigationHotkeys } from "./keyboardNavigation";
import { getNextSymbolPeekIndex } from "./symbolPeekNavigation";

type UseSimpleFileListKeyboardNavOptions = {
  regionId: string;
  getAllFilePaths: (state: RootState) => string[];
  getActivePath: (state: RootState) => string;
  onSelectPath: (path: string) => void;
  enabled?: (state: RootState) => boolean;
  includeSymbolPeek?: boolean;
};

export function useSimpleFileListKeyboardNav({
  regionId,
  getAllFilePaths,
  getActivePath,
  onSelectPath,
  enabled,
  includeSymbolPeek = true,
}: UseSimpleFileListKeyboardNavOptions) {
  const dispatch = useAppDispatch();
  const store = useStore<RootState>();

  useVerticalNavigationHotkeys({
    onNext: (event) => navigate(event, true),
    onPrevious: (event) => navigate(event, false),
  });

  function navigate(event: KeyboardEvent, nextKey: boolean) {
    if (isTypingTarget(event.target)) {
      return;
    }

    const state = store.getState();
    if (enabled && !enabled(state)) {
      return;
    }

    if (includeSymbolPeek) {
      const symbolPeekIndex = getNextSymbolPeekIndex(state, nextKey);
      if (symbolPeekIndex !== null) {
        event.preventDefault();
        dispatch(setSymbolPeekActiveIndex(symbolPeekIndex));
        return;
      }
    }

    event.preventDefault();

    if (state.settings.appSettings.sourceControl.fileTreeRenderMode === "tree") {
      movePierreFileTreeFocus(regionId, nextKey);
      return;
    }

    const targetFile = movePierreFileTreeFocusFile(regionId, nextKey);
    if (!targetFile) {
      return;
    }

    onSelectPath(targetFile.realPath ?? targetFile.path);
  }
}
