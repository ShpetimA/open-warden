import { useEffect, type ReactNode, type ComponentType } from "react";
import { GitPullRequest } from "lucide-react";
import { useNavigate, useParams } from "react-router";

import { useAppDispatch, useAppSelector } from "@/app/hooks";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { useResolvePullRequestWorkspaceQuery } from "@/features/hosted-repos/api";
import type { PullRequestReviewSession } from "@/features/pull-requests/pullRequestsSlice";
import { clearCurrentPullRequestReview, setCurrentPullRequestReview } from "@/features/pull-requests/pullRequestsSlice";
import { useGetGitSnapshotQuery } from "@/features/source-control/api";
import {
  clearReviewSelection,
  setReviewBaseRef,
  setReviewHeadRef,
} from "@/features/source-control/sourceControlSlice";
import type { PreparedPullRequestWorkspace } from "@/platform/desktop";

function createReviewSessionFromWorkspace(workspace: PreparedPullRequestWorkspace): PullRequestReviewSession {
  return {
    providerId: workspace.providerId,
    owner: workspace.owner,
    repo: workspace.repo,
    pullRequestNumber: workspace.pullRequestNumber,
    title: workspace.title,
    baseRef: workspace.baseRef,
    headRef: workspace.headRef,
    compareBaseRef: workspace.compareBaseRef,
    compareHeadRef: workspace.compareHeadRef,
    repoPath: workspace.repoPath,
    worktreePath: workspace.worktreePath,
  };
}

function reviewSessionMatchesWorkspace(
  review: PullRequestReviewSession | null,
  workspace: PreparedPullRequestWorkspace,
) {
  if (!review) return false;

  return (
    review.providerId === workspace.providerId &&
    review.owner === workspace.owner &&
    review.repo === workspace.repo &&
    review.pullRequestNumber === workspace.pullRequestNumber &&
    review.title === workspace.title &&
    review.baseRef === workspace.baseRef &&
    review.headRef === workspace.headRef &&
    review.compareBaseRef === workspace.compareBaseRef &&
    review.compareHeadRef === workspace.compareHeadRef &&
    review.repoPath === workspace.repoPath &&
    review.worktreePath === workspace.worktreePath
  );
}

export function usePullRequestReviewSession() {
  const navigate = useNavigate();
  const { providerId, owner, repo, pullRequestNumber } = useParams();
  const dispatch = useAppDispatch();

  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo);
  const currentReview = useAppSelector((state) => state.pullRequests.currentReview);

  const { data: pullRequestWorkspace } = useResolvePullRequestWorkspaceQuery(activeRepo || "", {
    skip: !activeRepo,
    selectFromResult: ({ data }) => ({ data }),
  });
  const { data: snapshot } = useGetGitSnapshotQuery(activeRepo || "", {
    skip: !activeRepo,
    selectFromResult: ({ data }) => ({ data }),
  });

  const hasRouteParams = Boolean(providerId && owner && repo && pullRequestNumber);
  const matchesCurrentReview =
    hasRouteParams &&
    currentReview !== null &&
    currentReview.providerId === providerId &&
    currentReview.owner === owner &&
    currentReview.repo === repo &&
    String(currentReview.pullRequestNumber) === pullRequestNumber;
  const workspaceMatchesActiveBranch =
    !pullRequestWorkspace || !snapshot ? true : snapshot.branch === pullRequestWorkspace.localBranch;
  const workspaceReview =
    pullRequestWorkspace &&
    workspaceMatchesActiveBranch &&
    (!hasRouteParams ||
      (pullRequestWorkspace.providerId === providerId &&
        pullRequestWorkspace.owner === owner &&
        pullRequestWorkspace.repo === repo &&
        String(pullRequestWorkspace.pullRequestNumber) === pullRequestNumber))
      ? createReviewSessionFromWorkspace(pullRequestWorkspace)
      : null;
  const allowCurrentReviewFallback = workspaceMatchesActiveBranch || !pullRequestWorkspace;
  const resolvedReview = matchesCurrentReview
    ? currentReview
    : (workspaceReview ?? (allowCurrentReviewFallback ? currentReview : null));

  useEffect(() => {
    if (hasRouteParams && !matchesCurrentReview) {
      dispatch(clearReviewSelection());
    }
  }, [dispatch, hasRouteParams, matchesCurrentReview]);

  useEffect(() => {
    if (!pullRequestWorkspace || !snapshot) {
      return;
    }

    if (snapshot.branch === pullRequestWorkspace.localBranch) {
      return;
    }

    navigate("/changes", { replace: true });
    dispatch(clearCurrentPullRequestReview());
    dispatch(clearReviewSelection());
    dispatch(setReviewBaseRef(""));
    dispatch(setReviewHeadRef(""));
  }, [dispatch, navigate, pullRequestWorkspace, snapshot]);

  useEffect(() => {
    if (!pullRequestWorkspace) {
      return;
    }

    const workspaceMatchesRoute =
      !hasRouteParams ||
      (pullRequestWorkspace.providerId === providerId &&
        pullRequestWorkspace.owner === owner &&
        pullRequestWorkspace.repo === repo &&
        String(pullRequestWorkspace.pullRequestNumber) === pullRequestNumber);
    if (!workspaceMatchesRoute) {
      return;
    }

    const nextReview = createReviewSessionFromWorkspace(pullRequestWorkspace);
    if (!reviewSessionMatchesWorkspace(currentReview, pullRequestWorkspace)) {
      dispatch(setCurrentPullRequestReview(nextReview));
    }

    if (currentReview?.compareBaseRef !== pullRequestWorkspace.compareBaseRef) {
      dispatch(setReviewBaseRef(pullRequestWorkspace.compareBaseRef));
    }
    if (currentReview?.compareHeadRef !== pullRequestWorkspace.compareHeadRef) {
      dispatch(setReviewHeadRef(pullRequestWorkspace.compareHeadRef));
    }
  }, [
    currentReview,
    dispatch,
    hasRouteParams,
    owner,
    providerId,
    pullRequestNumber,
    pullRequestWorkspace,
    repo,
  ]);

  return {
    activeRepo,
    resolvedReview,
  };
}

export function PullRequestReviewFrame({
  review,
  children,
}: {
  review: PullRequestReviewSession;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-border/70 bg-surface-toolbar border-b px-6 py-4">
        <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4">
          <div className="min-w-0">
            <div className="text-muted-foreground text-[11px] font-semibold tracking-[0.14em] uppercase">
              Pull Request Review
            </div>
            <div className="mt-1 truncate text-[24px] font-semibold tracking-[-0.03em]">
              #{review.pullRequestNumber} {review.title}
            </div>
            <div className="text-muted-foreground mt-1 text-sm">
              {review.owner}/{review.repo}
            </div>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
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
      description="This review session is not active anymore. Go back to Pull Requests and reopen the PR to restore its local workspace."
    />
  );
}
