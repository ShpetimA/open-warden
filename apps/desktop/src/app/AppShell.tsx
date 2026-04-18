import { useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import { useHotkey } from "@tanstack/react-hotkeys";

import { AppHeader } from "@/app/AppHeader";
import { NuqsAdapter } from "nuqs/adapters/react-router/v7";
import { featureKeyFromPath } from "@/app/featureNavigation";
import { RepoTabs } from "@/app/RepoTabs";
import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { SidebarPanelRegistryProvider } from "@/components/layout/SidebarPanelRegistry";
import { AppCommandPalette } from "@/features/command-palette/AppCommandPalette";
import { closeRepo, openRepo, selectFolder, selectRepo } from "@/features/source-control/actions";
import { RecentProjectsPicker } from "@/features/source-control/RecentProjectsPicker";

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
        <div className="bg-background text-foreground h-screen w-screen overflow-hidden">
          <div className="grid h-full" style={{ gridTemplateRows: "56px 1fr 34px" }}>
            <AppHeader
              activeFeature={activeFeature}
              currentPath={location.pathname}
              onOpenCommandPalette={() => {
                setCommandPaletteOpen(true);
              }}
            />

            <div className="relative min-h-0">
              <Outlet context={{ openRecentProjectsPicker }} />
            </div>

            <RepoTabsContainer
              currentPath={location.pathname}
              onShowRecentProjects={openRecentProjectsPicker}
            />
          </div>

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
      </SidebarPanelRegistryProvider>
    </NuqsAdapter>
  );
}

type RepoTabsContainerProps = {
  currentPath: string;
  onShowRecentProjects: () => void;
};

function RepoTabsContainer({ currentPath, onShowRecentProjects }: RepoTabsContainerProps) {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const repos = useAppSelector((state) => state.sourceControl.repos);
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo);
  const recentRepos = useAppSelector((state) => state.sourceControl.recentRepos);

  function navigateToChangesAfterRepoSwitch(switchingRepo: boolean) {
    if (!switchingRepo) {
      return;
    }

    if (currentPath === "/changes") {
      return;
    }

    navigate("/changes", { replace: true });
  }

  return (
    <RepoTabs
      repos={repos}
      activeRepo={activeRepo}
      recentRepos={recentRepos}
      onSelectRepo={(repo) => {
        const switchingRepo = repo !== activeRepo;
        void dispatch(selectRepo(repo));
        navigateToChangesAfterRepoSwitch(switchingRepo);
      }}
      onCloseRepo={(repo) => {
        void dispatch(closeRepo(repo)).then((result) => {
          if (result.closedActiveRepo && currentPath !== "/changes") {
            navigate("/changes", { replace: true });
          }
        });
      }}
      onOpenRecentRepo={(repo) => {
        const switchingRepo = repo !== activeRepo;
        void dispatch(openRepo(repo)).then(() => {
          navigateToChangesAfterRepoSwitch(switchingRepo);
        });
      }}
      onShowAllRecentProjects={onShowRecentProjects}
      onOpenFolder={() => {
        void dispatch(selectFolder());
      }}
    />
  );
}
