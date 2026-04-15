import {
  Files,
  GitPullRequest,
  GitPullRequestArrow,
  MessagesSquare,
  ShieldCheck,
} from "lucide-react";

import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { useResolvePullRequestWorkspaceQuery } from "@/features/hosted-repos/api";
import { PullRequestFilesTab } from "@/features/pull-requests/components/PullRequestFilesTab";
import {
  createPullRequestReviewSession,
  setCurrentPullRequestReview,
  setPullRequestReviewTab,
} from "@/features/pull-requests/pullRequestsSlice";
import { refreshActiveRepo } from "@/features/source-control/actions";
import {
  clearReviewSelection,
  setChangesSidebarMode,
  setReviewBaseRef,
  setReviewHeadRef,
} from "@/features/source-control/sourceControlSlice";

import { ChangesTab } from "./ChangesTab";
import { RepoFilesTab } from "./RepoFilesTab";
import CurrentRepositoryHeader from "@/features/source-control/components/CurrentRepoHeader";


type ChangesSidebarProps = {
  activeBranch?: string;
};

export function ChangesSidebar({ activeBranch }: ChangesSidebarProps) {
  const dispatch = useAppDispatch();
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo);
  const changesSidebarMode = useAppSelector((state) => state.sourceControl.changesSidebarMode);
  const runningAction = useAppSelector((state) => state.sourceControl.runningAction);
  const activeReviewTab = useAppSelector((state) => state.pullRequests.activeReviewTab);
  const reviewBaseRef = useAppSelector((state) => state.sourceControl.reviewBaseRef);
  const reviewHeadRef = useAppSelector((state) => state.sourceControl.reviewHeadRef);

  const { data: pullRequestWorkspace } = useResolvePullRequestWorkspaceQuery(activeRepo || "", {
    skip: !activeRepo,
    selectFromResult: ({ data }) => ({ data }),
  });

  const openPullRequestReview = (tab: "files" | "conversation" | "checks") => {
    if (!pullRequestWorkspace) return;

    dispatch(clearReviewSelection());
    dispatch(setReviewBaseRef(pullRequestWorkspace.compareBaseRef));
    dispatch(setReviewHeadRef(pullRequestWorkspace.compareHeadRef));
    dispatch(setCurrentPullRequestReview(createPullRequestReviewSession(pullRequestWorkspace)));
    dispatch(setChangesSidebarMode("pull-request"));
    dispatch(setPullRequestReviewTab(tab));
  };

  return (
    <aside className="bg-surface-toolbar border-border/70 flex h-full min-h-0 overflow-hidden overflow-x-hidden border-r">
      <div className="border-border/70 flex w-12 shrink-0 flex-col items-center gap-1 border-r px-2 py-2">
        <button
          type="button"
          className={`inline-flex h-8 w-8 items-center justify-center rounded-md ${
            changesSidebarMode === "changes"
              ? "bg-secondary text-secondary-foreground"
              : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
          }`}
          aria-label="Source control view"
          title="Source control view"
          onClick={() => {
            dispatch(setChangesSidebarMode("changes"));
          }}
        >
          <GitPullRequestArrow className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={`inline-flex h-8 w-8 items-center justify-center rounded-md ${
            changesSidebarMode === "files"
              ? "bg-secondary text-secondary-foreground"
              : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
          }`}
          aria-label="Repository files view"
          title="Repository files view"
          onClick={() => {
            dispatch(setChangesSidebarMode("files"));
          }}
        >
          <Files className="h-4 w-4" />
        </button>

        {pullRequestWorkspace ? (
          <div className="border-border/70 mt-2 flex flex-col gap-1 border-t pt-2">
            <button
              type="button"
              className={`inline-flex h-8 w-8 items-center justify-center rounded-md ${
                changesSidebarMode === "pull-request" && activeReviewTab === "files"
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
                changesSidebarMode === "pull-request" && activeReviewTab === "conversation"
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
                changesSidebarMode === "pull-request" && activeReviewTab === "checks"
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

        {changesSidebarMode === "pull-request" ? (
          <PullRequestFilesTab
            activeRepo={activeRepo}
            reviewBaseRef={reviewBaseRef}
            reviewHeadRef={reviewHeadRef}
          />
        ) : changesSidebarMode === "files" ? (
          <RepoFilesTab />
        ) : (
          <ChangesTab />
        )}
      </div>
    </aside>
  );
}

