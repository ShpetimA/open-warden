import { useHotkey } from "@tanstack/react-hotkeys";
import { useStore } from "react-redux";

import { useAppDispatch } from "@/app/hooks";
import type { RootState } from "@/app/store";
import { gitApi } from "@/features/source-control/api";
import { selectHistoryCommit, selectHistoryFile } from "@/features/source-control/actions";
import { HISTORY_FILTER_INPUT_ID } from "@/features/source-control/constants";
import { setHistoryNavTarget } from "@/features/source-control/sourceControlSlice";
import type { FileItem, HistoryCommit } from "@/features/source-control/types";
import { isTypingTarget } from "@/features/source-control/utils";
import {
  getWrappedNavigationIndex,
  scrollKeyboardNavItemIntoView,
} from "@/lib/keyboard-navigation";
import {
  focusInputById,
  getVisibleFilePaths,
  SOURCE_CONTROL_HOTKEY_OPTIONS,
  useVerticalNavigationHotkeys,
} from "./keyboardNavigation";

export function useHistoryKeyboardNav() {
  const dispatch = useAppDispatch();
  const store = useStore<RootState>();

  const getNavigationData = () => {
    const state = store.getState();
    const { historyCommitId, historyNavTarget, historyFilter, activePath, activeRepo } =
      state.sourceControl;
    const historyCommitsArgs = activeRepo ? { repoPath: activeRepo } : null;
    const historyFilesArgs =
      activeRepo && historyCommitId ? { repoPath: activeRepo, commitId: historyCommitId } : null;
    const historyCommits = historyCommitsArgs
      ? gitApi.endpoints.getCommitHistory.select(historyCommitsArgs)(state).data
      : undefined;
    const historyFiles = historyFilesArgs
      ? gitApi.endpoints.getCommitFiles.select(historyFilesArgs)(state).data
      : undefined;

    return {
      historyCommitId,
      historyNavTarget,
      historyFilter,
      activePath,
      allHistoryCommits: (historyCommits ?? []) as HistoryCommit[],
      allHistoryFiles: (historyFiles ?? []) as FileItem[],
    };
  };

  const navigateHistory = (event: KeyboardEvent, nextKey: boolean) => {
    if (isTypingTarget(event.target)) return;
    event.preventDefault();

    const {
      historyCommitId,
      historyNavTarget,
      historyFilter,
      activePath,
      allHistoryCommits,
      allHistoryFiles,
    } = getNavigationData();

    if (historyNavTarget === "files") {
      const visibleFilePaths = getVisibleFilePaths("history-files");
      const filePaths =
        visibleFilePaths.length > 0 ? visibleFilePaths : allHistoryFiles.map((file) => file.path);
      if (filePaths.length === 0) return;

      const activeIndex = filePaths.findIndex((pathValue) => pathValue === activePath);

      const targetIndex = getWrappedNavigationIndex(activeIndex, filePaths.length, nextKey);

      const targetPath = filePaths[targetIndex];
      if (!targetPath) return;
      scrollKeyboardNavItemIntoView("history-files", targetIndex);
      void dispatch(selectHistoryFile(targetPath));
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

  const focusHistoryFilter = (event: KeyboardEvent) => {
    if (isTypingTarget(event.target)) return;
    event.preventDefault();
    dispatch(setHistoryNavTarget("commits"));
    focusInputById(HISTORY_FILTER_INPUT_ID);
  };

  useHotkey(
    "H",
    (event) => {
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      dispatch(setHistoryNavTarget("commits"));
    },
    SOURCE_CONTROL_HOTKEY_OPTIONS,
  );

  useHotkey(
    "L",
    (event) => {
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      dispatch(setHistoryNavTarget("files"));
    },
    SOURCE_CONTROL_HOTKEY_OPTIONS,
  );

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
