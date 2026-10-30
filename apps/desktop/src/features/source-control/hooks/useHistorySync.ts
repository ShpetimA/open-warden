import { useEffect } from "react";
import { skipToken } from "@reduxjs/toolkit/query";

import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { getHistoryComparison } from "@/features/source-control/historySelection";
import {
  useGetBranchFilesQuery,
  useGetCommitFilesQuery,
  useGetCommitHistoryQuery,
} from "@/features/source-control/api";
import {
  clearHistorySelection,
  setActivePath,
  setHistoryCommitId,
} from "@/features/source-control/sourceControlSlice";

export function useHistorySync() {
  const dispatch = useAppDispatch();
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo);
  const historyCommitId = useAppSelector((state) => state.sourceControl.historyCommitId);
  const historySelectedCommitIds = useAppSelector(
    (state) => state.sourceControl.historySelectedCommitIds,
  );
  const activePath = useAppSelector((state) => state.sourceControl.activePath);

  const { currentData: historyCommits } = useGetCommitHistoryQuery(
    activeRepo ? { repoPath: activeRepo } : skipToken,
  );

  const comparison = getHistoryComparison(historyCommits ?? [], historySelectedCommitIds);
  const { currentData: historyFiles } = useGetCommitFilesQuery(
    activeRepo && historyCommitId && !comparison
      ? { repoPath: activeRepo, commitId: historyCommitId }
      : skipToken,
  );
  const { currentData: combinedFiles } = useGetBranchFilesQuery(
    activeRepo && comparison
      ? { repoPath: activeRepo, baseRef: comparison.baseRef, headRef: comparison.headRef }
      : skipToken,
  );
  const visibleFiles = comparison ? combinedFiles : historyFiles;

  useEffect(() => {
    if (!activeRepo) {
      dispatch(clearHistorySelection());
      return;
    }
    if (!historyCommits || historyCommitId) return;
    const firstCommit = historyCommits[0];
    if (firstCommit) dispatch(setHistoryCommitId(firstCommit.commitId));
  }, [activeRepo, dispatch, historyCommits, historyCommitId]);

  useEffect(() => {
    if (!historyCommitId) {
      dispatch(setActivePath(""));
      return;
    }
    if (!visibleFiles) return;
    if (visibleFiles.length === 0) {
      dispatch(setActivePath(""));
      return;
    }
    const existing = visibleFiles.find((file) => file.path === activePath);
    if (!existing) {
      dispatch(setActivePath(visibleFiles[0].path));
    }
  }, [activePath, dispatch, historyCommitId, visibleFiles]);
}
