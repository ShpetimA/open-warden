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

import CurrentRepositoryHeader from "@/features/source-control/components/CurrentRepoHeader";
import { ChangesTab } from "./ChangesTab";
import { RepoFilesTab } from "./RepoFilesTab";
import SidebarTabButton from "@/components/ui/sidebar-tab";
import { refreshActiveRepo } from "@/features/source-control/actions";

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

  return (
    <aside className="bg-surface-toolbar border-border/70 flex h-full min-h-0 overflow-hidden overflow-x-hidden border-r">
      <div className="border-border/70 flex w-12 shrink-0 flex-col items-center gap-1 border-r px-2 py-2">
        <SidebarTabButton
          icon={<GitPullRequestArrow className="h-4 w-4" />}
          isActive={isChangesRoute}
          onClick={() => navigate("/changes")}
        />
        <SidebarTabButton
          icon={<Files className="h-4 w-4" />}
          isActive={isRepoFilesRoute}
          onClick={() => navigate("/changes/files")}
        />

        {pullRequestWorkspace ? (
          <div className="border-border/70 mt-2 flex flex-col gap-1 border-t pt-2">
            <SidebarTabButton
              icon={<GitPullRequest className="h-4 w-4" />}
              isActive={isPullRequestFilesRoute}
              onClick={() => navigate("/changes/pull-request/files")}
            />
            <SidebarTabButton
              icon={<MessagesSquare className="h-4 w-4" />}
              isActive={isPullRequestConversationRoute}
              onClick={() => navigate("/changes/pull-request/conversation")}
            />
            <SidebarTabButton
              icon={<ShieldCheck className="h-4 w-4" />}
              isActive={isPullRequestChecksRoute}
              onClick={() => navigate("/changes/pull-request/checks")}
            />
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
