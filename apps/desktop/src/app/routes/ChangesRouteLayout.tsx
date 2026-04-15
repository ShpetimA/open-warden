import { Outlet } from "react-router";

import { useAppSelector } from "@/app/hooks";
import { ResizableSidebarLayout } from "@/components/layout/ResizableSidebarLayout";
import { useGetGitSnapshotQuery } from "@/features/source-control/api";
import { ChangesSidebar } from "@/features/source-control/components/SourceControlSidebar";

export function ChangesRouteLayout() {
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo);
  const { activeBranch } = useGetGitSnapshotQuery(activeRepo, {
    skip: !activeRepo,
    selectFromResult: ({ data }) => ({
      activeBranch: data?.branch ?? "",
    }),
  });

  return (
    <ResizableSidebarLayout
      panelId="primary"
      sidebarDefaultSize={22}
      sidebarMinSize={14}
      sidebarMaxSize={34}
      sidebar={<ChangesSidebar activeBranch={activeBranch} />}
      content={
        <main className="h-full min-h-0">
          <Outlet />
        </main>
      }
    />
  );
}
