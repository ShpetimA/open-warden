import { desktopFailure } from "@/platform/desktop/failure";
import { skipToken } from "@reduxjs/toolkit/query";
import { useEffect, useRef } from "react";
import { usePreparePullRequestCompareRefsQuery } from "@/features/hosted-repos/api";
import { useGetBranchFilesQuery } from "@/features/source-control/api";
import { errorMessageFrom } from "@/features/source-control/shared-utils/errorMessage";
import type { PullRequestLocatorInput } from "@/platform/desktop";

export function usePullRequestComparison(
  locator: PullRequestLocatorInput | typeof skipToken,
  expectedHeadSha?: string,
) {
  const {
    currentData: refs,
    isFetching,
    error,
    refetch,
  } = usePreparePullRequestCompareRefsQuery(locator);
  const refreshedHead = useRef("");
  const matchesHead = !expectedHeadSha || refs?.compareHeadRef.startsWith(expectedHeadSha);

  useEffect(() => {
    if (!refs || !expectedHeadSha || matchesHead || refreshedHead.current === expectedHeadSha)
      return;
    refreshedHead.current = expectedHeadSha;
    void refetch();
  }, [refs, expectedHeadSha, matchesHead, refetch]);

  const filesQuery = useGetBranchFilesQuery(
    locator !== skipToken && refs && matchesHead
      ? { repoPath: locator.repoPath, baseRef: refs.compareBaseRef, headRef: refs.compareHeadRef }
      : skipToken,
  );
  const comparisonError =
    errorMessageFrom(error ?? filesQuery.error, "") ||
    (refs && !matchesHead && !isFetching && refreshedHead.current === expectedHeadSha
      ? "The PR comparison does not match this revision. Refresh the pull request and try again."
      : "");

  return {
    refs: matchesHead ? refs : undefined,
    files: filesQuery.currentData,
    loading:
      locator !== skipToken &&
      !comparisonError &&
      (!refs || !matchesHead || !filesQuery.currentData),
    error: comparisonError,
    failure:
      error ??
      filesQuery.error ??
      (comparisonError
        ? desktopFailure("preparePullRequestCompareRefs", "conflict", comparisonError)
        : undefined),
    refreshing: isFetching || filesQuery.isFetching,
    retry() {
      if (locator === skipToken) return;
      if (error || !refs || !matchesHead) void refetch();
      else void filesQuery.refetch();
    },
  };
}
