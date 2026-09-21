import { ProjectMonogram } from "@/components/ui/project-monogram";
import type { Hotkey } from "@tanstack/hotkeys";
import { useLocation, useNavigate } from "react-router";
import { useHotkey } from "@tanstack/react-hotkeys";

const WORKSPACE_HOTKEYS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

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
  const locations = useAppSelector((state) => state.workspaces.locations);
  const activeByProject = useAppSelector((state) => state.workspaces.activeByProject);
  const activeWorkspaceId = useAppSelector(selectActiveWorkspaceId);
  const projects = workspaces.filter((item) => item.kind === "repo");
  const activeProject = workspaces.find((item) => item.id === activeWorkspaceId)?.repoPath ?? "";

  function cycle(direction: number) {
    const index = projects.findIndex((item) => item.repoPath === activeProject);
    const target = projects[(index + direction + projects.length) % projects.length];
    if (target) activate(target.id);
  }
  useHotkey(
    "Mod+W",
    () => {
      if (location.pathname === "/settings") {
        const active = workspaces.find((item) => item.id === activeWorkspaceId);
        if (active) navigate(locations[active.id] ?? workspacePath(active));
      } else if (workspaces.find((item) => item.id === activeWorkspaceId)?.kind === "pull-request")
        dispatch(closeWorkspace(activeWorkspaceId));
      else dispatch(closeProject(activeProject));
    },
    { enabled: workspaces.length > 0, ignoreInputs: false },
  );
  useHotkey("Mod+Shift+W", () => dispatch(closeProject(activeProject)), {
    enabled: Boolean(activeProject),
    ignoreInputs: false,
  });
  useHotkey("Mod+Shift+T", () => dispatch(reopenWorkspace()), { ignoreInputs: false });
  useHotkey("Control+Tab", () => cycle(1), { ignoreInputs: false });
  useHotkey("Control+Shift+Tab", () => cycle(-1), { ignoreInputs: false });

  function activate(id: string) {
    dispatch(projectActivated({ repoPath: id }));
    if (location.pathname === "/settings") {
      const workspace =
        workspaces.find((item) => item.id === activeByProject[id]) ??
        workspaces.find((item) => item.repoPath === id);
      if (workspace) navigate(locations[workspace.id] ?? workspacePath(workspace));
    }
  }
  function close(id: string) {
    dispatch(closeProject(id));
  }

  return (
    <>
      {WORKSPACE_HOTKEYS.map((number) => (
        <WorkspaceNumberHotkey
          key={number}
          number={number}
          onActivate={() => {
            const target = projects[number - 1];
            if (target) activate(target.id);
          }}
        />
      ))}
      <WorkspaceTabs
        className="min-w-0 flex-1 border-b-0 bg-transparent"
        ariaLabel="Open projects"
        overflowLabel="All open projects"
        addLabel="Open project (⌘O)"
        closeShortcut="⌘⇧W"
        items={projects.map((workspace) => {
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
        })}
        activeId={activeProject}
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
