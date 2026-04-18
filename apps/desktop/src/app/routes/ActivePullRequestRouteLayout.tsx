import { Navigate, Outlet } from "react-router";

import { useAppSelector } from "@/app/hooks";
import { useResolveActivePullRequestForBranchQuery } from "@/features/hosted-repos/api";
import { useGetGitSnapshotQuery } from "@/features/source-control/api";
import { errorMessageFrom } from "@/features/source-control/shared-utils/errorMessage";

export function ActivePullRequestRouteLayout() {
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo);
  const currentReview = useAppSelector((state) => state.pullRequests.currentReview);

  const { activeBranch, loadingSnapshot, fetchingSnapshot } = useGetGitSnapshotQuery(activeRepo, {
    skip: !activeRepo,
    selectFromResult: ({ data, isLoading, isFetching }) => ({
      activeBranch: data?.branch?.trim() ?? "",
      loadingSnapshot: isLoading,
      fetchingSnapshot: isFetching,
    }),
  });

  const {
    activePullRequest,
    activePullRequestError,
    loadingActivePullRequest,
    fetchingActivePullRequest,
  } = useResolveActivePullRequestForBranchQuery(
    { repoPath: activeRepo, branch: activeBranch },
    {
      skip: !activeRepo || !activeBranch,
      selectFromResult: ({ data, error, isLoading, isFetching }) => ({
        activePullRequest: data ?? null,
        activePullRequestError: error,
        loadingActivePullRequest: isLoading,
        fetchingActivePullRequest: isFetching,
      }),
    },
  );

  const hasCachedCurrentReview = currentReview !== null && currentReview.repoPath === activeRepo;
  const waitingForBranch = !activeBranch && (loadingSnapshot || fetchingSnapshot);
  const waitingForPullRequestResolution =
    activeBranch !== "" && (loadingActivePullRequest || fetchingActivePullRequest);

  if (activePullRequest) {
    return <Outlet />;
  }

  if (activePullRequestError) {
    return (
      <div className="text-destructive p-6 text-sm">
        {errorMessageFrom(activePullRequestError, "Unable to load active pull request.")}
      </div>
    );
  }

  if (hasCachedCurrentReview && (waitingForBranch || waitingForPullRequestResolution)) {
    return <Outlet />;
  }

  if (waitingForBranch || waitingForPullRequestResolution) {
    return <div className="text-muted-foreground p-6 text-sm">Loading pull request...</div>;
  }

  return <Navigate to="/changes" replace />;
}
