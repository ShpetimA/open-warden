import { FolderGit2 } from "lucide-react";
import { ProjectMonogram } from "@/components/ui/project-monogram";
import type { Hotkey } from "@tanstack/hotkeys";
import { useLocation, useNavigate } from "react-router";
import { useHotkey } from "@tanstack/react-hotkeys";

import { repositorySetupPath, setupClosed } from "@/features/repository-setup/repositorySetupSlice";
import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { WorkspaceTabs } from "@/components/ui/workspace-tabs";
import { closeProject, closeWorkspace, reopenWorkspace } from "@/features/workspaces/actions";
import {
  selectActiveWorkspaceId,
  projectActivated,
  selectWorkspaces,
  type Workspace,
} from "@/features/workspaces/workspacesSlice";
import { workspacePath } from "@/features/workspaces/workspaceRoutes";
import { repoLabel, repoParentPath } from "@/features/source-control/utils";

const WORKSPACE_HOTKEYS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

type WorkspaceTabBarProps = {
  onOpenWorkspaces?: () => void;
};

function workspaceTabFor(workspace: Workspace) {
  return {
    id: workspace.id,
    label: repoLabel(workspace.repoPath),
    context: repoParentPath(workspace.repoPath),
    icon: <ProjectMonogram name={repoLabel(workspace.repoPath)} identity={workspace.repoPath} />,
    closable: true,
  };
}

export function WorkspaceTabBar({ onOpenWorkspaces }: WorkspaceTabBarProps) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();

  const workspaces = useAppSelector(selectWorkspaces);
  const setupItems = useAppSelector((state) => state.repositorySetup.items);
  const setups = setupItems.filter((item) => item.visible);
  const setupUrl =
    location.pathname === "/repository-setup"
      ? new URLSearchParams(location.search).get("url")
      : null;
  const locations = useAppSelector((state) => state.workspaces.locations);
  const activeByProject = useAppSelector((state) => state.workspaces.activeByProject);
  const activeWorkspaceId = useAppSelector(selectActiveWorkspaceId);
  const projects = workspaces.filter((item) => item.kind === "repo");
  const activeProject = workspaces.find((item) => item.id === activeWorkspaceId)?.repoPath ?? "";

  const tabIds = [...projects.map((item) => item.id), ...setups.map((item) => item.link.url)];
  function cycle(direction: number) {
    const index = tabIds.indexOf(setupUrl ?? activeProject);
    const target = tabIds[(index + direction + tabIds.length) % tabIds.length];
    if (target) activate(target);
  }
  useHotkey(
    "Mod+W",
    () => {
      if (setupUrl) close(setupUrl);
      else if (location.pathname === "/settings") {
        const active = workspaces.find((item) => item.id === activeWorkspaceId);
        if (active) navigate(locations[active.id] ?? workspacePath(active));
      } else if (workspaces.find((item) => item.id === activeWorkspaceId)?.kind === "pull-request")
        dispatch(closeWorkspace(activeWorkspaceId));
      else dispatch(closeProject(activeProject));
    },
    { enabled: tabIds.length > 0, ignoreInputs: false },
  );
  useHotkey("Mod+Shift+W", () => close(setupUrl ?? activeProject), {
    enabled: Boolean(setupUrl ?? activeProject),
    ignoreInputs: false,
  });
  useHotkey("Mod+Shift+T", () => dispatch(reopenWorkspace()), { ignoreInputs: false });
  useHotkey("Control+Tab", () => cycle(1), { ignoreInputs: false });
  useHotkey("Control+Shift+Tab", () => cycle(-1), { ignoreInputs: false });

  function activate(id: string) {
    if (setups.some((item) => item.link.url === id)) {
      navigate(repositorySetupPath(id));
      return;
    }
    dispatch(projectActivated({ repoPath: id }));
    if (location.pathname === "/settings" || setupUrl) {
      const workspace =
        workspaces.find((item) => item.id === activeByProject[id]) ??
        workspaces.find((item) => item.repoPath === id);
      if (workspace) navigate(locations[workspace.id] ?? workspacePath(workspace));
    }
  }
  function close(id: string) {
    if (setups.some((item) => item.link.url === id)) {
      dispatch(setupClosed(id));
      if (setupUrl === id) {
        const active = workspaces.find((item) => item.id === activeWorkspaceId);
        navigate(active ? (locations[active.id] ?? workspacePath(active)) : "/changes");
      }
      return;
    }
    dispatch(closeProject(id));
  }

  return (
    <>
      {WORKSPACE_HOTKEYS.map((number) => (
        <WorkspaceNumberHotkey
          key={number}
          number={number}
          onActivate={() => {
            const target = number === 9 ? tabIds.at(-1) : tabIds[number - 1];
            if (target) activate(target);
          }}
        />
      ))}
      <WorkspaceTabs
        className="min-w-0 flex-1 border-b-0 bg-transparent"
        ariaLabel="Open projects"
        overflowLabel="All open projects"
        addLabel="New project tab (⌘T)"
        closeShortcut="⌘⇧W"
        items={[
          ...projects.map((workspace) => {
            const tab = workspaceTabFor(workspace);
            const duplicate =
              workspace.kind === "repo" &&
              workspaces.some(
                (other) =>
                  other.id !== workspace.id &&
                  other.kind === "repo" &&
                  repoLabel(other.repoPath) === tab.label,
              );
            if (duplicate)
              tab.label = `${tab.label} · ${repoLabel(repoParentPath(workspace.repoPath))}`;
            return tab;
          }),
          ...setups.map((setup) => ({
            id: setup.link.url,
            label: `${setup.link.repo} · #${setup.link.pullRequestNumber}`,
            context:
              setup.progress.stage === "error"
                ? "Setup failed"
                : setup.progress.stage === "ready"
                  ? "Ready to open"
                  : "Setting up repository…",
            icon: <FolderGit2 />,
            closable: true,
          })),
        ]}
        activeId={setupUrl ?? activeProject}
        onActivate={activate}
        onClose={close}
        onAdd={onOpenWorkspaces}
      />
    </>
  );
}

function WorkspaceNumberHotkey({ number, onActivate }: { number: number; onActivate: () => void }) {
  useHotkey(`Mod+${number}` as Hotkey, onActivate, { preventDefault: true, ignoreInputs: false });
  return null;
}
