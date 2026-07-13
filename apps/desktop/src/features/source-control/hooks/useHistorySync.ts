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

  const { data: historyCommits } = useGetCommitHistoryQuery(
    activeRepo ? { repoPath: activeRepo } : skipToken,
  );

  const comparison = getHistoryComparison(historyCommits ?? [], historySelectedCommitIds);
  const { data: historyFiles } = useGetCommitFilesQuery(
    activeRepo && historyCommitId && !comparison
      ? { repoPath: activeRepo, commitId: historyCommitId }
      : skipToken,
  );
  const { data: combinedFiles } = useGetBranchFilesQuery(
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
    if (!historyCommits) return;
    if (historyCommits.length === 0) {
      dispatch(clearHistorySelection());
      return;
    }

    const existing = historyCommits.find((commit) => commit.commitId === historyCommitId);
    const nextCommit = existing ?? historyCommits[0];
    if (nextCommit && nextCommit.commitId !== historyCommitId) {
      dispatch(setHistoryCommitId(nextCommit.commitId));
    }
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
