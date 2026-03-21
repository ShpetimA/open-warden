import { useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import { ArrowUpRight, FolderOpen } from "lucide-react";
import { useHotkey } from "@tanstack/react-hotkeys";

import { AppHeader } from "@/app/AppHeader";
import { featureHasPrimarySidebar, featureKeyFromPath } from "@/app/featureNavigation";
import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { ResizableSidebarLayout } from "@/components/layout/ResizableSidebarLayout";
import { SidebarPanelRegistryProvider } from "@/components/layout/SidebarPanelRegistry";
import { AppCommandPalette } from "@/features/command-palette/AppCommandPalette";

import { RepoTabs } from "@/app/RepoTabs";
import { useGetGitSnapshotQuery } from "@/features/source-control/api";
import { closeRepo, openRepo, selectFolder, selectRepo } from "@/features/source-control/actions";
import { SourceControlSidebar } from "@/features/source-control/components/SourceControlSidebar";
import { RecentProjectsPicker } from "@/features/source-control/RecentProjectsPicker";
import { errorMessageFrom } from "@/features/source-control/shared-utils/errorMessage";
import { repoLabel, repoParentPath } from "@/features/source-control/utils";

type EmptyRepoStateProps = {
  recentRepos: string[];
  onOpenPicker: () => void;
  onOpenRepo: (repo: string) => void;
};

function EmptyRepoState({ recentRepos, onOpenPicker, onOpenRepo }: EmptyRepoStateProps) {
  const previewRecentRepos = recentRepos.slice(0, 5);

  return (
    <div className="flex h-full items-center justify-center px-6">
      <div className="w-full max-w-[720px]">
        <div className="space-y-6">
          <div className="space-y-1.5">
            <div className="text-foreground text-[22px] font-semibold tracking-[-0.03em]">
              Open project
            </div>
            <p className="text-muted-foreground max-w-[480px] text-sm leading-6">
              Resume a recent repository or choose a folder to start working immediately.
            </p>
          </div>

          <button
            type="button"
            className="border-border/70 bg-surface-alt hover:bg-accent/45 group flex min-h-20 w-full max-w-[280px] items-center justify-between rounded-2xl border px-4 py-3 text-left transition-[transform,background-color,border-color] duration-150 ease-[var(--ease-out)] active:scale-[0.99]"
            onClick={onOpenPicker}
          >
            <div className="space-y-2">
              <div className="bg-background text-muted-foreground flex h-9 w-9 items-center justify-center rounded-xl border border-white/8">
                <FolderOpen className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-medium">Open project</div>
                <div className="text-muted-foreground text-xs">
                  Browse recent or choose a folder
                </div>
              </div>
            </div>
            <ArrowUpRight className="text-muted-foreground h-4 w-4 transition-transform duration-150 ease-[var(--ease-out)] group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </button>

          <div className="max-w-[720px]">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-muted-foreground text-xs font-medium tracking-[0.14em] uppercase">
                Recent Projects
              </div>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground text-sm transition-colors"
                onClick={onOpenPicker}
              >
                View all ({recentRepos.length})
              </button>
            </div>

            {previewRecentRepos.length > 0 ? (
              <div className="space-y-1">
                {previewRecentRepos.map((repoPath) => (
                  <button
                    key={repoPath}
                    type="button"
                    className="hover:bg-accent/40 grid w-full grid-cols-[minmax(0,1fr)_minmax(0,280px)] items-center gap-4 rounded-xl px-3 py-2 text-left transition-[transform,background-color] duration-150 ease-[var(--ease-out)] active:scale-[0.995]"
                    onClick={() => onOpenRepo(repoPath)}
                  >
                    <span className="truncate text-[15px] font-medium">{repoLabel(repoPath)}</span>
                    <span className="text-muted-foreground truncate text-sm text-right">
                      {repoParentPath(repoPath)}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <button
                type="button"
                className="border-border/70 text-muted-foreground hover:text-foreground hover:bg-accent/35 inline-flex h-11 items-center rounded-xl border px-3 text-sm transition-[transform,background-color] duration-150 ease-[var(--ease-out)] active:scale-[0.99]"
                onClick={onOpenPicker}
              >
                Open a folder to start building your recent list.
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function renderMainContent(
  activeRepo: string,
  errorMessage: string,
  recentRepos: string[],
  onOpenPicker: () => void,
  onOpenRepo: (repo: string) => void,
) {
  if (errorMessage) {
    return <div className="text-destructive p-3 text-sm">{errorMessage}</div>;
  }

  if (!activeRepo) {
    return (
      <EmptyRepoState
        recentRepos={recentRepos}
        onOpenPicker={onOpenPicker}
        onOpenRepo={onOpenRepo}
      />
    );
  }

  return <Outlet />;
}

export function AppShell() {
  const location = useLocation();
  const dispatch = useAppDispatch();
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo);
  const recentRepos = useAppSelector((state) => state.sourceControl.recentRepos);
  const stateError = useAppSelector((state) => state.sourceControl.error);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [recentProjectsPickerOpen, setRecentProjectsPickerOpen] = useState(false);
  const activeFeature = featureKeyFromPath(location.pathname);
  const showPrimarySidebar = featureHasPrimarySidebar(activeFeature);
  const sidebarFeature = activeFeature === "history" ? "history" : "changes";
  const { snapshotError, activeBranch: activeBranchData } = useGetGitSnapshotQuery(activeRepo, {
    skip: !activeRepo,
    selectFromResult: ({ error, data }) => ({
      snapshotError: error,
      activeBranch: data?.branch ?? "",
    }),
  });
  const activeBranch = activeRepo ? activeBranchData : "";
  const errorMessage = errorMessageFrom(snapshotError, stateError);

  useHotkey(
    "Mod+O",
    (event) => {
      event.preventDefault();
      setRecentProjectsPickerOpen(true);
    },
    {
      ignoreInputs: false,
      preventDefault: false,
      stopPropagation: false,
    },
  );

  const mainContent = renderMainContent(
    activeRepo,
    errorMessage,
    recentRepos,
    () => {
      setRecentProjectsPickerOpen(true);
    },
    (repo) => {
      void dispatch(openRepo(repo));
    },
  );

  return (
    <SidebarPanelRegistryProvider>
      <div className="bg-background text-foreground h-screen w-screen overflow-hidden">
        <div className="grid h-full" style={{ gridTemplateRows: "56px 1fr 34px" }}>
          <AppHeader
            activeFeature={activeFeature}
            onOpenCommandPalette={() => {
              setCommandPaletteOpen(true);
            }}
          />

          <div className="relative min-h-0">
            {showPrimarySidebar ? (
              <ResizableSidebarLayout
                panelId="primary"
                sidebarDefaultSize={22}
                sidebarMinSize={14}
                sidebarMaxSize={34}
                sidebar={
                  <SourceControlSidebar feature={sidebarFeature} activeBranch={activeBranch} />
                }
                content={<main className="h-full min-h-0">{mainContent}</main>}
              />
            ) : (
              <main className="h-full min-h-0">{mainContent}</main>
            )}
          </div>

          <RepoTabsContainer
            currentPath={location.pathname}
            onShowRecentProjects={() => {
              setRecentProjectsPickerOpen(true);
            }}
          />
        </div>

        <RecentProjectsPicker
          open={recentProjectsPickerOpen}
          activeRepo={activeRepo}
          recentRepos={recentRepos}
          onOpenChange={setRecentProjectsPickerOpen}
          onSelectRepo={(repoPath) => {
            void dispatch(openRepo(repoPath));
          }}
          onChooseFolder={() => {
            void dispatch(selectFolder());
          }}
        />
        <AppCommandPalette open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen} />
      </div>
    </SidebarPanelRegistryProvider>
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

  return (
    <RepoTabs
      repos={repos}
      activeRepo={activeRepo}
      recentRepos={recentRepos}
      onSelectRepo={(repo) => {
        void dispatch(selectRepo(repo));
      }}
      onCloseRepo={(repo) => {
        void dispatch(closeRepo(repo)).then((result) => {
          if (result.closedActiveRepo && currentPath !== "/changes") {
            navigate("/changes", { replace: true });
          }
        });
      }}
      onOpenRecentRepo={(repo) => {
        void dispatch(openRepo(repo));
      }}
      onShowAllRecentProjects={onShowRecentProjects}
      onOpenFolder={() => {
        void dispatch(selectFolder());
      }}
    />
  );
}
