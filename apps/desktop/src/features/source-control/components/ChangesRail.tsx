import {
  Files,
  GitPullRequest,
  GitPullRequestArrow,
  MessagesSquare,
  ShieldCheck,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router";

import SidebarTabButton from "@/components/ui/sidebar-tab";
import { useAppSelector } from "@/app/hooks";
import { useResolveActivePullRequestForBranchQuery } from "@/features/hosted-repos/api";
import { useGetGitSnapshotQuery } from "@/features/source-control/api";

function isRoute(pathname: string, target: string) {
  return pathname === target || pathname.startsWith(`${target}/`);
}

function PullRequestRailTabs({ activeRepo, activeBranch }: { activeRepo: string; activeBranch: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const currentReview = useAppSelector((state) => state.pullRequests.currentReview);

  const { activePullRequest, loadingActivePullRequest, fetchingActivePullRequest } =
    useResolveActivePullRequestForBranchQuery(
      { repoPath: activeRepo, branch: activeBranch },
      {
        skip: !activeRepo || !activeBranch,
        selectFromResult: ({ data, isLoading, isFetching }) => ({
          activePullRequest: data ?? null,
          loadingActivePullRequest: isLoading,
          fetchingActivePullRequest: isFetching,
        }),
      },
    );

  const keepPullRequestTabsVisibleWhileLoading =
    currentReview !== null &&
    currentReview.repoPath === activeRepo &&
    (loadingActivePullRequest || fetchingActivePullRequest);
  const shouldShowPullRequestTabs = Boolean(activePullRequest) || keepPullRequestTabsVisibleWhileLoading;

  const isPullRequestFilesRoute = isRoute(location.pathname, "/changes/pull-request/files");
  const isPullRequestConversationRoute = isRoute(
    location.pathname,
    "/changes/pull-request/conversation",
  );
  const isPullRequestChecksRoute = isRoute(location.pathname, "/changes/pull-request/checks");

  if (!shouldShowPullRequestTabs) {
    return null;
  }

  return (
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
  );
}

export function ChangesRail() {
  const navigate = useNavigate();
  const location = useLocation();
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo);
  const { activeBranch } = useGetGitSnapshotQuery(activeRepo, {
    skip: !activeRepo,
    selectFromResult: ({ data }) => ({
      activeBranch: data?.branch?.trim() ?? "",
    }),
  });

  const isRepoFilesRoute = isRoute(location.pathname, "/changes/files");
  const isPullRequestRoute = isRoute(location.pathname, "/changes/pull-request");
  const isChangesRoute = !isRepoFilesRoute && !isPullRequestRoute;

  return (
    <aside className="bg-surface-toolbar border-border/70 flex h-full min-h-0 w-12 shrink-0 flex-col items-center gap-1 border-r px-2 py-2">
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

      <PullRequestRailTabs activeRepo={activeRepo} activeBranch={activeBranch} />
    </aside>
  );
}
