import type { FeatureKey } from "@/app/featureNavigation";
import {
  Files,
  GitBranch,
  GitPullRequest,
  GitPullRequestArrow,
  MessagesSquare,
  RefreshCw,
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
  setChangesSidebarMode,
  setHistoryNavTarget,
  clearReviewSelection,
  setReviewBaseRef,
  setReviewHeadRef,
} from "@/features/source-control/sourceControlSlice";
import { repoLabel } from "@/features/source-control/utils";
import { OpenInExternalEditor } from "./OpenInExternalEditor";
import { ChangesTab } from "./ChangesTab";
import { HistoryTab } from "./HistoryTab";
import { RepoFilesTab } from "./RepoFilesTab";

type SourceControlSidebarProps = {
  feature: Extract<FeatureKey, "changes" | "history">;
  activeBranch?: string;
};

export function SourceControlSidebar({ feature, activeBranch }: SourceControlSidebarProps) {
  const dispatch = useAppDispatch();
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo);
  const changesSidebarMode = useAppSelector((state) => state.sourceControl.changesSidebarMode);
  const runningAction = useAppSelector((state) => state.sourceControl.runningAction);
  const activeReviewTab = useAppSelector((state) => state.pullRequests.activeReviewTab);
  const isHistoryFeature = feature === "history";
  const reviewBaseRef = useAppSelector((state) => state.sourceControl.reviewBaseRef);
  const reviewHeadRef = useAppSelector((state) => state.sourceControl.reviewHeadRef);
  const { data: pullRequestWorkspace } = useResolvePullRequestWorkspaceQuery(activeRepo || "", {
    skip: !activeRepo || feature !== "changes",
    selectFromResult: ({ data }) => ({ data }),
  });
  const branchLabel = activeBranch || "Detached HEAD";
  const showChangesRail = feature === "changes";

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
    <aside
      onMouseDown={() => {
        if (isHistoryFeature) {
          dispatch(setHistoryNavTarget("commits"));
        }
      }}
      className="bg-surface-toolbar border-border/70 flex h-full min-h-0 overflow-hidden overflow-x-hidden border-r"
    >
      {showChangesRail ? (
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
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="border-border border-b px-3 py-1.5">
          <div className="flex items-center gap-2">
            <div className="text-foreground/80 text-[11px] font-semibold tracking-[0.14em]">
              CURRENT REPOSITORY
            </div>
            <div className="ml-auto flex items-center gap-0.5">
              <OpenInExternalEditor
                repoPath={activeRepo}
                target="repository"
                compact
                disabled={!!runningAction}
              />
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground inline-flex h-6 w-6 items-center justify-center"
                title="Refresh repository status"
                aria-label="Refresh repository status"
                disabled={!activeRepo || !!runningAction}
                onClick={() => {
                  void dispatch(refreshActiveRepo());
                }}
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <div className="text-muted-foreground mt-0.5 flex min-w-0 items-center gap-1 text-xs">
            <span className="truncate">
              {activeRepo ? repoLabel(activeRepo) : "No repo selected"}
            </span>
            {activeRepo ? (
              <>
                <span aria-hidden>·</span>
                <GitBranch className="h-3 w-3 shrink-0" />
                <span className="truncate">{branchLabel}</span>
              </>
            ) : null}
          </div>
        </div>

        {isHistoryFeature ? (
          <HistoryTab />
        ) : changesSidebarMode === "pull-request" ? (
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
