import { useHotkey } from "@tanstack/react-hotkeys";
import { useStore } from "react-redux";

import { useAppDispatch } from "@/app/hooks";
import type { RootState } from "@/app/store";
import { gitApi } from "@/features/source-control/api";
import { selectHistoryCommit, selectHistoryFile } from "@/features/source-control/actions";
import { HISTORY_FILTER_INPUT_ID } from "@/features/source-control/constants";
import {
  movePierreFileTreeFocus,
  movePierreFileTreeFocusFile,
  scrollPierreFileTreePathIntoView,
  scrollPierreFileTreeRealPathIntoView,
} from "@/features/source-control/pierreFileTreeNavigation";
import {
  setHistoryNavTarget,
  setSymbolPeekActiveIndex,
} from "@/features/source-control/sourceControlSlice";
import type { HistoryCommit } from "@/features/source-control/types";
import { isTypingTarget } from "@/features/source-control/utils";
import {
  focusKeyboardNavItem,
  getWrappedNavigationIndex,
  scrollKeyboardNavItemIntoView,
} from "@/lib/keyboard-navigation";
import {
  focusInputById,
  SOURCE_CONTROL_HOTKEY_OPTIONS,
  useVerticalNavigationHotkeys,
} from "./keyboardNavigation";
import { getNextSymbolPeekIndex } from "./symbolPeekNavigation";

export function useHistoryKeyboardNav() {
  const dispatch = useAppDispatch();
  const store = useStore<RootState>();

  const getNavigationData = () => {
    const state = store.getState();
    const { historyCommitId, historyNavTarget, historyFilter, activePath, activeRepo } =
      state.sourceControl;
    const fileBrowserMode = state.settings.appSettings.sourceControl.fileTreeRenderMode;
    const historyCommitsArgs = activeRepo ? { repoPath: activeRepo } : null;
    const historyCommits = historyCommitsArgs
      ? gitApi.endpoints.getCommitHistory.select(historyCommitsArgs)(state).data
      : undefined;

    return {
      historyCommitId,
      historyNavTarget,
      historyFilter,
      fileBrowserMode,
      activePath,
      allHistoryCommits: (historyCommits ?? []) as HistoryCommit[],
    };
  };

  const navigateHistory = (event: KeyboardEvent, nextKey: boolean) => {
    if (isTypingTarget(event.target)) return;

    const symbolPeekIndex = getNextSymbolPeekIndex(store.getState(), nextKey);
    if (symbolPeekIndex !== null) {
      event.preventDefault();
      dispatch(setSymbolPeekActiveIndex(symbolPeekIndex));
      return;
    }

    event.preventDefault();

    const { historyCommitId, historyNavTarget, historyFilter, fileBrowserMode, allHistoryCommits } =
      getNavigationData();

    if (historyNavTarget === "files") {
      if (fileBrowserMode === "tree") {
        movePierreFileTreeFocus("history-files", nextKey);
        return;
      }

      const targetFile = movePierreFileTreeFocusFile("history-files", nextKey);
      if (!targetFile) return;
      void dispatch(selectHistoryFile(targetFile.realPath ?? targetFile.path));
      return;
    }

    const query = historyFilter.trim().toLowerCase();
    const filteredHistoryCommits = !query
      ? allHistoryCommits
      : allHistoryCommits.filter((commit) => {
          return (
            commit.summary.toLowerCase().includes(query) ||
            commit.shortId.toLowerCase().includes(query) ||
            commit.commitId.toLowerCase().includes(query) ||
            commit.author.toLowerCase().includes(query)
          );
        });

    if (filteredHistoryCommits.length === 0) return;

    const activeIndex = filteredHistoryCommits.findIndex(
      (commit) => commit.commitId === historyCommitId,
    );

    const targetIndex = getWrappedNavigationIndex(
      activeIndex,
      filteredHistoryCommits.length,
      nextKey,
    );

    const targetCommit = filteredHistoryCommits[targetIndex];
    if (!targetCommit) return;
    scrollKeyboardNavItemIntoView("history-commits", targetIndex);
    void dispatch(selectHistoryCommit(targetCommit.commitId));
  };

  const getFilteredHistoryCommits = () => {
    const { historyFilter, allHistoryCommits } = getNavigationData();
    const query = historyFilter.trim().toLowerCase();
    return !query
      ? allHistoryCommits
      : allHistoryCommits.filter((commit) => {
          return (
            commit.summary.toLowerCase().includes(query) ||
            commit.shortId.toLowerCase().includes(query) ||
            commit.commitId.toLowerCase().includes(query) ||
            commit.author.toLowerCase().includes(query)
          );
        });
  };

  const focusHistoryCommitList = () => {
    const { historyCommitId } = getNavigationData();
    const filteredHistoryCommits = getFilteredHistoryCommits();
    const activeIndex = filteredHistoryCommits.findIndex(
      (commit) => commit.commitId === historyCommitId,
    );
    const targetIndex = activeIndex >= 0 ? activeIndex : 0;

    window.requestAnimationFrame(() => {
      focusKeyboardNavItem("history-commits", targetIndex);
    });
  };

  const focusHistoryFileList = () => {
    const { activePath, fileBrowserMode } = getNavigationData();

    window.requestAnimationFrame(() => {
      if (fileBrowserMode === "tree") {
        if (activePath) {
          scrollPierreFileTreePathIntoView("history-files", activePath);
        } else {
          movePierreFileTreeFocus("history-files", true);
        }
        return;
      }

      if (activePath) {
        scrollPierreFileTreeRealPathIntoView("history-files", activePath);
        return;
      }

      movePierreFileTreeFocus("history-files", true);
    });
  };

  const focusHistoryFilter = (event: KeyboardEvent) => {
    if (isTypingTarget(event.target)) return;
    event.preventDefault();
    dispatch(setHistoryNavTarget("commits"));
    focusInputById(HISTORY_FILTER_INPUT_ID);
  };

  const handleFocusHistoryCommits = (event: KeyboardEvent) => {
    if (isTypingTarget(event.target)) return;
    event.preventDefault();
    dispatch(setHistoryNavTarget("commits"));
    focusHistoryCommitList();
  };

  const handleFocusHistoryFiles = (event: KeyboardEvent) => {
    if (isTypingTarget(event.target)) return;
    event.preventDefault();
    dispatch(setHistoryNavTarget("files"));
    focusHistoryFileList();
  };

  useHotkey("H", handleFocusHistoryCommits, SOURCE_CONTROL_HOTKEY_OPTIONS);
  useHotkey("h", handleFocusHistoryCommits, SOURCE_CONTROL_HOTKEY_OPTIONS);

  useHotkey("L", handleFocusHistoryFiles, SOURCE_CONTROL_HOTKEY_OPTIONS);
  useHotkey("l", handleFocusHistoryFiles, SOURCE_CONTROL_HOTKEY_OPTIONS);

  useHotkey(
    "/",
    (event) => {
      focusHistoryFilter(event);
    },
    SOURCE_CONTROL_HOTKEY_OPTIONS,
  );

  useHotkey(
    { key: "?" },
    (event) => {
      focusHistoryFilter(event);
    },
    SOURCE_CONTROL_HOTKEY_OPTIONS,
  );

  useVerticalNavigationHotkeys({
    onNext: (event) => navigateHistory(event, true),
    onPrevious: (event) => navigateHistory(event, false),
  });
}
