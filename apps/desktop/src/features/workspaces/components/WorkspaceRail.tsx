import {
  BookOpen,
  Files,
  GitBranch,
  GitPullRequest,
  GitPullRequestArrow,
  History,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router";

import { BranchPullRequestButton } from "./BranchPullRequestButton";
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

export function repoRailSections(): RailSection[] {
  return [
    {
      key: "changes",
      label: "Changes",
      icon: <GitPullRequestArrow />,
      path: "/changes",
      isActive: (pathname) =>
        startsWith(pathname, "/changes") && !startsWith(pathname, "/changes/files"),
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

export function pullRequestRailSections(
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
      key: "guidance",
      label: "Guidance",
      icon: <BookOpen />,
      path: base + "/guidance",
      isActive: (pathname) => startsWith(pathname, `${base}/guidance`),
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
      <BranchPullRequestButton
        branch={activeBranch}
        number={activePullRequest.number}
        title={activePullRequest.title}
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

  const sections = activeWorkspace ? repoRailSections() : [];

  if (!activeWorkspace) return null;

  return (
    <aside
      aria-label="Workspace sections"
      className="bg-surface-toolbar border-border/70 flex h-full min-h-0 w-14 shrink-0 flex-col items-center gap-1 border-r px-1.5 py-2"
    >
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
