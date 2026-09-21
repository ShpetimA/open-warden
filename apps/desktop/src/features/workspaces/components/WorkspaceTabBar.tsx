import { ProjectMonogram } from "@/components/ui/project-monogram";
import type { Hotkey } from "@tanstack/hotkeys";
import { useLocation, useNavigate } from "react-router";
import { useHotkey } from "@tanstack/react-hotkeys";

const WORKSPACE_HOTKEYS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { WorkspaceTabs } from "@/components/ui/workspace-tabs";
import { closeWorkspace, reopenWorkspace, selectWorkspace } from "@/features/workspaces/actions";
import {
  selectActiveWorkspaceId,
  selectWorkspaces,
  type Workspace,
} from "@/features/workspaces/workspacesSlice";
import { workspacePath } from "@/features/workspaces/workspaceRoutes";
import { repoLabel, repoParentPath } from "@/features/source-control/utils";

type WorkspaceTabBarProps = {
  onOpenWorkspaces?: () => void;
};

function workspaceTabFor(workspace: Workspace) {
  if (workspace.kind === "pull-request") {
    return {
      id: workspace.id,
      label: `#${workspace.pullRequestNumber} ${workspace.title}`.trim(),
      context: `${workspace.owner}/${workspace.repo}`,
      icon: <ProjectMonogram name={repoLabel(workspace.repoPath)} identity={workspace.repoPath} />,
      closable: true,
    };
  }

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
  const locations = useAppSelector((state) => state.workspaces.locations);
  const workspaces = useAppSelector(selectWorkspaces);
  const activeWorkspaceId = useAppSelector(selectActiveWorkspaceId);

  function cycle(direction: number) {
    const index = workspaces.findIndex((item) => item.id === activeWorkspaceId);
    const target = workspaces[(index + direction + workspaces.length) % workspaces.length];
    if (target) activate(target.id);
  }
  useHotkey(
    "Mod+W",
    () => {
      if (location.pathname === "/settings") activate(activeWorkspaceId);
      else close(activeWorkspaceId);
    },
    { enabled: workspaces.length > 0, ignoreInputs: false },
  );
  useHotkey("Mod+Shift+T", () => dispatch(reopenWorkspace()), { ignoreInputs: false });
  useHotkey("Control+Tab", () => cycle(1), { ignoreInputs: false });
  useHotkey("Control+Shift+Tab", () => cycle(-1), { ignoreInputs: false });

  function activate(id: string) {
    dispatch(selectWorkspace(id));
    const workspace = workspaces.find((item) => item.id === id);
    if (workspace) navigate(locations[id] ?? workspacePath(workspace));
  }

  function close(id: string) {
    dispatch(closeWorkspace(id));
  }

  return (
    <>
      {WORKSPACE_HOTKEYS.map((number) => (
        <WorkspaceNumberHotkey
          key={number}
          number={number}
          onActivate={() => {
            const target = workspaces[number - 1];
            if (target) activate(target.id);
          }}
        />
      ))}
      <WorkspaceTabs
        className="min-w-0 flex-1 border-b-0 bg-transparent"
        ariaLabel="Open workspaces"
        addLabel="Open project (⌘O)"
        items={workspaces.map((workspace) => {
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
        activeId={activeWorkspaceId}
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
