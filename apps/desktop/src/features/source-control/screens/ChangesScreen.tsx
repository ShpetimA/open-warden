import { useAppSelector } from "@/app/hooks";
import { ResizableSidebarLayout } from "@/components/layout/ResizableSidebarLayout";
import { ChangesCodeViewDiffPane } from "@/features/source-control/components/ChangesCodeViewDiffPane";
import { ChangesSidebar } from "@/features/source-control/components/ChangesSidebar";
import { MergeConflictViewer } from "@/features/source-control/components/MergeConflictViewer";
import { RepoActionErrorDialog } from "@/features/source-control/components/RepoActionErrorDialog";
import { useChangesKeyboardNav } from "@/features/source-control/hooks/useChangesKeyboardNav";
import { useChangesSync } from "@/features/source-control/hooks/useChangesSync";
import { useGetGitSnapshotQuery } from "@/features/source-control/api";

export function ChangesScreen() {
  useChangesKeyboardNav("changes");
  useChangesSync();

  return (
    <>
      <ResizableSidebarLayout
        panelId="primary"
        sidebarDefaultSize={22}
        sidebarMinSize={14}
        sidebarMaxSize={34}
        sidebar={<ChangesSidebar />}
        content={<ChangesDiffPane />}
      />
      <RepoActionErrorDialog />
    </>
  );
}

function ChangesDiffPane() {
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo);
  const activePath = useAppSelector((state) => state.sourceControl.activePath);

  const { data: snapshot, isLoading } = useGetGitSnapshotQuery(activeRepo ?? "", {
    skip: !activeRepo,
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });

  const isMergeConflict =
    activePath &&
    (snapshot?.unstaged.some((file) => file.path === activePath && file.status === "unmerged") ??
      false);

  return (
    <div className="grid h-full min-h-0 min-w-0">
      <section className="flex h-full min-h-0 min-w-0 flex-col">
        <div className="min-h-0 min-w-0 flex-1">
          {!activeRepo ? (
            <div className="text-muted-foreground p-3 text-sm">Select a repository.</div>
          ) : isLoading || !snapshot ? (
            <div className="text-muted-foreground p-3 text-sm">Loading changes...</div>
          ) : isMergeConflict ? (
            <div className="flex h-full min-h-0 min-w-0 flex-col">
              <MergeConflictViewer repoPath={activeRepo} relPath={activePath} />
            </div>
          ) : (
            <ChangesCodeViewDiffPane activeRepo={activeRepo} snapshot={snapshot} />
          )}
        </div>
      </section>
    </div>
  );
}
