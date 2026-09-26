import { WorkspaceChrome } from "@/components/layout/WorkspaceChrome";
import { useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import { useAppNavigationHotkeys } from "./useAppNavigationHotkeys";

import { AppHeader } from "@/app/AppHeader";
import { NuqsAdapter } from "nuqs/adapters/react-router/v7";
import { featureKeyFromPath } from "@/app/featureNavigation";
import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { SidebarPanelRegistryProvider } from "@/components/layout/SidebarPanelRegistry";
import { AppCommandPalette } from "@/features/command-palette/AppCommandPalette";
import { CommandComposerLauncherProvider } from "@/features/command-palette/CommandComposerLauncher";
import type { ComposerAction } from "@/features/command-palette/commandComposerModel";
import { openRepo, selectFolder } from "@/features/source-control/actions";
import { RecentProjectsPicker } from "@/features/source-control/RecentProjectsPicker";
import { WorkspaceContent } from "@/features/workspaces/components/WorkspaceContent";
import { WorkspaceNavigation } from "@/features/workspaces/components/WorkspaceNavigation";
import { WorkspaceRail } from "@/features/workspaces/components/WorkspaceRail";

export type AppShellOutletContext = {
  openRecentProjectsPicker: () => void;
};

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo);
  const recentRepos = useAppSelector((state) => state.sourceControl.recentRepos);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [composerInitialAction, setComposerInitialAction] = useState<ComposerAction | null>(null);
  const [recentProjectsPickerOpen, setRecentProjectsPickerOpen] = useState(false);
  const isSettingsRoute = location.pathname.startsWith("/settings");
  const activeFeature = isSettingsRoute ? null : featureKeyFromPath(location.pathname);

  const openRecentProjectsPicker = () => {
    setCommandPaletteOpen(false);
    setRecentProjectsPickerOpen(true);
  };

  const openComposer = (action?: ComposerAction) => {
    setComposerInitialAction(action ?? null);
    setRecentProjectsPickerOpen(false);
    setCommandPaletteOpen(true);
  };

  useAppNavigationHotkeys({
    openProject: openRecentProjectsPicker,
    openSettings: () => {
      setRecentProjectsPickerOpen(false);
      setCommandPaletteOpen(false);
      navigate("/settings");
    },
  });

  return (
    <NuqsAdapter>
      <SidebarPanelRegistryProvider>
        <CommandComposerLauncherProvider open={openComposer}>
          <WorkspaceNavigation />
          <div className="bg-background text-foreground h-screen w-screen overflow-hidden">
            <WorkspaceChrome
              header={
                <AppHeader
                  activeFeature={activeFeature}
                  currentPath={location.pathname}
                  showWorkspaceTabs
                  onOpenWorkspaces={openRecentProjectsPicker}
                  onOpenCommandPalette={() => openComposer()}
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
              onSelectRepo={(repoPath) => dispatch(openRepo(repoPath))}
              onChooseFolder={() => {
                void dispatch(selectFolder());
              }}
            />
            <AppCommandPalette
              open={commandPaletteOpen}
              initialAction={composerInitialAction}
              onOpenChange={(open) => {
                if (open) setRecentProjectsPickerOpen(false);
                if (!open) setComposerInitialAction(null);
                setCommandPaletteOpen(open);
              }}
            />
          </div>
          <div id="modal-root" />
        </CommandComposerLauncherProvider>
      </SidebarPanelRegistryProvider>
    </NuqsAdapter>
  );
}
