import {
  Files,
  GitPullRequest,
  GitPullRequestArrow,
  MessagesSquare,
  ShieldCheck,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router";

import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { useResolvePullRequestWorkspaceQuery } from "@/features/hosted-repos/api";
import { PullRequestFilesTab } from "@/features/pull-requests/components/PullRequestFilesTab";
import {
  createPullRequestReviewSession,
  setCurrentPullRequestReview,
  setPullRequestFilesViewMode,
} from "@/features/pull-requests/pullRequestsSlice";
import { refreshActiveRepo } from "@/features/source-control/actions";
import {
  clearReviewSelection,
  setReviewBaseRef,
  setReviewHeadRef,
} from "@/features/source-control/sourceControlSlice";

import CurrentRepositoryHeader from "@/features/source-control/components/CurrentRepoHeader";
import { ChangesTab } from "./ChangesTab";
import { RepoFilesTab } from "./RepoFilesTab";

type ChangesSidebarProps = {
  activeBranch?: string;
};

function isRoute(pathname: string, target: string) {
  return pathname === target || pathname.startsWith(`${target}/`);
}

export function ChangesSidebar({ activeBranch }: ChangesSidebarProps) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo);
  const runningAction = useAppSelector((state) => state.sourceControl.runningAction);
  const reviewBaseRef = useAppSelector((state) => state.sourceControl.reviewBaseRef);
  const reviewHeadRef = useAppSelector((state) => state.sourceControl.reviewHeadRef);

  const { data: pullRequestWorkspace } = useResolvePullRequestWorkspaceQuery(activeRepo || "", {
    skip: !activeRepo,
    selectFromResult: ({ data }) => ({ data }),
  });

  const isRepoFilesRoute = isRoute(location.pathname, "/changes/files");
  const isPullRequestFilesRoute = isRoute(location.pathname, "/changes/pull-request/files");
  const isPullRequestConversationRoute = isRoute(
    location.pathname,
    "/changes/pull-request/conversation",
  );
  const isPullRequestChecksRoute = isRoute(location.pathname, "/changes/pull-request/checks");
  const isPullRequestRoute = isRoute(location.pathname, "/changes/pull-request");
  const isChangesRoute = !isRepoFilesRoute && !isPullRequestRoute;

  const openPullRequestReview = (view: "files" | "conversation" | "checks") => {
    if (!pullRequestWorkspace) {
      return;
    }

    dispatch(clearReviewSelection());
    dispatch(setReviewBaseRef(pullRequestWorkspace.compareBaseRef));
    dispatch(setReviewHeadRef(pullRequestWorkspace.compareHeadRef));
    dispatch(setCurrentPullRequestReview(createPullRequestReviewSession(pullRequestWorkspace)));

    if (view === "files") {
      dispatch(setPullRequestFilesViewMode("review"));
    }

    navigate(`/changes/pull-request/${view}`);
  };

  return (
    <aside className="bg-surface-toolbar border-border/70 flex h-full min-h-0 overflow-hidden overflow-x-hidden border-r">
      <div className="border-border/70 flex w-12 shrink-0 flex-col items-center gap-1 border-r px-2 py-2">
        <button
          type="button"
          className={`inline-flex h-8 w-8 items-center justify-center rounded-md ${
            isChangesRoute
              ? "bg-secondary text-secondary-foreground"
              : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
          }`}
          aria-label="Source control view"
          title="Source control view"
          onClick={() => {
            navigate("/changes");
          }}
        >
          <GitPullRequestArrow className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={`inline-flex h-8 w-8 items-center justify-center rounded-md ${
            isRepoFilesRoute
              ? "bg-secondary text-secondary-foreground"
              : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
          }`}
          aria-label="Repository files view"
          title="Repository files view"
          onClick={() => {
            navigate("/changes/files");
          }}
        >
          <Files className="h-4 w-4" />
        </button>

        {pullRequestWorkspace ? (
          <div className="border-border/70 mt-2 flex flex-col gap-1 border-t pt-2">
            <button
              type="button"
              className={`inline-flex h-8 w-8 items-center justify-center rounded-md ${
                isPullRequestFilesRoute
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
              }`}
              aria-label="Open PR review"
              title="Open PR review"
              onClick={() => {
                openPullRequestReview("files");
              }}
            >
              <GitPullRequest className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={`inline-flex h-8 w-8 items-center justify-center rounded-md ${
                isPullRequestConversationRoute
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
              }`}
              aria-label="Open PR comments"
              title="Open PR comments"
              onClick={() => {
                openPullRequestReview("conversation");
              }}
            >
              <MessagesSquare className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={`inline-flex h-8 w-8 items-center justify-center rounded-md ${
                isPullRequestChecksRoute
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
              }`}
              aria-label="Open PR actions"
              title="Open PR actions"
              onClick={() => {
                openPullRequestReview("checks");
              }}
            >
              <ShieldCheck className="h-4 w-4" />
            </button>
          </div>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <CurrentRepositoryHeader
          activeRepo={activeRepo}
          activeBranch={activeBranch}
          runningAction={runningAction}
          onRefresh={() => {
            void dispatch(refreshActiveRepo());
          }}
        />

        {isPullRequestRoute ? (
          <PullRequestFilesTab
            activeRepo={activeRepo}
            reviewBaseRef={reviewBaseRef}
            reviewHeadRef={reviewHeadRef}
          />
        ) : isRepoFilesRoute ? (
          <RepoFilesTab />
        ) : (
          <ChangesTab />
        )}
      </div>
    </aside>
  );
}
