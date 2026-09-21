import {
  Files,
  GitBranch,
  GitPullRequest,
  GitPullRequestArrow,
  History,
  ShieldCheck,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router";

import SidebarTabButton from "@/components/ui/sidebar-tab";
import { SidebarPanelToggles } from "@/components/layout/SidebarPanelToggles";
import { useAppSelector } from "@/app/hooks";
import { useResolveActivePullRequestForBranchQuery } from "@/features/hosted-repos/api";
import { useGetGitSnapshotQuery } from "@/features/source-control/api";
import { selectActiveWorkspace, type Workspace } from "@/features/workspaces/workspacesSlice";

type RailSection = {
  key: string;
  label: string;
  icon: React.ReactNode;
  path: string;
  isActive: (pathname: string) => boolean;
};

function startsWith(pathname: string, base: string) {
  return pathname === base || pathname.startsWith(`${base}/`);
}

function repoRailSections(): RailSection[] {
  return [
    {
      key: "changes",
      label: "Changes",
      icon: <GitPullRequestArrow />,
      path: "/changes",
      isActive: (pathname) =>
        startsWith(pathname, "/changes") &&
        !startsWith(pathname, "/changes/files") &&
        !startsWith(pathname, "/changes/pull-request"),
    },
    {
      key: "files",
      label: "Repository files",
      icon: <Files />,
      path: "/changes/files",
      isActive: (pathname) => startsWith(pathname, "/changes/files"),
    },
    {
      key: "pull-requests",
      label: "Pull Requests",
      icon: <GitPullRequest />,
      path: "/pull-requests",
      isActive: (pathname) => pathname.startsWith("/pull-requests"),
    },
    {
      key: "history",
      label: "History",
      icon: <History />,
      path: "/history",
      isActive: (pathname) => startsWith(pathname, "/history"),
    },
    {
      key: "review",
      label: "Review",
      icon: <GitBranch />,
      path: "/review",
      isActive: (pathname) => startsWith(pathname, "/review"),
    },
  ];
}

function pullRequestRailSections(workspace: Workspace & { kind: "pull-request" }): RailSection[] {
  const base = `/pull-requests/${workspace.providerId}/${workspace.owner}/${workspace.repo}/${workspace.pullRequestNumber}`;

  return [
    {
      key: "overview",
      label: "Overview",
      icon: <GitPullRequestArrow />,
      path: base + "/overview",
      isActive: (pathname) => startsWith(pathname, `${base}/overview`) || pathname === base,
    },
    {
      key: "files",
      label: "Files",
      icon: <Files />,
      path: base + "/files",
      isActive: (pathname) => startsWith(pathname, `${base}/files`),
    },
    {
      key: "checks",
      label: "Checks",
      icon: <ShieldCheck />,
      path: base + "/checks",
      isActive: (pathname) => startsWith(pathname, `${base}/checks`),
    },
  ];
}

function ActivePullRequestSegments({
  activeRepo,
  activeBranch,
}: {
  activeRepo?: string;
  activeBranch: string;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const currentReview = useAppSelector((state) => state.pullRequests.currentReview);

  const { activePullRequest, loadingActivePullRequest, fetchingActivePullRequest } =
    useResolveActivePullRequestForBranchQuery(
      { repoPath: activeRepo ?? "", branch: activeBranch },
      {
        skip: !activeRepo || !activeBranch,
        selectFromResult: ({ data, isLoading, isFetching }) => ({
          activePullRequest: data ?? null,
          loadingActivePullRequest: isLoading,
          fetchingActivePullRequest: isFetching,
        }),
      },
    );

  const keepSegmentVisibleWhileLoading =
    currentReview !== null &&
    currentReview.repoPath === activeRepo &&
    (loadingActivePullRequest || fetchingActivePullRequest);
  const shouldShowSegment = Boolean(activePullRequest) || keepSegmentVisibleWhileLoading;

  if (!shouldShowSegment) {
    return null;
  }

  return (
    <div className="border-border/70 mt-2 flex flex-col gap-1 border-t pt-2">
      <SidebarTabButton
        icon={<GitPullRequest />}
        label="Pull request files"
        isActive={location.pathname.startsWith("/changes/pull-request/files")}
        onClick={() => navigate("/changes/pull-request/files")}
      />
      <SidebarTabButton
        icon={<ShieldCheck />}
        label="Pull request checks"
        isActive={location.pathname.startsWith("/changes/pull-request/checks")}
        onClick={() => navigate("/changes/pull-request/checks")}
      />
    </div>
  );
}

export function WorkspaceRail() {
  const navigate = useNavigate();
  const location = useLocation();
  const activeWorkspace = useAppSelector(selectActiveWorkspace);
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo);
  const { activeBranch } = useGetGitSnapshotQuery(activeRepo, {
    skip: !activeRepo,
    selectFromResult: ({ data }) => ({
      activeBranch: data?.branch?.trim() ?? "",
    }),
  });

  const sections = activeWorkspace
    ? activeWorkspace.kind === "repo"
      ? repoRailSections()
      : pullRequestRailSections(activeWorkspace)
    : [];

  return (
    <aside className="bg-surface-toolbar border-border/70 flex h-full min-h-0 w-12 shrink-0 flex-col items-center gap-1 border-r px-2 py-2">
      {sections.map((section) => (
        <SidebarTabButton
          key={section.key}
          icon={section.icon}
          label={section.label}
          isActive={section.isActive(location.pathname)}
          onClick={() => navigate(section.path)}
        />
      ))}

      {activeWorkspace?.kind === "repo" ? (
        <ActivePullRequestSegments
          activeRepo={activeWorkspace.repoPath}
          activeBranch={activeBranch}
        />
      ) : null}

      <div className="mt-auto w-full">
        <SidebarPanelToggles />
      </div>
    </aside>
  );
}
