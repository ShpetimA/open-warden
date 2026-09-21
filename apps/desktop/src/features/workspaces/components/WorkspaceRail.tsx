import {
  Files,
  GitBranch,
  GitPullRequest,
  GitPullRequestArrow,
  History,
  ShieldCheck,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router";

import { openPullRequestWorkspace } from "../actions";
import SidebarTabButton from "@/components/ui/sidebar-tab";
import { SidebarPanelToggles } from "@/components/layout/SidebarPanelToggles";
import { useAppDispatch, useAppSelector } from "@/app/hooks";
import {
  useResolveActivePullRequestForBranchQuery,
  useResolveHostedRepoQuery,
} from "@/features/hosted-repos/api";
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
      label: "Compare refs",
      icon: <GitBranch />,
      path: "/review",
      isActive: (pathname) => startsWith(pathname, "/review"),
    },
  ];
}

function pullRequestRailSections(
  workspace: Workspace & { kind: "pull-request" },
  localReview: boolean,
): RailSection[] {
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
      path: base + (localReview ? "/local-files" : "/files"),
      isActive: (pathname) =>
        startsWith(pathname, `${base}/files`) || startsWith(pathname, `${base}/local-files`),
    },
    {
      key: "checks",
      label: "Checks",
      icon: <ShieldCheck />,
      path: base + (localReview ? "/local-checks" : "/checks"),
      isActive: (pathname) =>
        startsWith(pathname, `${base}/checks`) || startsWith(pathname, `${base}/local-checks`),
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
  const dispatch = useAppDispatch();
  const { hostedRepo } = useResolveHostedRepoQuery(activeRepo ?? "", {
    skip: !activeRepo,
    selectFromResult: ({ data }) => ({ hostedRepo: data }),
  });
  const { activePullRequest } = useResolveActivePullRequestForBranchQuery(
    { repoPath: activeRepo ?? "", branch: activeBranch },
    {
      skip: !activeRepo || !activeBranch,
      selectFromResult: ({ data }) => ({
        activePullRequest: data ?? null,
      }),
    },
  );

  if (!activePullRequest || !hostedRepo || !activeRepo) return null;
  return (
    <div className="border-border/70 mt-2 border-t pt-2">
      <SidebarTabButton
        icon={<GitPullRequest />}
        label={`Open branch PR #${activePullRequest.number}`}
        isActive={false}
        onClick={() => {
          void dispatch(
            openPullRequestWorkspace({
              repoPath: activeRepo,
              providerId: activePullRequest.providerId,
              owner: hostedRepo.owner,
              repo: hostedRepo.repo,
              pullRequestNumber: activePullRequest.number,
              title: activePullRequest.title,
            }),
          );
        }}
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

  const hasLocalReview = useAppSelector((state) => state.pullRequests.currentReview !== null);
  const sections = activeWorkspace
    ? activeWorkspace.kind === "repo"
      ? repoRailSections()
      : pullRequestRailSections(
          activeWorkspace,
          hasLocalReview || location.pathname.includes("/local-"),
        )
    : [];

  if (!activeWorkspace) return null;

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
