import { skipToken } from "@reduxjs/toolkit/query";
import { useEffect, type ComponentType } from "react";
import { GitPullRequest } from "lucide-react";

import { useAppDispatch, useAppSelector } from "@/app/hooks";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  usePreparePullRequestCompareRefsQuery,
  useResolveActivePullRequestForBranchQuery,
  useResolveHostedRepoQuery,
} from "@/features/hosted-repos/api";
import type { PullRequestReviewSession } from "@/features/pull-requests/pullRequestsSlice";
import {
  clearCurrentPullRequestReview,
  setCurrentPullRequestReview,
} from "@/features/pull-requests/pullRequestsSlice";
import { useGetGitSnapshotQuery } from "@/features/source-control/api";
import {
  clearReviewSelection,
  setReviewBaseRef,
  setReviewHeadRef,
} from "@/features/source-control/sourceControlSlice";

function createReviewSessionFromActivePullRequest(input: {
  repoPath: string;
  providerId: PullRequestReviewSession["providerId"];
  owner: string;
  repo: string;
  pullRequestNumber: number;
  title: string;
  baseRef: string;
  headRef: string;
  compareBaseRef: string;
  compareHeadRef: string;
}): PullRequestReviewSession {
  return {
    providerId: input.providerId,
    owner: input.owner,
    repo: input.repo,
    pullRequestNumber: input.pullRequestNumber,
    title: input.title,
    baseRef: input.baseRef,
    headRef: input.headRef,
    compareBaseRef: input.compareBaseRef,
    compareHeadRef: input.compareHeadRef,
    repoPath: input.repoPath,
    worktreePath: input.repoPath,
  };
}

function reviewSessionMatchesPullRequest(
  review: PullRequestReviewSession | null,
  nextReview: PullRequestReviewSession,
) {
  if (!review) {
    return false;
  }

  return (
    review.providerId === nextReview.providerId &&
    review.owner === nextReview.owner &&
    review.repo === nextReview.repo &&
    review.pullRequestNumber === nextReview.pullRequestNumber &&
    review.title === nextReview.title &&
    review.baseRef === nextReview.baseRef &&
    review.headRef === nextReview.headRef &&
    review.repoPath === nextReview.repoPath &&
    review.worktreePath === nextReview.worktreePath
  );
}

export function usePullRequestReviewSession() {
  const dispatch = useAppDispatch();

  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo);
  const currentReview = useAppSelector((state) => state.pullRequests.currentReview);
  const reviewBaseRef = useAppSelector((state) => state.sourceControl.reviewBaseRef);
  const reviewHeadRef = useAppSelector((state) => state.sourceControl.reviewHeadRef);

  const { activeBranch } = useGetGitSnapshotQuery(activeRepo || "", {
    skip: !activeRepo,
    selectFromResult: ({ data }) => ({
      activeBranch: data?.branch?.trim() ?? "",
    }),
  });

  const { hostedRepo } = useResolveHostedRepoQuery(activeRepo, {
    skip: !activeRepo,
    selectFromResult: ({ data }) => ({
      hostedRepo: data ?? null,
    }),
  });

  const {
    activePullRequest,
    loadingActivePullRequest,
    fetchingActivePullRequest,
    hasActivePullRequestError,
  } = useResolveActivePullRequestForBranchQuery(
    { repoPath: activeRepo, branch: activeBranch },
    {
      skip: !activeRepo || !activeBranch,
      selectFromResult: ({ data, error, isLoading, isFetching }) => ({
        activePullRequest: data ?? null,
        loadingActivePullRequest: isLoading,
        fetchingActivePullRequest: isFetching,
        hasActivePullRequestError: Boolean(error),
      }),
    },
  );

  const { compareRefs } = usePreparePullRequestCompareRefsQuery(
    activeRepo && activePullRequest
      ? {
          repoPath: activeRepo,
          pullRequestNumber: activePullRequest.number,
        }
      : skipToken,
    {
      selectFromResult: ({ data }) => ({
        compareRefs: data ?? null,
      }),
    },
  );

  const samePullRequestAsCurrentReview =
    currentReview !== null &&
    activePullRequest !== null &&
    currentReview.repoPath === activeRepo &&
    currentReview.providerId === activePullRequest.providerId &&
    currentReview.pullRequestNumber === activePullRequest.number;

  const compareBaseRef =
    compareRefs?.compareBaseRef ??
    (samePullRequestAsCurrentReview ? currentReview.compareBaseRef : "");
  const compareHeadRef =
    compareRefs?.compareHeadRef ??
    (samePullRequestAsCurrentReview ? currentReview.compareHeadRef : "");

  const nextResolvedReview =
    activeRepo && hostedRepo && activePullRequest
      ? createReviewSessionFromActivePullRequest({
          repoPath: activeRepo,
          providerId: activePullRequest.providerId,
          owner: hostedRepo.owner,
          repo: hostedRepo.repo,
          pullRequestNumber: activePullRequest.number,
          title: activePullRequest.title,
          baseRef: activePullRequest.baseRef,
          headRef: activePullRequest.headRef,
          compareBaseRef,
          compareHeadRef,
        })
      : null;

  const keepCurrentReviewWhileLoading =
    !nextResolvedReview &&
    currentReview !== null &&
    currentReview.repoPath === activeRepo &&
    (loadingActivePullRequest || fetchingActivePullRequest);

  const resolvedReview =
    nextResolvedReview ?? (keepCurrentReviewWhileLoading ? currentReview : null);

  useEffect(() => {
    if (!nextResolvedReview) {
      return;
    }

    if (!reviewSessionMatchesPullRequest(currentReview, nextResolvedReview)) {
      dispatch(setCurrentPullRequestReview(nextResolvedReview));
    }
  }, [currentReview, dispatch, nextResolvedReview]);

  useEffect(() => {
    if (!compareRefs) {
      return;
    }

    if (reviewBaseRef !== compareRefs.compareBaseRef) {
      dispatch(setReviewBaseRef(compareRefs.compareBaseRef));
    }
    if (reviewHeadRef !== compareRefs.compareHeadRef) {
      dispatch(setReviewHeadRef(compareRefs.compareHeadRef));
    }
  }, [compareRefs, dispatch, reviewBaseRef, reviewHeadRef]);

  useEffect(() => {
    const waitingForActivePullRequest = loadingActivePullRequest || fetchingActivePullRequest;
    if (waitingForActivePullRequest) {
      return;
    }

    if (activePullRequest || hasActivePullRequestError) {
      return;
    }

    if (currentReview === null && reviewBaseRef === "" && reviewHeadRef === "") {
      return;
    }

    dispatch(clearCurrentPullRequestReview());
    dispatch(clearReviewSelection());
    if (reviewBaseRef !== "") {
      dispatch(setReviewBaseRef(""));
    }
    if (reviewHeadRef !== "") {
      dispatch(setReviewHeadRef(""));
    }
  }, [
    activePullRequest,
    currentReview,
    dispatch,
    fetchingActivePullRequest,
    hasActivePullRequestError,
    loadingActivePullRequest,
    reviewBaseRef,
    reviewHeadRef,
  ]);

  return {
    activeRepo,
    resolvedReview,
  };
}

export function PullRequestReviewPlaceholder({
  icon,
  title,
  description,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  const Icon = icon;

  return (
    <div className="flex h-full items-center justify-center px-6">
      <Empty className="max-w-[420px] border-0 bg-transparent">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Icon className="h-5 w-5" />
          </EmptyMedia>
          <EmptyTitle>{title}</EmptyTitle>
          <EmptyDescription>{description}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}

export function InactivePullRequestReviewPlaceholder() {
  return (
    <PullRequestReviewPlaceholder
      icon={GitPullRequest}
      title="Open a pull request from the list"
      description="Switch to a branch with an open pull request to see review files and conversation tabs automatically."
    />
  );
}
