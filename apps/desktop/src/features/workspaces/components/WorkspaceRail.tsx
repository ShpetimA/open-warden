import { useEffect } from "react";
import { clearFileViewerFocus } from "@/features/source-control/sourceControlSlice";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useSidebarPanelRegistryOptional } from "@/components/layout/SidebarPanelRegistry";
import {
  cancelPierreFileTreeFocus,
  requestPierreFileTreeFocus,
} from "@/features/source-control/pierreFileTreeNavigation";
import {
  BookOpen,
  ArrowLeftRight,
  FileDiff,
  FolderOpen,
  Files,
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
      icon: <FileDiff />,
      path: "/changes",
      isActive: (pathname) =>
        startsWith(pathname, "/changes") && !startsWith(pathname, "/changes/files"),
    },
    {
      key: "files",
      label: "Repository files",
      icon: <FolderOpen />,
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
      icon: <ArrowLeftRight />,
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
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const panels = useSidebarPanelRegistryOptional();
  const location = useLocation();
  const activeWorkspace = useAppSelector(selectActiveWorkspace);
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo);
  const { activeBranch } = useGetGitSnapshotQuery(activeRepo, {
    skip: !activeRepo,
    selectFromResult: ({ data }) => ({
      activeBranch: data?.branch?.trim() ?? "",
    }),
  });

  useEffect(() => {
    if (location.pathname !== "/changes/files") return;
    const frame = requestAnimationFrame(() => panels?.getSnapshot().get("primary")?.ref.expand());
    return () => cancelAnimationFrame(frame);
  }, [location.pathname, panels]);

  function openSection(path: string) {
    if (path === "/changes/files") {
      dispatch(clearFileViewerFocus());
      panels?.getSnapshot().get("primary")?.ref.expand();
      requestPierreFileTreeFocus("repo-files");
    } else {
      cancelPierreFileTreeFocus("repo-files");
    }
    navigate(path);
  }
  const hotkeyOptions = { enabled: Boolean(activeWorkspace), ignoreInputs: false };
  useHotkey("Mod+Shift+E", () => openSection("/changes/files"), hotkeyOptions);
  useHotkey("Mod+Shift+C", () => openSection("/changes"), hotkeyOptions);
  useHotkey("Mod+Shift+P", () => openSection("/pull-requests"), hotkeyOptions);
  useHotkey("Mod+Shift+H", () => openSection("/history"), hotkeyOptions);
  useHotkey("Mod+Shift+D", () => openSection("/review"), hotkeyOptions);

  const sectionShortcuts: Record<string, string> = {
    changes: "⌘⇧C",
    files: "⌘⇧E",
    "pull-requests": "⌘⇧P",
    history: "⌘⇧H",
    review: "⌘⇧D",
  };
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
          shortcut={sectionShortcuts[section.key]}
          isActive={section.isActive(location.pathname)}
          onClick={() => openSection(section.path)}
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
