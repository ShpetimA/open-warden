import { WorkspaceChrome } from "@/components/layout/WorkspaceChrome";
import { useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import { useHotkey } from "@tanstack/react-hotkeys";

import { AppHeader } from "@/app/AppHeader";
import { NuqsAdapter } from "nuqs/adapters/react-router/v7";
import { featureKeyFromPath } from "@/app/featureNavigation";
import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { SidebarPanelRegistryProvider } from "@/components/layout/SidebarPanelRegistry";
import { AppCommandPalette } from "@/features/command-palette/AppCommandPalette";
import { openRepo, selectFolder } from "@/features/source-control/actions";
import { RecentProjectsPicker } from "@/features/source-control/RecentProjectsPicker";
import { WorkspaceContent } from "@/features/workspaces/components/WorkspaceContent";
import { WorkspaceNavigation } from "@/features/workspaces/components/WorkspaceNavigation";
import { WorkspaceRail } from "@/features/workspaces/components/WorkspaceRail";

export type AppShellOutletContext = {
  openRecentProjectsPicker: () => void;
};

export function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useAppDispatch();
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo);
  const recentRepos = useAppSelector((state) => state.sourceControl.recentRepos);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [recentProjectsPickerOpen, setRecentProjectsPickerOpen] = useState(false);
  const isSettingsRoute = location.pathname.startsWith("/settings");
  const activeFeature = isSettingsRoute ? null : featureKeyFromPath(location.pathname);

  const openRecentProjectsPicker = () => {
    setRecentProjectsPickerOpen(true);
  };

  function navigateToChangesAfterRepoSwitch(switchingRepo: boolean) {
    if (!switchingRepo) {
      return;
    }

    if (location.pathname === "/changes") {
      return;
    }

    navigate("/changes", { replace: true });
  }

  useHotkey(
    "Mod+O",
    (event) => {
      event.preventDefault();
      openRecentProjectsPicker();
    },
    {
      ignoreInputs: false,
      preventDefault: false,
      stopPropagation: false,
    },
  );

  return (
    <NuqsAdapter>
      <SidebarPanelRegistryProvider>
        <WorkspaceNavigation />
        <div className="bg-background text-foreground h-screen w-screen overflow-hidden">
          <WorkspaceChrome
            header={
              <AppHeader
                activeFeature={activeFeature}
                currentPath={location.pathname}
                showWorkspaceTabs
                onOpenWorkspaces={openRecentProjectsPicker}
                onOpenCommandPalette={() => {
                  setCommandPaletteOpen(true);
                }}
              />
            }
            rail={!isSettingsRoute ? <WorkspaceRail /> : null}
          >
            <WorkspaceContent>
              <Outlet context={{ openRecentProjectsPicker }} />
            </WorkspaceContent>
          </WorkspaceChrome>

          <RecentProjectsPicker
            open={recentProjectsPickerOpen}
            activeRepo={activeRepo}
            recentRepos={recentRepos}
            onOpenChange={setRecentProjectsPickerOpen}
            onSelectRepo={(repoPath) => {
              const switchingRepo = repoPath !== activeRepo;
              void dispatch(openRepo(repoPath)).then(() => {
                navigateToChangesAfterRepoSwitch(switchingRepo);
              });
            }}
            onChooseFolder={() => {
              void dispatch(selectFolder());
            }}
          />
          <AppCommandPalette open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen} />
        </div>
        <div id="modal-root" />
      </SidebarPanelRegistryProvider>
    </NuqsAdapter>
  );
}
