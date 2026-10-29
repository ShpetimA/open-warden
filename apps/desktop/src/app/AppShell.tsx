import { GuidanceNavigation } from "@/features/guidance/GuidanceNavigation";
import { WorkspaceChrome } from "@/components/layout/WorkspaceChrome";
import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import { useAppNavigationHotkeys } from "./useAppNavigationHotkeys";

import { AppHeader } from "@/app/AppHeader";
import { NuqsAdapter } from "nuqs/adapters/react-router/v7";
import { featureKeyFromPath } from "@/app/featureNavigation";
import { SidebarPanelRegistryProvider } from "@/components/layout/SidebarPanelRegistry";
import { AppCommandPalette } from "@/features/command-palette/AppCommandPalette";
import { CommandComposerLauncherProvider } from "@/features/command-palette/CommandComposerLauncher";
import type { ComposerAction } from "@/features/command-palette/commandComposerModel";
import type { PullRequestSummary } from "@/platform/desktop/contracts";
import { WorkspaceContent } from "@/features/workspaces/components/WorkspaceContent";
import { WorkspaceNavigation } from "@/features/workspaces/components/WorkspaceNavigation";
import { WorkspaceRail } from "@/features/workspaces/components/WorkspaceRail";
import { FileQuickOpen } from "@/features/source-control/components/FileQuickOpen";

export type AppShellOutletContext = {
  openRepositoryComposer: () => void;
};

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [fileQuickOpen, setFileQuickOpen] = useState(false);
  const [composerInitialAction, setComposerInitialAction] = useState<ComposerAction | null>(null);
  const [composerInitialPullRequest, setComposerInitialPullRequest] =
    useState<PullRequestSummary | null>(null);
  const isSettingsRoute = location.pathname.startsWith("/settings");
  const activeFeature = isSettingsRoute ? null : featureKeyFromPath(location.pathname);

  const openRepositoryComposer = () => {
    openComposer("open-repository");
  };

  const openComposer = (action?: ComposerAction, pullRequest?: PullRequestSummary) => {
    setFileQuickOpen(false);
    setComposerInitialAction(action ?? null);
    setComposerInitialPullRequest(pullRequest ?? null);
    setCommandPaletteOpen(true);
  };

  useAppNavigationHotkeys({
    openProject: openRepositoryComposer,
    openSettings: () => {
      setCommandPaletteOpen(false);
      navigate("/settings");
    },
  });

  return (
    <NuqsAdapter>
      <SidebarPanelRegistryProvider>
        <CommandComposerLauncherProvider open={openComposer}>
          <div className="bg-background text-foreground h-screen w-screen overflow-hidden">
            <HotkeysProvider
              defaultOptions={{ hotkey: { enabled: !commandPaletteOpen && !fileQuickOpen } }}
            >
              <WorkspaceNavigation />
              <GuidanceNavigation />
              <WorkspaceChrome
                header={
                  <AppHeader
                    activeFeature={activeFeature}
                    currentPath={location.pathname}
                    showWorkspaceTabs
                    onOpenWorkspaces={openRepositoryComposer}
                    onOpenCommandPalette={() => openComposer()}
                  />
                }
                rail={
                  !isSettingsRoute && location.pathname !== "/repository-setup" ? (
                    <WorkspaceRail />
                  ) : null
                }
              >
                <WorkspaceContent>
                  <Outlet context={{ openRepositoryComposer }} />
                </WorkspaceContent>
              </WorkspaceChrome>
            </HotkeysProvider>

            <AppCommandPalette
              open={commandPaletteOpen}
              initialAction={composerInitialAction}
              initialPullRequest={composerInitialPullRequest}
              onOpenChange={(open) => {
                if (open) setFileQuickOpen(false);
                if (!open) {
                  setComposerInitialAction(null);
                  setComposerInitialPullRequest(null);
                }
                setCommandPaletteOpen(open);
              }}
            />
            <FileQuickOpen
              open={fileQuickOpen}
              onOpenChange={(open) => {
                if (open) setCommandPaletteOpen(false);
                setFileQuickOpen(open);
              }}
            />
          </div>
          <div id="modal-root" />
        </CommandComposerLauncherProvider>
      </SidebarPanelRegistryProvider>
    </NuqsAdapter>
  );
}
