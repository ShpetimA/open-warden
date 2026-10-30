import { desktopFailure } from "@/platform/desktop/failure";
import { skipToken } from "@reduxjs/toolkit/query";
import { useEffect, useRef, useState } from "react";
import { usePreparePullRequestCompareRefsQuery } from "@/features/hosted-repos/api";
import { useGetBranchFilesQuery } from "@/features/source-control/api";
import { errorMessageFrom } from "@/features/source-control/shared-utils/errorMessage";
import type { FileItem, PullRequestCompareRefs, PullRequestLocatorInput } from "@/platform/desktop";

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
  const key = locator === skipToken ? "" : `${locator.repoPath}\0${locator.pullRequestNumber}`;
  const [retained, setRetained] = useState<{
    key: string;
    refs: PullRequestCompareRefs;
    files: FileItem[];
  } | null>(null);
  const currentFiles = filesQuery.currentData;
  const ready = Boolean(refs && matchesHead && currentFiles);

  if (
    refs &&
    matchesHead &&
    currentFiles &&
    (retained?.key !== key || retained.refs !== refs || retained.files !== currentFiles)
  ) {
    setRetained({ key, refs, files: currentFiles });
  }

  const displayed =
    ready && refs && currentFiles
      ? { refs, files: currentFiles }
      : retained?.key === key
        ? retained
        : null;
  const comparisonError =
    errorMessageFrom(error ?? filesQuery.error, "") ||
    (refs && !matchesHead && !isFetching && refreshedHead.current === expectedHeadSha
      ? "The PR comparison does not match this revision. Refresh the pull request and try again."
      : "");

  return {
    refs: displayed?.refs,
    files: displayed?.files,
    stale: !ready,
    loading: locator !== skipToken && !comparisonError && !displayed,
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
