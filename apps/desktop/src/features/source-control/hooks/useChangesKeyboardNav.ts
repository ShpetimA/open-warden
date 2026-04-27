import { useHotkey } from "@tanstack/react-hotkeys";
import { useStore } from "react-redux";

import { useAppDispatch } from "@/app/hooks";
import type { RootState } from "@/app/store";
import { confirmDiscard } from "@/features/comments/actions";
import { gitApi } from "@/features/source-control/api";
import {
  discardChangesGroupAction,
  rangeSelectFile,
  selectFile,
  stageOrUnstageSelectionAction,
} from "@/features/source-control/actions";
import {
  getPierreFileTreeFocusedBucketedFile,
  getPierreFileTreeVisibleBucketedFiles,
  movePierreFileTreeFocus,
  movePierreFileTreeFocusFile,
  scrollPierreFileTreeBucketedFileIntoView,
} from "@/features/source-control/pierreFileTreeNavigation";
import type { Bucket, BucketedFile, FileItem } from "@/features/source-control/types";
import { isTypingTarget } from "@/features/source-control/utils";
import {
  openFileViewer,
  setRepoTreeActivePath,
  setSymbolPeekActiveIndex,
} from "@/features/source-control/sourceControlSlice";
import { getWrappedNavigationIndex } from "@/lib/keyboard-navigation";
import { SOURCE_CONTROL_HOTKEY_OPTIONS, useVerticalNavigationHotkeys } from "./keyboardNavigation";
import { getNextSymbolPeekIndex } from "./symbolPeekNavigation";

function toBucketedFile(file: FileItem, bucket: Bucket) {
  return {
    path: file.path,
    previousPath: file.previousPath,
    status: file.status,
    bucket,
  } satisfies BucketedFile;
}

export function useChangesKeyboardNav(mode: "changes" | "files") {
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
      selectedFiles,
    } = state.sourceControl;
    const snapshot = activeRepo
      ? gitApi.endpoints.getGitSnapshot.select(activeRepo)(state).data
      : undefined;

    return {
      activeBucket,
      activePath,
      activeRepo,
      collapseStaged,
      collapseUnstaged,
      runningAction,
      selectedFiles,
      snapshot,
    };
  };

  const navigateChanges = (event: KeyboardEvent, nextKey: boolean, extendSelection: boolean) => {
    if (isTypingTarget(event.target)) return;

    const symbolPeekIndex = getNextSymbolPeekIndex(store.getState(), nextKey);
    if (symbolPeekIndex !== null) {
      event.preventDefault();
      dispatch(setSymbolPeekActiveIndex(symbolPeekIndex));
      return;
    }

    event.preventDefault();

    const { activeBucket, activePath, activeRepo, collapseStaged, collapseUnstaged, snapshot } =
      getNavigationData();

    if (mode === "files") {
      if (!activeRepo) {
        return;
      }

      const targetFile = movePierreFileTreeFocusFile("repo-files", nextKey);
      const targetPath = targetFile?.realPath ?? targetFile?.path;
      if (!targetPath) {
        return;
      }

      dispatch(setRepoTreeActivePath(targetPath));
      dispatch(
        openFileViewer({
          repoPath: activeRepo,
          relPath: targetPath,
        }),
      );
      return;
    }

    const unstaged = snapshot?.unstaged ?? [];
    const staged = snapshot?.staged ?? [];
    const untracked = snapshot?.untracked ?? [];
    const stagedRows: BucketedFile[] = staged.map((file) => toBucketedFile(file, "staged"));
    const changedRows: BucketedFile[] = [
      ...unstaged.map((file) => toBucketedFile(file, "unstaged")),
      ...untracked.map((file) => toBucketedFile(file, "untracked")),
    ];

    if (!extendSelection) {
      const targetPath = movePierreFileTreeFocus("changes-files", nextKey);
      if (!targetPath) {
        return;
      }

      const focusedFile = getPierreFileTreeFocusedBucketedFile("changes-files");
      if (focusedFile) {
        void dispatch(selectFile(focusedFile.bucket, focusedFile.path));
      }
      return;
    }

    const visibleTreeRows = getPierreFileTreeVisibleBucketedFiles("changes-files");
    const visibleChangeRows: BucketedFile[] =
      visibleTreeRows.length > 0
        ? visibleTreeRows
        : (() => {
            const fallbackRows: BucketedFile[] = [];
            if (!collapseStaged) fallbackRows.push(...stagedRows);
            if (!collapseUnstaged) fallbackRows.push(...changedRows);
            return fallbackRows;
          })();

    if (visibleChangeRows.length === 0) return;

    const focusedFile = getPierreFileTreeFocusedBucketedFile("changes-files");
    const activeIndex = visibleChangeRows.findIndex((file) =>
      focusedFile
        ? file.bucket === focusedFile.bucket && file.path === focusedFile.path
        : file.bucket === activeBucket && file.path === activePath,
    );
    const targetIndex = getWrappedNavigationIndex(activeIndex, visibleChangeRows.length, nextKey);
    const targetFile = visibleChangeRows[targetIndex];
    if (!targetFile) return;

    scrollPierreFileTreeBucketedFileIntoView("changes-files", targetFile.bucket, targetFile.path);
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
  };

  const stageOrUnstageSelection = (event: KeyboardEvent) => {
    if (isTypingTarget(event.target)) return;
    const { runningAction } = getNavigationData();
    if (mode !== "changes") return;
    if (runningAction) return;
    event.preventDefault();
    void dispatch(stageOrUnstageSelectionAction());
  };

  const discardSelection = async (event: KeyboardEvent) => {
    if (isTypingTarget(event.target)) return;
    if (mode !== "changes") return;

    const { activeBucket, activePath, activeRepo, runningAction, selectedFiles, snapshot } =
      getNavigationData();
    if (!activeRepo || runningAction) return;

    const candidates =
      selectedFiles.length > 0
        ? selectedFiles
        : activePath
          ? [{ bucket: activeBucket, path: activePath }]
          : [];
    if (candidates.length === 0) return;

    const snapshotRows: BucketedFile[] = [
      ...(snapshot?.staged ?? []).map((file) => toBucketedFile(file, "staged")),
      ...(snapshot?.unstaged ?? []).map((file) => toBucketedFile(file, "unstaged")),
      ...(snapshot?.untracked ?? []).map((file) => toBucketedFile(file, "untracked")),
    ];
    const discardTargets = candidates
      .map((candidate) =>
        snapshotRows.find((row) => row.bucket === candidate.bucket && row.path === candidate.path),
      )
      .filter((row): row is BucketedFile => !!row);
    if (discardTargets.length === 0) return;

    event.preventDefault();
    const confirmed = await confirmDiscard(
      `Discard changes for ${discardTargets.length} file${discardTargets.length === 1 ? "" : "s"}?`,
    );
    if (!confirmed) return;

    void dispatch(discardChangesGroupAction(discardTargets));
  };

  useVerticalNavigationHotkeys({
    onNext: (event) => navigateChanges(event, true, false),
    onPrevious: (event) => navigateChanges(event, false, false),
    onExtendNext: (event) => navigateChanges(event, true, true),
    onExtendPrevious: (event) => navigateChanges(event, false, true),
  });

  useHotkey("Mod+Enter", stageOrUnstageSelection, SOURCE_CONTROL_HOTKEY_OPTIONS);
  useHotkey("Mod+Escape", discardSelection, SOURCE_CONTROL_HOTKEY_OPTIONS);
}
