import { Folder, GitPullRequest } from "lucide-react";
import type { Hotkey } from "@tanstack/hotkeys";
import { useNavigate } from "react-router";
import { useHotkey } from "@tanstack/react-hotkeys";

const WORKSPACE_HOTKEYS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { WorkspaceTabs } from "@/components/ui/workspace-tabs";
import { closeWorkspace, selectWorkspace } from "@/features/workspaces/actions";
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
      icon: <GitPullRequest className="size-3" />,
      closable: true,
    };
  }

  return {
    id: workspace.id,
    label: repoLabel(workspace.repoPath),
    context: repoParentPath(workspace.repoPath),
    icon: <Folder className="size-3" />,
    closable: true,
  };
}

export function WorkspaceTabBar({ onOpenWorkspaces }: WorkspaceTabBarProps) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const locations = useAppSelector((state) => state.workspaces.locations);
  const workspaces = useAppSelector(selectWorkspaces);
  const activeWorkspaceId = useAppSelector(selectActiveWorkspaceId);

  for (const hotkey of WORKSPACE_HOTKEYS) {
    useHotkey(
      `Mod+${hotkey}` as Hotkey,
      () => {
        const target = workspaces[hotkey - 1];
        if (target) {
          activate(target.id);
        }
      },
      { preventDefault: true },
    );
  }

  function activate(id: string) {
    dispatch(selectWorkspace(id));
    const workspace = workspaces.find((item) => item.id === id);
    if (workspace) navigate(locations[id] ?? workspacePath(workspace));
  }

  function close(id: string) {
    dispatch(closeWorkspace(id));
  }

  return (
    <WorkspaceTabs
      className="app-no-drag border-b-0 bg-transparent"
      ariaLabel="Open workspaces"
      addLabel="Open project or pull request"
      items={workspaces.map((workspace) => workspaceTabFor(workspace))}
      activeId={activeWorkspaceId}
      onActivate={activate}
      onClose={close}
      onAdd={onOpenWorkspaces}
    />
  );
}
